-- Histórico de qual plano estava ativo e desde quando. user_settings guarda
-- só o plano ativo de agora; esta tabela guarda cada troca, para a aba de
-- resultados saber qual plano valia em cada dia de um ciclo.
--
-- plan_id usa on delete cascade: o app não apaga plano (sessões antigas
-- apontam para ele e user_settings também), então a única remoção real é a
-- da conta, que leva planos e ativações juntos. Uma ativação sem o plano não
-- teria rótulo para mostrar nem treinos para contar dias planejados.
create table plan_activations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    plan_id uuid not null references workout_plans (id) on delete cascade,
    activated_at timestamptz not null default now(),
    source text not null check (source in ('app', 'backfill'))
);

create index plan_activations_user_id_activated_at_idx on plan_activations (user_id, activated_at);

-- O cliente só lê. Toda escrita vem do gatilho em user_settings (ou do
-- preenchimento abaixo), então não existe policy de insert, update ou delete.
alter table plan_activations enable row level security;

create policy plan_activations_select_own on plan_activations
    for select using (user_id = auth.uid());

grant select on plan_activations to authenticated;

-- Preenchimento do histórico anterior a esta tabela, marcado como backfill
-- porque é uma aproximação:
--
-- 1. Importar um plano (arquivo ou montador) cria a linha e já ativa, então
--    cada plano ganha uma ativação no próprio created_at.
-- 2. Se o plano ativo hoje não é o importado por último, ele foi reativado
--    depois por "Usar este plano", e essa troca não deixou rastro. O primeiro
--    treino criado com ele depois da importação mais recente é o sinal mais
--    cedo de que já estava ativo; sem nenhum treino assim, vale o momento
--    desta migração. A data real da reativação pode ser anterior a essa.
--
-- Reativações intermediárias (voltar a um plano e depois trocar de novo) não
-- aparecem em nenhum dado guardado e ficam de fora.
insert into plan_activations (user_id, plan_id, activated_at, source)
select p.user_id, p.id, p.created_at, 'backfill'
from workout_plans p;

with latest_import as (
    select distinct on (p.user_id) p.user_id, p.id, p.created_at
    from workout_plans p
    order by p.user_id, p.created_at desc, p.id desc
)
insert into plan_activations (user_id, plan_id, activated_at, source)
select s.user_id, s.active_plan_id,
    coalesce(
        (
            select min(ws.created_at)
            from workout_sessions ws
            where ws.user_id = s.user_id
                and ws.plan_id = s.active_plan_id
                and ws.created_at > li.created_at
        ),
        now()
    ),
    'backfill'
from user_settings s
join latest_import li on li.user_id = s.user_id
where s.active_plan_id is not null
    and s.active_plan_id <> li.id;

-- Registra a ativação sempre que o plano ativo passa a ser outro. Roda como
-- dono da tabela porque o cliente não tem permissão de escrever nela.
create function record_plan_activation() returns trigger as $$
begin
    insert into plan_activations (user_id, plan_id, activated_at, source)
    values (new.user_id, new.active_plan_id, now(), 'app');
    return null;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function record_plan_activation() from public, anon, authenticated;

-- Conta nova nasce sem plano ativo; só grava quando a linha já vem com plano.
create trigger user_settings_record_plan_activation_insert
    after insert on user_settings
    for each row
    when (new.active_plan_id is not null)
    execute function record_plan_activation();

-- Reimportar o plano que já está ativo regrava o mesmo valor; sem mudança de
-- fato, nada é gravado.
create trigger user_settings_record_plan_activation_update
    after update of active_plan_id on user_settings
    for each row
    when (new.active_plan_id is not null and new.active_plan_id is distinct from old.active_plan_id)
    execute function record_plan_activation();
