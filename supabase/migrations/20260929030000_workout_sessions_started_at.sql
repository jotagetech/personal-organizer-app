-- Início do treino marcado pelo usuário ("Iniciar treino") ou, na falta
-- dele, pela primeira série confirmada.
--
-- created_at não serve para isso: a sessão pode ser criada bem antes de o
-- treino começar, ou horas depois, quando a fila offline finalmente
-- sincroniza. Com started_at, a duração passa a ser finished_at menos
-- started_at; sessões antigas, sem a coluna preenchida, continuam medidas pela
-- janela entre a primeira e a última série concluída.
--
-- Aditivo e seguro para rodar de novo: a coluna é nullable, nenhuma sessão já
-- gravada muda e as policies de update existentes já cobrem a escrita.

alter table workout_sessions
    add column if not exists started_at timestamptz;
