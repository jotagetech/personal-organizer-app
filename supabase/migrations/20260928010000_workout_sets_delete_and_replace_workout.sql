-- Corrige troca de treino: séries antigas ficavam no banco (sem policy nem
-- grant de delete em workout_sets), só escondidas na tela, e reapareciam ao
-- recarregar o dia. Junta update do snapshot e delete das séries numa única
-- função, para as duas mudanças sempre acontecerem juntas.
create policy workout_sets_delete_own on workout_sets
    for delete using (
        exists (
            select 1 from workout_sessions s
            where s.id = workout_sets.session_id and s.user_id = auth.uid()
        )
    );

grant delete on workout_sets to authenticated;

create function replace_session_workout(
    p_session_id uuid,
    p_plan_id uuid,
    p_snapshot jsonb
) returns setof workout_sessions as $$
begin
    update workout_sessions
    set plan_id = p_plan_id,
        workout_key = p_snapshot->>'workout_key',
        workout_snapshot = p_snapshot,
        finished_at = null
    where id = p_session_id;

    delete from workout_sets where session_id = p_session_id;

    return query select * from workout_sessions where id = p_session_id;
end;
$$ language plpgsql security invoker;

grant execute on function replace_session_workout(uuid, uuid, jsonb) to authenticated;
