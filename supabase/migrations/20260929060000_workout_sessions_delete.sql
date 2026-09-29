-- Excluir o treino do dia: o app apaga a linha de workout_sessions da data,
-- e séries (workout_sets) e quedas (workout_set_drops) saem junto pelas
-- chaves estrangeiras com on delete cascade que já existem. Exercícios extras
-- e avaliação moram na própria linha da sessão. Faltava só a permissão de
-- delete na sessão, que nunca teve policy nem grant.
--
-- Aditivo e seguro para rodar de novo: a policy é recriada com o mesmo
-- conteúdo e o grant repetido não muda nada. A cascata roda pelas regras de
-- integridade do banco, sem depender das policies de delete das tabelas
-- filhas.

drop policy if exists workout_sessions_delete_own on workout_sessions;
create policy workout_sessions_delete_own on workout_sessions
    for delete using (user_id = auth.uid());

grant delete on workout_sessions to authenticated;
