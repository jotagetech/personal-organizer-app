-- Checklist diário de hábitos: templates recorrentes (routine_items) e os
-- registros por data (routine_day_entries), criados só sob demanda (quando
-- algo é marcado ou um item avulso é adicionado), sem job de materialização
-- diária. Ausência de linha em routine_day_entries para um template numa
-- data significa "não feito", nunca precisa ser criada com antecedência.
--
-- Regra de aplicação de um template numa data d: o dia da semana de d está
-- em weekdays, active_from <= d, e (archived_on é nulo ou archived_on > d).
-- Editar os dias da semana ou arquivar um item vale também retroativamente
-- para o passado, sem versionamento do histórico de templates.
create table routine_items (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    title text not null check (length(trim(title)) > 0),
    weekdays text[] not null check (
        cardinality(weekdays) > 0
        and weekdays <@ array['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo']::text[]
    ),
    link_kind text check (
        link_kind in (
            'workout_finished', 'meal:cafe_da_manha', 'meal:almoco', 'meal:lanche',
            'meal:jantar', 'body_weight', 'sleep'
        )
    ),
    sort_order integer not null default 0,
    active_from date not null default current_date,
    archived_on date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (archived_on is null or archived_on >= active_from)
);

create index routine_items_user_id_idx on routine_items (user_id);

create table routine_day_entries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    entry_date date not null,
    routine_item_id uuid references routine_items (id) on delete cascade,
    title text check (title is null or length(trim(title)) > 0),
    completed_at timestamptz,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check ((routine_item_id is null) <> (title is null))
);

create unique index routine_day_entries_item_per_day_idx
    on routine_day_entries (user_id, routine_item_id, entry_date)
    where routine_item_id is not null;
create index routine_day_entries_user_date_idx on routine_day_entries (user_id, entry_date);

create trigger routine_items_touch_updated_at
    before update on routine_items
    for each row execute function touch_updated_at();

create trigger routine_day_entries_touch_updated_at
    before update on routine_day_entries
    for each row execute function touch_updated_at();

-- Garante que o template referenciado (quando houver) pertença ao mesmo
-- usuário, no mesmo molde de check_cardio_entry_activity_ownership.
create function check_routine_day_entry_item_ownership() returns trigger as $$
begin
    if new.routine_item_id is null then
        return new;
    end if;

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

alter table routine_items enable row level security;
alter table routine_day_entries enable row level security;

create policy routine_items_select_own on routine_items
    for select using (user_id = auth.uid());
create policy routine_items_insert_own on routine_items
    for insert with check (user_id = auth.uid());
create policy routine_items_update_own on routine_items
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy routine_items_delete_own on routine_items
    for delete using (user_id = auth.uid());

create policy routine_day_entries_select_own on routine_day_entries
    for select using (user_id = auth.uid());
create policy routine_day_entries_insert_own on routine_day_entries
    for insert with check (user_id = auth.uid());
create policy routine_day_entries_update_own on routine_day_entries
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy routine_day_entries_delete_own on routine_day_entries
    for delete using (user_id = auth.uid());

grant select, insert, update, delete on routine_items to authenticated;
grant select, insert, update, delete on routine_day_entries to authenticated;
