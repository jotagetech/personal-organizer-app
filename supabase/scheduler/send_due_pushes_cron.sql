-- Agendador da Edge Function send-due-pushes. Fica fora de migrations/
-- porque depende das extensões pg_cron e pg_net ligadas e de dois segredos no
-- Supabase Vault, criados à mão no SQL Editor (ver README, seção
-- Notificações):
--
--   send_due_pushes_url   URL completa da função
--   push_cron_secret      mesmo valor do segredo PUSH_CRON_SECRET da função
--
-- Nenhum segredo nem URL do projeto aparece aqui: o job lê os dois do Vault a
-- cada execução, então trocar um valor no Vault vale a partir da execução
-- seguinte, sem reagendar.
--
-- A cada 5 segundos o job confere a tabela e só chama a função quando existe
-- push vencido e ainda não enviado. Sem descanso em andamento nenhuma
-- chamada sai, o que mantém as invocações da função no mínimo.
--
-- Seguro para rodar de novo: cron.schedule com um nome que já existe
-- substitui o job anterior.

select cron.schedule(
    'send-due-pushes',
    '5 seconds',
    $job$
    select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'send_due_pushes_url'),
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-push-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
    )
    where exists (
        select 1 from public.scheduled_pushes
        where sent_at is null and fire_at <= now()
    );
    $job$
);

-- Um job a cada 5 segundos grava umas 17 mil linhas por dia no histórico do
-- pg_cron; esta limpeza diária guarda só os dois últimos dias.
select cron.schedule(
    'limpar-historico-pg-cron',
    '17 4 * * *',
    $job$
    delete from cron.job_run_details where end_time < now() - interval '2 days';
    $job$
);
