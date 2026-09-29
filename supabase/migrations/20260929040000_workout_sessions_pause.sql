-- Pausa do treino: paused_at é o instante em que a pausa em andamento
-- começou (nulo com o treino correndo) e paused_seconds é o total das pausas
-- já encerradas. A duração passa a ser finished_at menos started_at menos o
-- tempo pausado.
--
-- Os dois valores são gravados como estado completo, calculado no aparelho
-- com o horário de cada toque em "Pausar" e "Retomar": reenviar a mesma
-- escrita pela fila offline dá sempre o mesmo resultado, por mais que o envio
-- demore.
--
-- Aditivo e seguro para rodar de novo: paused_at é nullable, paused_seconds
-- nasce com zero em todas as sessões já gravadas (nenhuma duração muda) e as
-- policies de update existentes já cobrem a escrita.

alter table workout_sessions
    add column if not exists paused_at timestamptz;

alter table workout_sessions
    add column if not exists paused_seconds integer not null default 0;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'workout_sessions_paused_seconds_nonnegative'
          and conrelid = 'public.workout_sessions'::regclass
    ) then
        alter table workout_sessions
            add constraint workout_sessions_paused_seconds_nonnegative
            check (paused_seconds >= 0);
    end if;
end
$$;
