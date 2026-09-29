-- Séries por tempo ou distância e drop set.
--
-- Tudo aqui é aditivo e pode rodar de novo sem erro: colunas novas são
-- nullable, e uma série gravada sem `metric` (como qualquer cliente anterior
-- grava) continua sendo tratada como série de repetições, com a mesma exigência
-- de carga e repetições para ser concluída.

alter table workout_sets
    add column if not exists metric text
        check (metric in ('repeticoes', 'tempo', 'distancia')),
    add column if not exists duration_seconds integer
        check (duration_seconds >= 0),
    add column if not exists distance_m numeric(8, 2)
        check (distance_m >= 0);

-- A regra antiga de conclusão (carga e repetições obrigatórias) foi criada sem
-- nome explícito; ela é localizada pela definição e trocada por uma que olha a
-- métrica da série. Série de tempo ou distância exige só a medida dela, porque
-- prancha ou dead hang nem sempre têm carga.
do $$
declare
    v_constraint_name text;
begin
    for v_constraint_name in
        select conname
        from pg_constraint
        where conrelid = 'public.workout_sets'::regclass
          and contype = 'c'
          and conname <> 'workout_sets_completed_requires_values'
          and pg_get_constraintdef(oid) ilike '%completed_at IS NULL%'
          and pg_get_constraintdef(oid) ilike '%load_kg IS NOT NULL%'
          and pg_get_constraintdef(oid) ilike '%reps IS NOT NULL%'
    loop
        execute format('alter table workout_sets drop constraint %I', v_constraint_name);
    end loop;
end
$$;

alter table workout_sets
    drop constraint if exists workout_sets_completed_requires_values;

alter table workout_sets
    add constraint workout_sets_completed_requires_values check (
        completed_at is null
        or case coalesce(metric, 'repeticoes')
            when 'repeticoes' then load_kg is not null and reps is not null
            when 'tempo' then duration_seconds is not null
            when 'distancia' then distance_m is not null
            else false
        end
    );

-- Cada queda de um drop set é um registro próprio, ligado à série em que foi
-- feita. Ficam numa tabela à parte em vez de linhas extras em workout_sets
-- para o unique (session_id, exercise_key, set_index) continuar igual: é nele
-- que o upsert de série de qualquer cliente se apoia (on_conflict).
create table if not exists workout_set_drops (
    id uuid primary key default gen_random_uuid(),
    set_id uuid not null references workout_sets (id) on delete cascade,
    drop_index smallint not null check (drop_index >= 1),
    load_kg numeric(6, 2) check (load_kg >= 0),
    reps integer check (reps >= 0),
    duration_seconds integer check (duration_seconds >= 0),
    distance_m numeric(8, 2) check (distance_m >= 0),
    updated_at timestamptz not null default now(),
    unique (set_id, drop_index)
);

drop trigger if exists workout_set_drops_touch_updated_at on workout_set_drops;
create trigger workout_set_drops_touch_updated_at
    before update on workout_set_drops
    for each row execute function touch_updated_at();

alter table workout_set_drops enable row level security;

drop policy if exists workout_set_drops_select_own on workout_set_drops;
create policy workout_set_drops_select_own on workout_set_drops
    for select using (
        exists (
            select 1
            from workout_sets ws
            join workout_sessions s on s.id = ws.session_id
            where ws.id = workout_set_drops.set_id and s.user_id = auth.uid()
        )
    );

drop policy if exists workout_set_drops_insert_own on workout_set_drops;
create policy workout_set_drops_insert_own on workout_set_drops
    for insert with check (
        exists (
            select 1
            from workout_sets ws
            join workout_sessions s on s.id = ws.session_id
            where ws.id = workout_set_drops.set_id and s.user_id = auth.uid()
        )
    );

drop policy if exists workout_set_drops_update_own on workout_set_drops;
create policy workout_set_drops_update_own on workout_set_drops
    for update using (
        exists (
            select 1
            from workout_sets ws
            join workout_sessions s on s.id = ws.session_id
            where ws.id = workout_set_drops.set_id and s.user_id = auth.uid()
        )
    ) with check (
        exists (
            select 1
            from workout_sets ws
            join workout_sessions s on s.id = ws.session_id
            where ws.id = workout_set_drops.set_id and s.user_id = auth.uid()
        )
    );

drop policy if exists workout_set_drops_delete_own on workout_set_drops;
create policy workout_set_drops_delete_own on workout_set_drops
    for delete using (
        exists (
            select 1
            from workout_sets ws
            join workout_sessions s on s.id = ws.session_id
            where ws.id = workout_set_drops.set_id and s.user_id = auth.uid()
        )
    );

grant select, insert, update, delete on workout_set_drops to authenticated;

-- Troca todas as quedas de uma série de uma vez, numa única transação: uma
-- edição que reduz o número de quedas nunca deixa sobra das antigas. A ordem
-- no array define drop_index (a primeira queda é 1). Security invoker, então
-- as policies acima valem para quem chama.
create or replace function replace_workout_set_drops(
    p_set_id uuid,
    p_drops jsonb
) returns setof workout_set_drops as $$
begin
    delete from workout_set_drops where set_id = p_set_id;

    insert into workout_set_drops (set_id, drop_index, load_kg, reps, duration_seconds, distance_m)
    select
        p_set_id,
        drop_item.ordinal::smallint,
        (drop_item.value->>'load_kg')::numeric,
        (drop_item.value->>'reps')::integer,
        (drop_item.value->>'duration_seconds')::integer,
        (drop_item.value->>'distance_m')::numeric
    from jsonb_array_elements(coalesce(p_drops, '[]'::jsonb)) with ordinality as drop_item(value, ordinal);

    return query
        select * from workout_set_drops where set_id = p_set_id order by drop_index;
end;
$$ language plpgsql security invoker;

grant execute on function replace_workout_set_drops(uuid, jsonb) to authenticated;
