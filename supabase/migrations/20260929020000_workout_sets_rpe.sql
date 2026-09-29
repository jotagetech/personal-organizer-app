-- Cardio intervalado dentro do treino do dia.
--
-- Cada rodada feita é uma linha de workout_sets (set_index é o número da
-- rodada, metric 'tempo' e duration_seconds o trabalho realizado), então a
-- regra de conclusão, o upsert por (session_id, exercise_key, set_index) e as
-- policies de RLS continuam as mesmas. Só falta onde guardar o esforço
-- percebido da rodada.
--
-- Aditivo e seguro para rodar de novo: a coluna é nullable, nenhuma série já
-- gravada muda e um cliente que não manda `rpe` continua funcionando igual.

alter table workout_sets
    add column if not exists rpe smallint
        check (rpe between 1 and 10);
