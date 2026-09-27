-- Finalização de treino (sentimento) e registro de cardio/outras atividades.
alter table workout_sessions
    add column finished_at timestamptz,
    add column feeling_scale smallint check (feeling_scale between 1 and 5),
    add column feeling_note text;

create table cardio_activity_types (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    name text not null check (length(trim(name)) > 0),
    created_at timestamptz not null default now(),
    unique (user_id, name)
);

create table cardio_entries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    entry_date date not null,
    activity_type_id uuid not null references cardio_activity_types (id),
    duration_minutes integer not null check (duration_minutes > 0),
    distance_km numeric(6, 2) check (distance_km is null or distance_km > 0),
    feeling_scale smallint not null check (feeling_scale between 1 and 5),
    feeling_note text,
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index cardio_entries_user_id_entry_date_idx on cardio_entries (user_id, entry_date);

create trigger cardio_entries_touch_updated_at
    before update on cardio_entries
    for each row execute function touch_updated_at();

-- Garante que o tipo de atividade referenciado pertença ao mesmo usuário.
create function check_cardio_entry_activity_ownership() returns trigger as $$
begin
    if not exists (
        select 1 from cardio_activity_types
        where id = new.activity_type_id and user_id = new.user_id
    ) then
        raise exception 'activity_type_id não pertence ao usuário';
    end if;

    return new;
end;
$$ language plpgsql;

create trigger cardio_entries_activity_ownership
    before insert or update on cardio_entries
    for each row execute function check_cardio_entry_activity_ownership();

alter table cardio_activity_types enable row level security;
alter table cardio_entries enable row level security;

create policy cardio_activity_types_select_own on cardio_activity_types
    for select using (user_id = auth.uid());
create policy cardio_activity_types_insert_own on cardio_activity_types
    for insert with check (user_id = auth.uid());
create policy cardio_activity_types_delete_own on cardio_activity_types
    for delete using (user_id = auth.uid());

create policy cardio_entries_select_own on cardio_entries
    for select using (user_id = auth.uid());
create policy cardio_entries_insert_own on cardio_entries
    for insert with check (user_id = auth.uid());
create policy cardio_entries_update_own on cardio_entries
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cardio_entries_delete_own on cardio_entries
    for delete using (user_id = auth.uid());

grant select, insert, delete on cardio_activity_types to authenticated;
grant select, insert, update, delete on cardio_entries to authenticated;
