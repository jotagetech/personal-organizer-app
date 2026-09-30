-- Ciclo passa a poder ser corrigido: data de início errada ou ciclo criado
-- sem querer. Dois ciclos no mesmo dia não fazem sentido (o anterior ficaria
-- sem nenhum dia), então a data de início é única por usuário; iniciar um
-- ciclo numa data que já tem ciclo reaproveita o existente no app.
alter table workout_cycles
    add constraint workout_cycles_user_id_start_date_key unique (user_id, start_date);

create policy workout_cycles_update_own on workout_cycles
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy workout_cycles_delete_own on workout_cycles
    for delete using (user_id = auth.uid());

grant update (start_date), delete on workout_cycles to authenticated;
