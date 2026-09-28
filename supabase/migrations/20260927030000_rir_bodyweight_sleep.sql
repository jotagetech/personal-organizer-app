-- RIR por série, peso corporal e sono, para dar suporte a análise de performance.
alter table workout_sets
    add column rir smallint check (rir between 0 and 10),
    add column note text;

create table body_weight_entries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    entry_date date not null,
    weight_kg numeric(5, 2) not null check (weight_kg > 0),
    created_at timestamptz not null default now(),
    unique (user_id, entry_date)
);

create table sleep_entries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    entry_date date not null,
    hours numeric(4, 2) not null check (hours > 0 and hours <= 24),
    created_at timestamptz not null default now(),
    unique (user_id, entry_date)
);

alter table body_weight_entries enable row level security;
alter table sleep_entries enable row level security;

create policy body_weight_entries_select_own on body_weight_entries
    for select using (user_id = auth.uid());
create policy body_weight_entries_insert_own on body_weight_entries
    for insert with check (user_id = auth.uid());
create policy body_weight_entries_update_own on body_weight_entries
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy body_weight_entries_delete_own on body_weight_entries
    for delete using (user_id = auth.uid());

create policy sleep_entries_select_own on sleep_entries
    for select using (user_id = auth.uid());
create policy sleep_entries_insert_own on sleep_entries
    for insert with check (user_id = auth.uid());
create policy sleep_entries_update_own on sleep_entries
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sleep_entries_delete_own on sleep_entries
    for delete using (user_id = auth.uid());

grant select, insert, update, delete on body_weight_entries to authenticated;
grant select, insert, update, delete on sleep_entries to authenticated;
