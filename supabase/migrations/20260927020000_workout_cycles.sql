-- Ciclos de treino: marcam quando o usuário começou a seguir um plano,
-- independente de trocas de exercício durante o ciclo.
create table workout_cycles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    start_date date not null,
    created_at timestamptz not null default now()
);

create index workout_cycles_user_id_start_date_idx on workout_cycles (user_id, start_date desc);

alter table workout_cycles enable row level security;

create policy workout_cycles_select_own on workout_cycles
    for select using (user_id = auth.uid());
create policy workout_cycles_insert_own on workout_cycles
    for insert with check (user_id = auth.uid());

grant select, insert on workout_cycles to authenticated;
