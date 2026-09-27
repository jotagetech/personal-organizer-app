-- Esquema inicial: planos de treino, sessões, séries e consumo alimentar.
create extension if not exists pgcrypto;

create table workout_plans (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    name text not null check (length(trim(name)) > 0),
    schema_version integer not null,
    payload jsonb not null,
    content_hash text not null,
    created_at timestamptz not null default now(),
    unique (user_id, content_hash)
);

create index workout_plans_user_id_idx on workout_plans (user_id);

create table user_settings (
    user_id uuid primary key references auth.users (id) on delete cascade,
    active_plan_id uuid references workout_plans (id),
    timezone text not null default 'America/Sao_Paulo'
);

create table workout_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    session_date date not null,
    plan_id uuid not null references workout_plans (id),
    workout_key text not null,
    workout_snapshot jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, session_date)
);

create table workout_sets (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references workout_sessions (id) on delete cascade,
    exercise_key text not null,
    set_index integer not null,
    load_kg numeric(6, 2) check (load_kg >= 0),
    reps integer check (reps >= 0),
    completed_at timestamptz,
    updated_at timestamptz not null default now(),
    unique (session_id, exercise_key, set_index),
    check (completed_at is null or (load_kg is not null and reps is not null))
);

create table food_entries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    entry_date date not null,
    food_name text not null check (length(trim(food_name)) > 0),
    quantity numeric(8, 2) not null check (quantity > 0),
    unit text not null check (unit in ('g', 'ml', 'unidade', 'porcao', 'colher')),
    meal_category text not null check (
        meal_category in ('cafe_da_manha', 'almoco', 'lanche', 'jantar', 'outros')
    ),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index food_entries_user_id_entry_date_idx on food_entries (user_id, entry_date);

-- Garante que o plano ativo sempre pertença ao mesmo usuário do user_settings.
create function check_active_plan_ownership() returns trigger as $$
begin
    if new.active_plan_id is null then
        return new;
    end if;

    if not exists (
        select 1 from workout_plans
        where id = new.active_plan_id and user_id = new.user_id
    ) then
        raise exception 'active_plan_id não pertence ao usuário';
    end if;

    return new;
end;
$$ language plpgsql;

create trigger user_settings_active_plan_ownership
    before insert or update on user_settings
    for each row execute function check_active_plan_ownership();

create function touch_updated_at() returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger workout_sessions_touch_updated_at
    before update on workout_sessions
    for each row execute function touch_updated_at();

create trigger workout_sets_touch_updated_at
    before update on workout_sets
    for each row execute function touch_updated_at();

create trigger food_entries_touch_updated_at
    before update on food_entries
    for each row execute function touch_updated_at();

-- Importa uma revisão de plano e ativa-a de forma atômica: uma única chamada
-- de função roda inteira em uma transação, então revisão nova + troca do
-- plano ativo nunca ficam meio aplicadas.
create function import_workout_plan(
    p_name text,
    p_schema_version integer,
    p_payload jsonb,
    p_content_hash text
) returns table (plan_id uuid, already_imported boolean) as $$
declare
    v_plan_id uuid;
    v_already_imported boolean;
begin
    select id into v_plan_id
    from workout_plans
    where user_id = auth.uid() and content_hash = p_content_hash;

    v_already_imported := v_plan_id is not null;

    if not v_already_imported then
        insert into workout_plans (user_id, name, schema_version, payload, content_hash)
        values (auth.uid(), p_name, p_schema_version, p_payload, p_content_hash)
        returning id into v_plan_id;
    end if;

    insert into user_settings (user_id, active_plan_id)
    values (auth.uid(), v_plan_id)
    on conflict (user_id) do update set active_plan_id = excluded.active_plan_id;

    return query select v_plan_id, v_already_imported;
end;
$$ language plpgsql security invoker;

-- Cria a configuração padrão do usuário assim que a conta é criada.
create function handle_new_user() returns trigger as $$
begin
    insert into user_settings (user_id) values (new.id);
    return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function handle_new_user();

-- Row Level Security: cada usuário só acessa os próprios dados.
alter table workout_plans enable row level security;
alter table user_settings enable row level security;
alter table workout_sessions enable row level security;
alter table workout_sets enable row level security;
alter table food_entries enable row level security;

create policy workout_plans_select_own on workout_plans
    for select using (user_id = auth.uid());
create policy workout_plans_insert_own on workout_plans
    for insert with check (user_id = auth.uid());

create policy user_settings_select_own on user_settings
    for select using (user_id = auth.uid());
create policy user_settings_insert_own on user_settings
    for insert with check (user_id = auth.uid());
create policy user_settings_update_own on user_settings
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy workout_sessions_select_own on workout_sessions
    for select using (user_id = auth.uid());
create policy workout_sessions_insert_own on workout_sessions
    for insert with check (user_id = auth.uid());
create policy workout_sessions_update_own on workout_sessions
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy workout_sets_select_own on workout_sets
    for select using (
        exists (
            select 1 from workout_sessions s
            where s.id = workout_sets.session_id and s.user_id = auth.uid()
        )
    );
create policy workout_sets_insert_own on workout_sets
    for insert with check (
        exists (
            select 1 from workout_sessions s
            where s.id = workout_sets.session_id and s.user_id = auth.uid()
        )
    );
create policy workout_sets_update_own on workout_sets
    for update using (
        exists (
            select 1 from workout_sessions s
            where s.id = workout_sets.session_id and s.user_id = auth.uid()
        )
    ) with check (
        exists (
            select 1 from workout_sessions s
            where s.id = workout_sets.session_id and s.user_id = auth.uid()
        )
    );

create policy food_entries_select_own on food_entries
    for select using (user_id = auth.uid());
create policy food_entries_insert_own on food_entries
    for insert with check (user_id = auth.uid());
create policy food_entries_update_own on food_entries
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy food_entries_delete_own on food_entries
    for delete using (user_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert on workout_plans to authenticated;
grant select, insert, update on user_settings to authenticated;
grant select, insert, update on workout_sessions to authenticated;
grant select, insert, update on workout_sets to authenticated;
grant select, insert, update, delete on food_entries to authenticated;
grant execute on function import_workout_plan(text, integer, jsonb, text) to authenticated;
