-- Notificação Web Push no fim do descanso entre séries. Com a tela bloqueada
-- o iPhone congela o JavaScript da página, então quem dispara o aviso no
-- horário certo é o servidor: o aparelho grava aqui quando o descanso acaba e
-- a Edge Function send-due-pushes envia o push quando a hora chega.
--
-- push_subscriptions guarda uma linha por aparelho (endpoint do navegador) e
-- scheduled_pushes guarda no máximo um push pendente por usuário e tipo, então
-- agendar, remarcar e cancelar são um upsert ou um delete simples. sent_at
-- nulo é pendente; a função preenche sent_at antes de enviar, e um novo
-- agendamento volta sent_at para nulo.
--
-- Aditivo e seguro para rodar de novo: tabelas, índices e função só são
-- criados quando faltam, e as policies são recriadas com o mesmo conteúdo.

create table if not exists push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    endpoint text not null unique check (length(endpoint) > 0),
    p256dh text not null check (length(p256dh) > 0),
    auth text not null check (length(auth) > 0),
    user_agent text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on push_subscriptions (user_id);

create table if not exists scheduled_pushes (
    user_id uuid not null references auth.users (id) on delete cascade,
    kind text not null check (kind in ('descanso')),
    fire_at timestamptz not null,
    title text not null check (length(trim(title)) > 0),
    body text not null default '',
    sent_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, kind)
);

-- A busca da função (pendentes já vencidos) roda a cada poucos segundos.
create index if not exists scheduled_pushes_pending_fire_at_idx
    on scheduled_pushes (fire_at)
    where sent_at is null;

drop trigger if exists push_subscriptions_touch_updated_at on push_subscriptions;
create trigger push_subscriptions_touch_updated_at
    before update on push_subscriptions
    for each row execute function touch_updated_at();

drop trigger if exists scheduled_pushes_touch_updated_at on scheduled_pushes;
create trigger scheduled_pushes_touch_updated_at
    before update on scheduled_pushes
    for each row execute function touch_updated_at();

alter table push_subscriptions enable row level security;
alter table scheduled_pushes enable row level security;

drop policy if exists push_subscriptions_select_own on push_subscriptions;
drop policy if exists push_subscriptions_insert_own on push_subscriptions;
drop policy if exists push_subscriptions_update_own on push_subscriptions;
drop policy if exists push_subscriptions_delete_own on push_subscriptions;

create policy push_subscriptions_select_own on push_subscriptions
    for select using (user_id = auth.uid());
create policy push_subscriptions_insert_own on push_subscriptions
    for insert with check (user_id = auth.uid());
create policy push_subscriptions_update_own on push_subscriptions
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subscriptions_delete_own on push_subscriptions
    for delete using (user_id = auth.uid());

drop policy if exists scheduled_pushes_select_own on scheduled_pushes;
drop policy if exists scheduled_pushes_insert_own on scheduled_pushes;
drop policy if exists scheduled_pushes_update_own on scheduled_pushes;
drop policy if exists scheduled_pushes_delete_own on scheduled_pushes;

create policy scheduled_pushes_select_own on scheduled_pushes
    for select using (user_id = auth.uid());
create policy scheduled_pushes_insert_own on scheduled_pushes
    for insert with check (user_id = auth.uid());
create policy scheduled_pushes_update_own on scheduled_pushes
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy scheduled_pushes_delete_own on scheduled_pushes
    for delete using (user_id = auth.uid());

grant select, insert, update, delete on push_subscriptions to authenticated;
grant select, insert, update, delete on scheduled_pushes to authenticated;

-- O mesmo aparelho pode trocar de conta: o endpoint é único, e a linha de
-- outro usuário não é visível pela RLS, então um upsert comum falharia. A
-- função passa o endpoint para quem ativou por último, sempre com auth.uid(),
-- nunca com um usuário vindo do cliente.
create or replace function register_push_subscription(
    p_endpoint text,
    p_p256dh text,
    p_auth text,
    p_user_agent text
) returns void as $$
declare
    v_user_id uuid := auth.uid();
begin
    if v_user_id is null then
        raise exception 'usuário não autenticado';
    end if;

    insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    values (v_user_id, p_endpoint, p_p256dh, p_auth, p_user_agent)
    on conflict (endpoint) do update
        set user_id = excluded.user_id,
            p256dh = excluded.p256dh,
            auth = excluded.auth,
            user_agent = excluded.user_agent;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function register_push_subscription(text, text, text, text) from public, anon;
grant execute on function register_push_subscription(text, text, text, text) to authenticated;
