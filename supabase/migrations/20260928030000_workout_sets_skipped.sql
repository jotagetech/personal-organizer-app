-- Série pulada: estado explícito, distinto de concluída e de não registrada.
alter table workout_sets
    add column if not exists skipped_at timestamptz;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'workout_sets_not_completed_and_skipped'
          and conrelid = 'public.workout_sets'::regclass
    ) then
        alter table workout_sets
            add constraint workout_sets_not_completed_and_skipped
            check (completed_at is null or skipped_at is null);
    end if;
end
$$;
