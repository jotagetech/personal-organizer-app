-- Modelo da aba Rotina com categorias, hábitos que repetem por dia da semana
-- ou a cada N dias, agenda versionada por data de vigência e tarefas que não
-- repetem. Substitui routine_items/routine_day_entries do modelo anterior sem
-- aproveitar dados: as tabelas antigas são derrubadas e recriadas vazias.
--
-- Regras:
--
-- 1. Sem categoria é category_id nulo (o app chama de "Geral"); não existe
--    linha para Geral em routine_categories.
-- 2. Um item (hábito ou tarefa que repete) se aplica numa data d quando
--    active_from <= d, (archived_on é nulo ou archived_on > d) e a agenda
--    vigente em d manda: em 'weekdays', o dia da semana de d está em weekdays;
--    em 'interval', d cai na âncora ou num múltiplo de interval_days depois
--    dela, nunca antes.
-- 3. A agenda vigente em d é a versão de routine_item_schedules com o maior
--    effective_from <= d. Mudar a agenda grava uma versão nova a partir de
--    hoje (no fuso da conta), então os dias anteriores continuam resolvendo
--    com a agenda que valia neles. O cliente só lê essa tabela; quem escreve
--    é o gatilho em routine_items.
-- 4. routine_day_entries guarda só a marcação manual de um item numa data.
--    Ausência de linha é "não marcado". Marcar é upsert em
--    (routine_item_id, entry_date); desmarcar é apagar a linha.
-- 5. routine_tasks é a tarefa que não repete: aparece só no scheduled_on
--    (nulo é tarefa sem data). Não existe prazo. carried_from_on é o dia de
--    onde a tarefa foi trazida pela última vez, nulo se nunca foi.

drop table if exists routine_day_entries;
drop table if exists routine_items;

drop function if exists check_routine_day_entry_item_ownership();
drop function if exists sync_routine_day_entry_completed_on();

create table routine_categories (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    name text not null check (length(trim(name)) > 0),
    color text not null check (
        color in ('azul', 'violeta', 'magenta', 'rosa', 'laranja', 'marrom', 'oliva', 'ardosia')
    ),
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index routine_categories_user_name_idx on routine_categories (user_id, lower(trim(name)));

-- As quatro colunas de agenda (repeat_kind, weekdays, interval_days,
-- interval_anchor) andam amarradas: em 'weekdays' só a lista de dias vale,
-- em 'interval' só o intervalo e a âncora. O mesmo check se repete em
-- routine_item_schedules, que guarda cópias delas.
create table routine_items (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    title text not null check (length(trim(title)) > 0),
    link_kind text check (
        link_kind in (
            'workout_finished', 'meal:cafe_da_manha', 'meal:almoco', 'meal:lanche',
            'meal:jantar', 'body_weight', 'sleep'
        )
    ),
    category_id uuid references routine_categories (id) on delete set null,
    is_important boolean not null default false,
    repeat_kind text not null check (repeat_kind in ('weekdays', 'interval')),
    weekdays text[] check (
        weekdays <@ array['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo']::text[]
    ),
    interval_days integer check (interval_days between 1 and 365),
    interval_anchor date,
    active_from date not null,
    archived_on date,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (archived_on is null or archived_on >= active_from),
    check (
        (
            repeat_kind = 'weekdays'
            and weekdays is not null
            and cardinality(weekdays) > 0
            and interval_days is null
            and interval_anchor is null
        )
        or (
            repeat_kind = 'interval'
            and weekdays is null
            and interval_days is not null
            and interval_anchor is not null
        )
    )
);

create index routine_items_user_id_idx on routine_items (user_id);
create index routine_items_category_id_idx on routine_items (category_id);

create table routine_item_schedules (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    routine_item_id uuid not null references routine_items (id) on delete cascade,
    effective_from date not null,
    repeat_kind text not null check (repeat_kind in ('weekdays', 'interval')),
    weekdays text[] check (
        weekdays <@ array['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo']::text[]
    ),
    interval_days integer check (interval_days between 1 and 365),
    interval_anchor date,
    created_at timestamptz not null default now(),
    unique (routine_item_id, effective_from),
    check (
        (
            repeat_kind = 'weekdays'
            and weekdays is not null
            and cardinality(weekdays) > 0
            and interval_days is null
            and interval_anchor is null
        )
        or (
            repeat_kind = 'interval'
            and weekdays is null
            and interval_days is not null
            and interval_anchor is not null
        )
    )
);

create index routine_item_schedules_user_id_idx on routine_item_schedules (user_id);

create table routine_day_entries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    routine_item_id uuid not null references routine_items (id) on delete cascade,
    entry_date date not null,
    completed_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    constraint routine_day_entries_item_date_key unique (routine_item_id, entry_date)
);

create index routine_day_entries_user_date_idx on routine_day_entries (user_id, entry_date);

create table routine_tasks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    title text not null check (length(trim(title)) > 0),
    scheduled_on date,
    carried_from_on date,
    category_id uuid references routine_categories (id) on delete set null,
    is_important boolean not null default false,
    completed_on date,
    completed_at timestamptz,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check ((completed_on is null) = (completed_at is null))
);

create index routine_tasks_user_scheduled_on_idx on routine_tasks (user_id, scheduled_on);
create index routine_tasks_category_id_idx on routine_tasks (category_id);

create trigger routine_categories_touch_updated_at
    before update on routine_categories
    for each row execute function touch_updated_at();

create trigger routine_items_touch_updated_at
    before update on routine_items
    for each row execute function touch_updated_at();

create trigger routine_tasks_touch_updated_at
    before update on routine_tasks
    for each row execute function touch_updated_at();

-- Garante que a categoria referenciada (quando houver) pertença ao mesmo
-- usuário da linha. Serve a routine_items e routine_tasks, que têm as mesmas
-- colunas user_id e category_id.
create function check_routine_category_ownership() returns trigger as $$
begin
    if new.category_id is null then
        return new;
    end if;

    if not exists (
        select 1 from routine_categories
        where id = new.category_id and user_id = new.user_id
    ) then
        raise exception 'category_id não pertence ao usuário';
    end if;

    return new;
end;
$$ language plpgsql;

create trigger routine_items_category_ownership
    before insert or update on routine_items
    for each row execute function check_routine_category_ownership();

create trigger routine_tasks_category_ownership
    before insert or update on routine_tasks
    for each row execute function check_routine_category_ownership();

-- Garante que o item marcado pertença ao mesmo usuário da marcação.
create function check_routine_day_entry_item_ownership() returns trigger as $$
begin
    if not exists (
        select 1 from routine_items
        where id = new.routine_item_id and user_id = new.user_id
    ) then
        raise exception 'routine_item_id não pertence ao usuário';
    end if;

    return new;
end;
$$ language plpgsql;

create trigger routine_day_entries_item_ownership
    before insert or update on routine_day_entries
    for each row execute function check_routine_day_entry_item_ownership();

-- Grava a versão da agenda de um item. Na criação, a versão vale desde
-- active_from. Numa edição, vale a partir de hoje no fuso da conta (ou de
-- active_from, se o item ainda nem começou), para os dias já passados não
-- mudarem. "Hoje" sai do fuso guardado em user_settings e nunca de
-- current_date, que no banco é o dia em UTC. Duas edições no mesmo dia caem
-- na mesma vigência e a segunda substitui a primeira. Roda como dono da
-- tabela porque o cliente não tem permissão de escrever nela.
create function record_routine_item_schedule() returns trigger as $$
declare
    account_today date;
    effective_on date;
begin
    if tg_op = 'INSERT' then
        effective_on := new.active_from;
    else
        account_today := (
            now() at time zone coalesce(
                (select timezone from user_settings where user_id = new.user_id),
                'America/Sao_Paulo'
            )
        )::date;
        effective_on := greatest(new.active_from, account_today);
    end if;

    insert into routine_item_schedules (
        user_id, routine_item_id, effective_from, repeat_kind, weekdays, interval_days, interval_anchor
    )
    values (
        new.user_id, new.id, effective_on, new.repeat_kind, new.weekdays, new.interval_days, new.interval_anchor
    )
    on conflict (routine_item_id, effective_from) do update
    set repeat_kind = excluded.repeat_kind,
        weekdays = excluded.weekdays,
        interval_days = excluded.interval_days,
        interval_anchor = excluded.interval_anchor;

    return null;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function record_routine_item_schedule() from public, anon, authenticated;

create trigger routine_items_record_schedule_insert
    after insert on routine_items
    for each row execute function record_routine_item_schedule();

-- Salvar o formulário sem mexer na agenda (só título ou vínculo, por exemplo)
-- regrava os mesmos valores; sem mudança de fato, nenhuma versão é gravada.
create trigger routine_items_record_schedule_update
    after update on routine_items
    for each row
    when (
        new.repeat_kind is distinct from old.repeat_kind
        or new.weekdays is distinct from old.weekdays
        or new.interval_days is distinct from old.interval_days
        or new.interval_anchor is distinct from old.interval_anchor
    )
    execute function record_routine_item_schedule();

alter table routine_categories enable row level security;
alter table routine_items enable row level security;
alter table routine_item_schedules enable row level security;
alter table routine_day_entries enable row level security;
alter table routine_tasks enable row level security;

create policy routine_categories_select_own on routine_categories
    for select using (user_id = auth.uid());
create policy routine_categories_insert_own on routine_categories
    for insert with check (user_id = auth.uid());
create policy routine_categories_update_own on routine_categories
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy routine_categories_delete_own on routine_categories
    for delete using (user_id = auth.uid());

create policy routine_items_select_own on routine_items
    for select using (user_id = auth.uid());
create policy routine_items_insert_own on routine_items
    for insert with check (user_id = auth.uid());
create policy routine_items_update_own on routine_items
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy routine_items_delete_own on routine_items
    for delete using (user_id = auth.uid());

-- O cliente só lê as versões de agenda; toda escrita vem do gatilho acima,
-- então não existe policy de insert, update ou delete.
create policy routine_item_schedules_select_own on routine_item_schedules
    for select using (user_id = auth.uid());

create policy routine_day_entries_select_own on routine_day_entries
    for select using (user_id = auth.uid());
create policy routine_day_entries_insert_own on routine_day_entries
    for insert with check (user_id = auth.uid());
create policy routine_day_entries_update_own on routine_day_entries
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy routine_day_entries_delete_own on routine_day_entries
    for delete using (user_id = auth.uid());

create policy routine_tasks_select_own on routine_tasks
    for select using (user_id = auth.uid());
create policy routine_tasks_insert_own on routine_tasks
    for insert with check (user_id = auth.uid());
create policy routine_tasks_update_own on routine_tasks
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy routine_tasks_delete_own on routine_tasks
    for delete using (user_id = auth.uid());

grant select, insert, update, delete on routine_categories to authenticated;
grant select, insert, update, delete on routine_items to authenticated;
grant select on routine_item_schedules to authenticated;
grant select, insert, update, delete on routine_day_entries to authenticated;
grant select, insert, update, delete on routine_tasks to authenticated;

alter table user_settings
    add column if not exists routine_sound_enabled boolean not null default true,
    add column if not exists routine_onboarded_at timestamptz;
