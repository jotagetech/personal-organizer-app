# Treino e Alimentação

App pessoal para registrar treino de força, cardio, alimentação, peso corporal
e sono, com foco em uso rápido pelo celular. Ver
`instrucoes-app-treino-alimentacao-v0.md` (fora do controle de versão) para a
especificação original da v0; muita coisa evoluiu desde então (ver
`CHANGELOG.md`).

## Stack

- React + TypeScript + Vite
- Supabase (Postgres + Auth) via `@supabase/supabase-js`
- Validação de contrato com Zod (`src/lib/workoutPlanSchema.ts`), com JSON Schema
  gerado a partir dela (`npm run schema:generate`)
- Testes com Vitest
- Sem biblioteca de UI: CSS próprio em `src/index.css`, todo sobre variáveis
  (tema claro/escuro automático e modo treino escuro na aba Treino), ícones
  com `lucide-react` e fontes embutidas via fontsource (Inter e Barlow
  Condensed)

## Rodando localmente

```bash
npm install
cp .env.example .env   # preencher com as credenciais do projeto Supabase
npm run dev
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o servidor de desenvolvimento |
| `npm run build` | Typecheck + build de produção (`dist/`) |
| `npm run typecheck` | Só o typecheck (`tsc --noEmit`) |
| `npm run test` | Roda a suíte Vitest |
| `npm run schema:generate` | Regera `schemas/workout-plan.schema.json` a partir do schema Zod |
| `npm run exercises:seed-sql -- <arquivo>` | Gera a migração que carrega `supabase/seed/exercises/` no banco (upsert pelo slug) |

## Configuração do Supabase

1. Crie um projeto no Supabase.
2. Aplique as migrações em `supabase/migrations/`, **nessa ordem exata**:
   1. `20260927000000_init.sql`
   2. `20260927010000_cardio_and_session_finish.sql`
   3. `20260927020000_workout_cycles.sql`
   4. `20260927030000_rir_bodyweight_sleep.sql`
   5. `20260928000000_food_items_catalog.sql` (popula o catálogo com os 597
      alimentos da Tabela TACO 4ª edição, ver `CHANGELOG.md`)
   6. `20260928010000_workout_sets_delete_and_replace_workout.sql` (policy de
      exclusão em `workout_sets` e função `replace_session_workout`, ver
      `CHANGELOG.md`)
   7. `20260928020000_daily_routine.sql` (checklist diário de hábitos:
      templates recorrentes e registros por dia, ver `CHANGELOG.md`)
   8. `20260928030000_workout_sets_skipped.sql` (coluna `skipped_at` em
      `workout_sets` para série pulada, com check impedindo série concluída e
      pulada ao mesmo tempo, ver `CHANGELOG.md`)
   9. `20260928040000_routine_adhoc_due_date.sql` (prazo opcional em tarefa
      avulsa da rotina e coluna `completed_on` com o dia da conclusão, ver
      `CHANGELOG.md`)
   10. `20260928050000_food_entries_recalc_on_item_update.sql` (recalcula a
      nutrição dos consumos sem dado quando o item do catálogo é editado, ver
      `CHANGELOG.md`)
   11. `20260929000000_food_items_seed_per_user.sql` (catálogo TACO copiado
      para toda conta nova e para contas existentes sem ele, ver
      `CHANGELOG.md`)
   12. `20260929010000_workout_sets_metrics_and_drops.sql` (métrica, segundos e
      metros em `workout_sets`, regra de conclusão por métrica e tabela
      `workout_set_drops` das quedas de drop set, ver `CHANGELOG.md`). Precisa
      estar aplicada no SQL Editor **antes** do deploy do app desta versão,
      porque o app novo grava essas colunas e a função
      `replace_workout_set_drops`.
   13. `20260929020000_workout_sets_rpe.sql` (coluna `rpe`, de 1 a 10, em
      `workout_sets`, para as rodadas do cardio intervalado, ver
      `CHANGELOG.md`). Aditiva e idempotente. Precisa estar aplicada **antes**
      do deploy do app desta versão: a rodada de intervalado grava `rpe`, e
      um banco sem a coluna recusa a escrita. Séries comuns não mandam a
      coluna e continuam funcionando com ou sem ela.
   14. `20260929030000_workout_sessions_started_at.sql` (coluna `started_at`
      em `workout_sessions`, o início do treino, ver `CHANGELOG.md`). Aditiva
      e idempotente. Precisa estar aplicada **antes** do deploy do app desta
      versão: o início do treino grava `started_at`, e sem a coluna essa
      escrita falha e aparece como falha no status de sincronização (as
      séries continuam sendo enviadas).
   15. `20260929040000_workout_sessions_pause.sql` (colunas `paused_at` e
      `paused_seconds` em `workout_sessions`, a pausa do treino, ver
      `CHANGELOG.md`). Aditiva e idempotente: `paused_seconds` nasce com zero
      em todas as sessões já gravadas, então nenhuma duração muda. Precisa
      estar aplicada **antes** do deploy do app desta versão: pausar,
      retomar e cancelar o início gravam essas colunas, e sem elas a escrita
      falha e aparece como falha no status de sincronização (as séries
      continuam sendo enviadas).
   16. `20260929050000_push_notifications.sql` (tabelas `push_subscriptions`
      e `scheduled_pushes` e função `register_push_subscription`, para a
      notificação de fim de descanso, ver a seção Notificações abaixo).
      Aditiva e idempotente. Sem ela o app continua funcionando; só ativar
      notificações e agendar o aviso de descanso falham, em silêncio.
   17. `20260929060000_workout_sessions_delete.sql` (policy e grant de delete
      em `workout_sessions`, para excluir o treino do dia; séries e quedas
      saem junto pela cascata que já existia, ver `CHANGELOG.md`). Aditiva e
      idempotente. Precisa estar aplicada **antes** do deploy do app desta
      versão: sem ela a exclusão não chega ao servidor e fica na fila,
      segurando a data até ser aplicada.

   Via `supabase db push`, ou colando cada arquivo no SQL Editor do projeto.
3. Em **Authentication → Providers**, mantenha e-mail/senha habilitado e crie
   manualmente cada usuário em **Authentication → Users → Add user** (sem tela
   de cadastro público, só entra quem tiver conta criada). Cada conta nova
   recebe automaticamente as configurações padrão e o próprio catálogo TACO;
   os dados de uma conta nunca aparecem para outra.
4. Copie a URL do projeto e a `anon key` para `.env` (`VITE_SUPABASE_URL` e
   `VITE_SUPABASE_ANON_KEY`).
5. RLS habilitado em todas as tabelas, restringindo cada uma ao próprio
   usuário autenticado. Nenhuma chave privilegiada (`service_role`) é usada no
   frontend.

## Notificações

Aviso de fim do descanso entre séries por Web Push, que chega com a tela
bloqueada. No iPhone (iOS 16.4 ou mais novo) só funciona com o app aberto
pelo ícone da tela de início. Com a tela bloqueada o iOS congela o
JavaScript da página, então o aviso sai do servidor:

1. Ao começar um descanso, o app grava em `scheduled_pushes` o horário do
   fim (início mais o máximo da faixa mais os "+15 s"). "+15 s" remarca;
   "Pular", "Fechar", finalizar o treino, pausar e trocar de treino cancelam
   (retomar agenda de novo, se o descanso ainda não acabou). É uma chamada
   direta ao Supabase, fora da fila offline: sem rede fica só o bipe do app.
2. O `pg_cron` confere a tabela a cada 5 segundos e, quando há push vencido,
   chama a Edge Function `send-due-pushes` via `pg_net`.
3. A função marca o push como enviado, manda o Web Push (VAPID) para todas as
   assinaturas do usuário e apaga as que respondem 404 ou 410. Push com mais
   de 60 segundos de atraso é descartado sem envio.
4. O service worker (`public/sw.js`, sem cache e sem interceptar
   requisições) mostra a notificação; tocar nela abre ou foca o app.

Com o app aberto na tela chegam os dois avisos, bipe e notificação: o
service worker sempre mostra a notificação, porque o iOS pode revogar a
permissão de quem recebe push sem mostrar nada.

### Configuração

Nenhum segredo vai para o repositório. Os valores ficam nos segredos da Edge
Function e no Supabase Vault.

1. **Chaves VAPID**: um par gerado uma vez (ex: `npx web-push
   generate-vapid-keys`), guardado fora do repositório. A chave pública vai
   para `VITE_VAPID_PUBLIC_KEY` no `.env` e nas variáveis de ambiente do
   Vercel (e exige novo deploy do frontend); a privada só nos segredos da
   função.
2. **Migração**: aplicar `20260929050000_push_notifications.sql` no SQL
   Editor.
3. **Extensões**: ligar `pg_cron` e `pg_net` em Database, Extensions.
4. **Segredos da função** (Edge Functions, Secrets), com estes nomes:
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (um contato no
   formato `mailto:voce@exemplo.com`) e `PUSH_CRON_SECRET` (um valor
   aleatório longo, ex: `openssl rand -hex 32`). `SUPABASE_URL` e
   `SUPABASE_SERVICE_ROLE_KEY` já existem por padrão.
5. **Publicar a função** pelo editor de Edge Functions do painel, com o nome
   `send-due-pushes` e o conteúdo de
   `supabase/functions/send-due-pushes/index.ts`, e **desligar a verificação
   de JWT** (Enforce JWT verification). Quem chama é o `pg_cron`, que não tem
   JWT de usuário; a proteção é o header `x-push-cron-secret`, conferido
   contra `PUSH_CRON_SECRET`, e sem ele a função responde 401 sem tocar no
   banco.
6. **Vault**: no SQL Editor, criar os dois segredos que o agendador lê,
   trocando o ref do projeto e o valor do segredo:

   ```sql
   select vault.create_secret(
       'https://SEU_PROJECT_REF.supabase.co/functions/v1/send-due-pushes',
       'send_due_pushes_url',
       'URL da Edge Function send-due-pushes'
   );
   select vault.create_secret(
       'MESMO_VALOR_DO_PUSH_CRON_SECRET',
       'push_cron_secret',
       'Segredo conferido pela Edge Function send-due-pushes'
   );
   ```

   Para trocar um valor depois: `select vault.update_secret(id, 'novo
   valor')`, com o `id` de `select id, name from vault.secrets`.
7. **Agendador**: rodar `supabase/scheduler/send_due_pushes_cron.sql` no SQL
   Editor. Ele agenda o job `send-due-pushes` (a cada 5 segundos, só chama a
   função quando há push vencido) e uma limpeza diária do histórico do
   `pg_cron`. Para parar: `select cron.unschedule('send-due-pushes')`.
8. **No aparelho**: abrir o app pelo ícone da tela de início, ir em Menu,
   Notificações, e tocar em "Ativar notificações". A permissão vale por
   aparelho; "Desativar" apaga a assinatura deste aparelho.

Para conferir o caminho do servidor: `select * from cron.job_run_details
order by start_time desc limit 20`, `select * from net._http_response order
by created desc limit 20` (resposta da função, com a contagem de enviados) e
os logs da função no painel.

## Monitoramento de erros

Erros do app em produção vão para o Sentry (`src/lib/monitoring.ts`). Só o
build de produção com `VITE_SENTRY_DSN` envia algo; o dev local e os testes
nunca enviam.

- **O que chega**: erro não tratado (a tela de "Recarregar" aparece quando a
  renderização inteira cai), falha definitiva da fila de envio como problema
  com alerta, e falha passageira da fila como log (tipo de operação, data,
  tentativas, código e status do erro).
- **O que nunca chega**: valores registrados (carga, repetições, comentários,
  peso, sono, refeições), corpo das requisições, consultas ao banco e o
  e-mail da conta. A pessoa é identificada só pelo id do Supabase.

Variáveis na Vercel (produção):

- `VITE_SENTRY_DSN`: o DSN do projeto no Sentry. Não é segredo, vai no
  JavaScript do navegador.
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` e `SENTRY_PROJECT` (opcionais): com o
  token, o build gera os source maps, envia ao Sentry e apaga de `dist/`,
  para o stack trace mostrar o código original sem publicá-lo. O token é
  segredo e fica só na Vercel.

## Funcionalidades

- **Rotina**: checklist diário de hábitos recorrentes (ex: academia seg-sex,
  refeições, suplemento), primeira aba do menu e tela de abertura do app. Um
  item pode ter um vínculo opcional com outra aba (treino finalizado, uma
  categoria de refeição, peso corporal, sono) e é marcado automaticamente
  quando esse sinal já existe pro dia; tocar num item vinculado ainda
  pendente leva pra aba correspondente ("Registrar agora"), com uma ação
  secundária "Marcar feito sem registrar" pra quem quer só riscar o item sem
  abrir o registro de verdade (visual diferente da marcação automática, pra
  não esconder que faltou o registro). Itens manuais e avulsos pendentes
  pedem confirmação inline antes de marcar concluído; um item concluído
  ganha "Editar" (atalho direto pro item na tela de gerenciamento) e/ou
  "Remover" (desfaz a marcação), no lugar de desmarcar tocando de novo. A
  tela aceita tarefas avulsas para uma data escolhida (não só o dia
  selecionado no momento). O menu de três pontos abre o gerenciamento dos itens
  recorrentes (criar, editar dias da semana e vínculo, arquivar).
- **Treino**: importa plano de treino via JSON ou monta o plano direto na
  tela (ver "Montar o plano no app"), sugere o treino do dia,
  registra um exercício/uma série por vez (carga, repetições, RIR opcional,
  comentário livre por série), com barra de progresso e opção de voltar.
  Séries podem ser de repetições, tempo ou distância, com drop set (cada
  queda é um passo próprio), e o card mostra equipamento, execução por lado,
  RIR alvo, descanso prescrito (o da série, senão o do exercício, senão o
  padrão do plano) e observações do plano (ver "Plano de treino
  (contrato)").
  Série de tempo tem cronômetro (bipe e aviso ao atingir o mínimo e o
  máximo da meta), e o descanso prescrito vira uma contagem regressiva
  em tela cheia no lugar do card depois de cada série, com "+15 s" e
  "Pular"; a próxima série só aparece quando ela acaba ou é pulada.
  Cardio intervalado (bike, esteira, remo, corrida) é um exercício do
  treino: um passo com timer guiado que alterna trabalho e recuperação,
  mostra "Rodada 3 de 8" e grava cada rodada feita, com o RPE do bloco.
  O topo do treino tem "Iniciar treino": tocar marca o início e passa a
  mostrar o tempo decorrido (`m:ss`, `h:mm:ss` a partir de uma hora), que
  sai do horário de início e continua certo depois de sair da aba ou
  bloquear a tela. Confirmar ou pular uma série sem ter tocado no botão
  inicia o treino naquele momento. Com o treino em andamento, "Pausar" para
  o relógio (a faixa mostra "Pausado" e o tempo congelado) e "Retomar"
  volta a contar; dá para pausar quantas vezes quiser, e confirmar ou pular
  uma série com o treino pausado retoma sozinho. Enquanto nenhuma série foi
  concluída ou pulada, "Cancelar início" volta para antes de "Iniciar
  treino"; depois disso só existe pausar. Início, pausa, retomada e
  cancelamento passam pela fila otimista, então funcionam sem sinal. Sair da aba Treino (ou fechar o app) e voltar para a
  mesma data reabre o mesmo passo: o treino escolhido, o exercício e a
  série da navegação livre e a queda do drop set em que estava.
  A lista de exercícios do treino tem "Adicionar exercício" enquanto o
  treino não foi finalizado: o nome sugere exercícios dos outros dias do
  plano e extras usados em sessões anteriores (copiando a configuração e o
  mesmo `exercise_key`), e um nome novo abre um formulário curto com a
  medida da série, o número de séries, o alvo e o descanso opcional (vazio
  usa o padrão do plano). O extra entra só no treino daquele dia, no fim da
  lista e com a etiqueta "extra", sem mudar o plano; funciona sem sinal pela
  fila otimista e não inicia o treino.
  Finalizar o treino para o relógio, mostra o tempo total, registra a
  duração (do início ao fim, sem o tempo pausado; em sessões anteriores ao
  início marcado, da primeira à última série concluída), a avaliação
  (sentimento de 1 a 5 e texto, salvos pelo botão "Salvar avaliação" e
  editáveis depois) e abre o
  registro de cardio do dia.
  O menu de três pontos tem "Excluir treino do dia" quando a data tem treino
  registrado (em andamento ou concluído, no servidor ou só no aparelho), em
  qualquer data. Como nas outras exclusões, a barra de desfazer fica aberta
  alguns segundos e a tela já mostra o dia sem treino; desfazer volta ao que
  estava. Efetivada, a exclusão apaga a sessão com séries, quedas, extras e
  avaliação, descarta o que a data tinha na fila, o passo guardado, os
  cronômetros e o push de descanso dela, e o dia volta a "nenhum treino
  iniciado", com o treino sugerido. Ela passa pela fila otimista: sem sinal,
  fica guardada no aparelho até ser enviada, e nada da data enviado antes ou
  durante ela recria a sessão depois.
  Numa data depois de hoje, a aba mostra o treino sugerido e as séries só
  para consulta, com um aviso de que o registro abre no próprio dia: iniciar,
  confirmar, pular, os campos, os cronômetros, o intervalado, "Adicionar
  exercício" e a troca de treino que mexe numa sessão gravada ficam
  desativados. Datas passadas continuam aceitando registro retroativo.
- **Ciclo**: marca a data de início de um ciclo de treino (menu de três pontos
  na aba Treino) e mostra "Dia N do ciclo", independente de trocas no plano.
- **Cardio**: catálogo de atividades cadastrado na hora, registro por dia
  (duração, distância opcional, sentimento, observação).
- **Alimentação**: catálogo de alimentos com nutrição opcional (kcal/
  proteína/carboidrato/gordura por uma quantidade de referência), semeado com
  a Tabela TACO. Chips de "frequentes", autocomplete, sugestão de refeição
  pela hora do dia, total diário de kcal/proteína.
- **Peso corporal e sono**: registro rápido diário (um número, upsert por
  dia), na aba Resultados.
- **Resultados**: grade semanal de dias de treino concluído (verde = treino
  finalizado naquele dia), mais os registros de peso/sono. Tocar num dia da
  grade muda a data selecionada em todo o app e mostra, logo abaixo, o
  detalhe somente leitura daquele dia (treino por exercício, cardio,
  alimentação por refeição, peso e sono), com um relatório do dia no topo:
  placar da rotina (feito vs. pendente) e até 4 destaques do dia, com uma
  frase de abertura que muda conforme a proporção de itens de rotina
  concluídos. As séries aparecem na unidade da métrica, com as quedas de drop
  set sob a série principal.

## Plano de treino (contrato)

O plano é um JSON importado na aba Treino. Um arquivo completo de exemplo está
em `examples/plano-exemplo.json` e o JSON Schema em
`schemas/workout-plan.schema.json` (gerado com `npm run schema:generate`).
Um teste falha no `npm run test` se esse arquivo ficar diferente do schema Zod.

**Versões.** O contrato atual é a `versao: 2`. Arquivos `versao: 1` (só
repetições, com `carga_sugerida`) continuam sendo aceitos sem nenhuma
alteração, e planos e sessões já salvos com o formato antigo são lidos
normalmente: o app normaliza tudo para o formato atual na leitura. Uma série
antiga sem métrica gravada vale como repetições.

### Montar o plano no app

Quem não quer escrever JSON monta o plano na aba Treino: "Criar plano" na
tela vazia ou no menu de três pontos, e "Editar plano atual" no mesmo menu,
que carrega o plano ativo. O montador só compõe o mesmo JSON v2 deste
contrato e salva pelo mesmo caminho da importação (mesma validação, mesmo
hash, o plano salvo vira o ativo); nada muda na forma como o plano é lido.

- Treinos com nome e dias da semana; exercícios com adicionar, remover,
  subir, descer e duplicar, cada treino e cada exercício recolhível.
- Exercício de séries (equipamento, pegada, largura da pegada, acessório,
  forma de carga com explicação curta, unilateral, descanso, RIR alvo,
  observações e a lista de séries com
  métrica, alvo, carga sugerida, duplicar e drop set) ou cardio intervalado
  (modalidade, rodadas, trabalho, recuperação, RPE alvo). Escolher o
  equipamento sugere a forma de carga (halteres: por halter; barra: total;
  máquina assistida, que no arquivo vira `maquina` com `assistencia`:
  assistência; peso corporal: peso corporal), e dá para trocar.
- Bi-set, tri-set e circuito: em exercício de séries, "Agrupar com o
  próximo" junta o exercício com o de baixo (se um dos dois já está num
  grupo, o outro entra nele; se os dois estão, os grupos viram um só) e
  "Desagrupar" tira só aquele exercício do grupo. O rótulo do `grupo` é
  gerado pela tela, nunca digitado, e os membros aparecem juntos numa caixa
  com o nome (Bi-set, Tri-set ou Circuito). Subir, descer, remover, duplicar
  ou trocar para cardio nunca deixa grupo quebrado: o que ficar fora de
  sequência sai do grupo, e um grupo que sobra com um exercício só deixa de
  existir. Cardio intervalado não entra em grupo.
- Toda faixa tem o modo "Fixo", que grava o mesmo número no mínimo e no
  máximo.
- "Descanso padrão", no topo do plano, vale para os exercícios sem descanso
  próprio; editar o plano atual, preencher só ele e salvar já basta. Cada
  série tem "Descanso próprio" entre as ações dela, que abre um campo de
  descanso só daquela série (com lixeira para voltar ao do exercício).
- "Usar progressão por semanas" (desligado por padrão) pede as semanas do
  bloco, uma descrição opcional por semana e, por exercício, "Semana
  diferente", que copia a prescrição base para editar só o que muda. No
  arquivo, a variação leva só o que difere da base. Sem a progressão ligada,
  `bloco_semanas`, `semanas` e `variacoes_semana` não vão para o arquivo.
- O `id` é gerado a partir do nome (sem acento, com hífen, único no treino e
  no plano). Num plano carregado, renomear um exercício mantém o id (a tela
  mostra "Histórico mantido"); "Tratar como exercício novo" troca o id e o
  exercício começa sem histórico.
- Antes de salvar ou de "Baixar JSON", o plano passa pelo contrato; cada
  problema aparece em português com o treino, o exercício e a série, e
  tocar nele abre a seção e leva ao campo.
- O rascunho fica em localStorage enquanto você monta, então fechar o app
  não perde nada; "Descartar rascunho" recomeça. Salvar com sucesso apaga o
  rascunho.

### Trocar de plano e voltar para um plano antigo

Importar outro arquivo com um plano já ativo pede confirmação antes de
trocar: a caixa mostra o plano que sai e o que entra, e oferece "Começar
ciclo novo hoje" (marcado por padrão), que volta para o Dia 1 e para a
semana 1 do bloco. Nada é apagado na troca: o plano anterior continua no
banco, porque as sessões feitas com ele apontam para ele, e o histórico não
muda.

Menu › Planos de treino lista todos os planos já importados ou salvos pelo
montador, do mais novo para o mais antigo, com a data de importação e o
ativo marcado. Como o montador salva cada edição como um plano novo, planos
com o mesmo nome aparecem numerados ("versão 2 de 3"). "Usar este plano"
passa pela mesma confirmação e reativa o plano sem precisar do arquivo; com
o ciclo novo marcado, o plano recomeça do zero. É só a troca do plano ativo
em `user_settings`, sem migração.

### O que a versão 2 acrescenta

Cada item abaixo é opcional, e uma série escrita como na versão 1 continua
sendo uma série de repetições.

**Repetições** (igual à versão 1; valor fixo repete o número nos dois campos):

```json
{ "repeticoes_min": 8, "repeticoes_max": 12, "carga_sugerida": 60 }
```

**Tempo**, em segundos:

```json
{ "segundos_min": 20, "segundos_max": 40 }
```

**Distância**, em metros:

```json
{ "metros_min": 25, "metros_max": 40, "carga_sugerida": 24 }
```

Cada série usa exatamente uma métrica.

**Drop set**: `quedas` na série, cada uma com a mesma métrica da série e
`carga_sugerida` própria. Na sessão, cada queda vira um passo depois da série
principal (até 10 por série):

```json
{
  "repeticoes_min": 10,
  "repeticoes_max": 12,
  "carga_sugerida": 30,
  "quedas": [
    { "repeticoes_min": 8, "repeticoes_max": 10, "carga_sugerida": 22.5 },
    { "repeticoes_min": 8, "repeticoes_max": 10, "carga_sugerida": 15 }
  ]
}
```

**Forma de carga** (`forma_carga`, no exercício): diz o que o número digitado
como carga significa.

| Valor | O que se digita |
|---|---|
| `total` | Carga toda (com a barra, se for barra) |
| `por_lado` | Carga de cada lado da barra |
| `por_halter` | Peso de um halter |
| `peso_corporal` | Só o lastro extra; vazio é sem lastro e fica gravado como 0 |
| `assistencia` | Peso que ajuda (máquina assistida ou elástico); menos é progresso |

```json
{ "id": "barra-fixa-assistida", "nome": "Barra fixa assistida", "forma_carga": "assistencia", "series": [{ "repeticoes_min": 6, "repeticoes_max": 8, "carga_sugerida": 40 }] }
```

**Por lado** (`por_lado: true`, no exercício): execução unilateral (cada
perna, cada braço). O alvo da série vale para cada lado:

```json
{ "id": "afundo-bulgaro", "nome": "Afundo búlgaro", "forma_carga": "por_halter", "por_lado": true, "series": [{ "repeticoes_min": 8, "repeticoes_max": 8, "carga_sugerida": 12 }] }
```

Atenção para não confundir os dois: `por_lado: true` fala de **como o exercício
é executado** (um lado por vez), enquanto `forma_carga: "por_lado"` fala de
**quanto peso o número da carga representa** (o que está em cada lado da
barra). Os dois podem aparecer juntos ou separados.

**Bi-set, tri-set e circuito** (`grupo`, no exercício de séries): exercícios
vizinhos no treino com o mesmo `grupo` são feitos alternando, uma série de
cada por vez, em rodadas (A1, B1, A2, B2...). Com 2 membros o app chama de
Bi-set, com 3 de Tri-set e com 4 ou mais de Circuito. O descanso só vem no fim
da rodada, depois da série do último membro, e vale o descanso desse membro
(série, exercício ou padrão do plano); a troca entre membros é sem descanso.
O rótulo é livre (até 40 caracteres) e só liga os exercícios entre si:

```json
{ "id": "supino-inclinado", "nome": "Supino inclinado", "grupo": "peito-triceps", "series": [{ "repeticoes_min": 10, "repeticoes_max": 12 }] }
```

Regras: os membros precisam estar em sequência no treino, o grupo precisa de
pelo menos 2 exercícios e `grupo` não vale no cardio intervalado. Um membro
com menos séries que os outros sai das rodadas finais.

**Descanso** prescrito, em segundos (`descanso_segundos_min` e
`descanso_segundos_max`, sempre o par):

```json
{ "descanso_segundos_min": 90, "descanso_segundos_max": 120 }
```

O descanso pode vir de quatro lugares, e vale o mais específico que existir:

1. a própria série (`descanso_segundos_min/max` dentro de um item de
   `series`, inclusive nas séries de uma variação da semana), para a série
   que foge da regra, como a última mais pesada;
2. a variação da semana ativa do bloco (`variacoes_semana`);
3. o exercício;
4. o padrão do plano (`descanso_padrao_segundos_min/max` na raiz), que cobre
   todo exercício de séries sem descanso próprio.

Sem nenhum deles a série não tem descanso prescrito. O exercício intervalado
não usa nenhum dos quatro: a pausa dele é a recuperação entre rodadas. A
queda de um drop set não tem descanso, que só começa quando a série termina
inteira. Um plano que já existe ganha descanso em tudo só com o padrão:

```json
{
  "versao": 2,
  "nome": "Meu plano",
  "unidade_carga": "kg",
  "descanso_padrao_segundos_min": 90,
  "descanso_padrao_segundos_max": 90,
  "treinos": [{ "id": "treino-a", "nome": "A", "exercicios": [{
    "id": "supino-reto", "nome": "Supino reto", "forma_carga": "total",
    "series": [
      { "repeticoes_min": 8, "repeticoes_max": 10 },
      { "repeticoes_min": 5, "repeticoes_max": 6, "descanso_segundos_min": 180, "descanso_segundos_max": 180 }
    ]
  }] }]
}
```

A sessão grava o descanso já resolvido no snapshot (no exercício, e na série
só quando ela difere dele), então mudar o plano depois não muda o histórico,
e sessões antigas continuam lendo o descanso do exercício como antes.

**RIR alvo** (`rir_alvo_min` e `rir_alvo_max`, sempre o par, de 0 a 10):

```json
{ "rir_alvo_min": 2, "rir_alvo_max": 3 }
```

**Equipamento** (`equipamento`): etiqueta informativa, com `barra`,
`halteres`, `maquina`, `cabo`, `kettlebell`, `elastico`, `peso_corporal` ou
`outro`. O `id` do exercício continua sendo a chave do histórico:

```json
{ "equipamento": "cabo" }
```

**Pegada, largura e acessório** (`pegada`, `largura_pegada`, `acessorio`):
etiquetas que separam variações do mesmo movimento sem carga comparável, como
puxada aberta pronada, puxada supinada e puxada com triângulo. `pegada` aceita
`pronada`, `supinada` ou `neutra`; `largura_pegada`, `fechada`, `media` ou
`aberta`; `acessorio`, `barra_reta`, `barra_w`, `barra_neutra`, `triangulo`,
`corda` ou `alca`. Os três são opcionais e independentes, aparecem no card do
exercício e vão para a exportação (`grip`, `grip_width`, `attachment`). Trocar
a pegada de um exercício pede `id` novo, como trocar o equipamento:

```json
{ "equipamento": "cabo", "pegada": "pronada", "largura_pegada": "aberta", "acessorio": "barra_reta" }
```

**Exercício do catálogo** (`catalogo`): slug do exercício no catálogo
compartilhado (ex: `supino_reto_barra`; um exercício criado pela conta começa
com `meu_`). Liga as séries ao catálogo mesmo quando o nome da ficha é outro, e
junta o histórico do mesmo exercício entre planos. Opcional: sem ele, o banco
tenta pelo nome. O `id` continua sendo a chave da sessão:

```json
{ "id": "puxada-aberta", "nome": "Pulldown aberto", "catalogo": "puxada_frontal_aberta" }
```

**Observações** (`observacoes`): texto livre do exercício, mostrado no card:

```json
{ "observacoes": "Descida controlada de 4 a 6 segundos." }
```

**Cardio intervalado** (`tipo: "intervalado"`, no exercício): rodadas de
trabalho alternadas com recuperação, em qualquer modalidade. Sem `tipo` (ou
com `tipo: "series"`), o exercício é de séries como sempre foi. Campos:

| Campo | O que é |
|---|---|
| `modalidade` | Texto livre: `bike`, `esteira`, `remo`, `corrida`... |
| `rodadas` | Quantidade de rodadas de trabalho (1 a 50) |
| `trabalho_segundos_min/max` | Trabalho de cada rodada, em segundos |
| `recuperacao_segundos_min/max` | Recuperação entre rodadas, em segundos (0 emenda as rodadas) |
| `rpe_alvo_min/max` | RPE alvo opcional, de 1 a 10 |
| `observacoes` | Texto livre, como nos outros exercícios |

Toda faixa segue a regra do resto do contrato: sempre o par, e valor fixo
repete o número. Com faixa de trabalho (3 a 4 min, por exemplo), quem treina
encerra cada trabalho dentro dela. Campos de série não se aplicam e são
recusados com o caminho do campo: `series`, `forma_carga`, `equipamento`,
`pegada`, `largura_pegada`, `acessorio`, `por_lado`, `descanso_segundos_min/max` (a pausa é a recuperação) e
`rir_alvo_min/max` (use o RPE). Tiros de 30 s forte e 90 s leve, 6 na semana
1, 8 na 2, 10 na 3 e 6 na 4:

```json
{
  "tipo": "intervalado",
  "id": "tiros-bike",
  "nome": "Tiros na bike",
  "modalidade": "bike",
  "rodadas": 6,
  "trabalho_segundos_min": 30,
  "trabalho_segundos_max": 30,
  "recuperacao_segundos_min": 90,
  "recuperacao_segundos_max": 90,
  "rpe_alvo_min": 8,
  "rpe_alvo_max": 8,
  "variacoes_semana": [
    { "semanas": [2], "rodadas": 8 },
    { "semanas": [3], "rodadas": 10 }
  ]
}
```

Resistência com blocos de 3 a 4 min e 2 min de recuperação:

```json
{ "tipo": "intervalado", "id": "resistencia-esteira", "nome": "Resistência na esteira", "modalidade": "esteira", "rodadas": 4, "trabalho_segundos_min": 180, "trabalho_segundos_max": 240, "recuperacao_segundos_min": 120, "recuperacao_segundos_max": 120 }
```

**Progressão por semana**: o plano declara um bloco (`bloco_semanas`, de 1 a
12) e cada exercício pode ter `variacoes_semana`, uma lista em que cada item
diz em quais `semanas` vale e o que muda nelas: `series` (substitui a lista
inteira, então serve tanto para mudar alvo e carga quanto para tirar ou
acrescentar séries), `descanso_segundos_min/max` e `rir_alvo_min/max`; no
exercício intervalado, `rodadas`, `trabalho_segundos_min/max`,
`recuperacao_segundos_min/max` e `rpe_alvo_min/max`. O que a
variação não informa continua vindo do exercício, e uma semana sem variação
usa as séries base. `semanas` no plano é opcional e dá uma descrição curta a
cada semana, mostrada na aba Treino. Um bloco de 4 semanas com 3 séries que
viram 2 na semana de redução de volume:

```json
{
  "bloco_semanas": 4,
  "semanas": [
    { "semana": 1, "descricao": "Calibração de carga" },
    { "semana": 4, "descricao": "Redução de volume" }
  ],
  "treinos": [{ "id": "treino-a", "nome": "A", "exercicios": [{
    "id": "supino-reto", "nome": "Supino reto", "forma_carga": "total",
    "series": [
      { "repeticoes_min": 8, "repeticoes_max": 10, "carga_sugerida": 60 },
      { "repeticoes_min": 8, "repeticoes_max": 10, "carga_sugerida": 60 },
      { "repeticoes_min": 8, "repeticoes_max": 10, "carga_sugerida": 60 }
    ],
    "variacoes_semana": [
      { "semanas": [2], "series": [
        { "repeticoes_min": 10, "repeticoes_max": 12, "carga_sugerida": 60 },
        { "repeticoes_min": 10, "repeticoes_max": 12, "carga_sugerida": 60 },
        { "repeticoes_min": 10, "repeticoes_max": 12, "carga_sugerida": 60 }
      ] },
      { "semanas": [4], "rir_alvo_min": 3, "rir_alvo_max": 4, "series": [
        { "repeticoes_min": 8, "repeticoes_max": 10, "carga_sugerida": 60 },
        { "repeticoes_min": 8, "repeticoes_max": 10, "carga_sugerida": 60 }
      ] }
    ]
  }] }]
}
```

A semana vem do ciclo em andamento (menu da aba Treino, "Iniciar novo
ciclo"): dias 1 a 7 do ciclo são a semana 1, dias 8 a 14 a semana 2 e assim
por diante. Quando o ciclo passa da duração do bloco, o bloco recomeça: com 4
semanas, a semana 5 do ciclo volta a ser a semana 1. Sem ciclo em andamento,
ou com plano sem `bloco_semanas`, valem as séries base. Toda semana usada numa
variação ou numa descrição precisa estar dentro do bloco, e uma semana só pode
aparecer em uma variação do mesmo exercício.

### Como os dados ficam no banco e nas telas

- `workout_sets.metric` vem preenchida pelo app novo; é nula só em séries
  antigas e significa repetições. O valor fica em `reps`, `duration_seconds`
  ou `distance_m`, conforme a métrica.
- As quedas ficam em `workout_set_drops` (`drop_index` a partir de 1), só
  existem em série concluída e não têm status nem RIR próprios. Uma queda do
  meio pode ficar toda nula. Série pulada não guarda quedas.
- Em Resultados, o detalhe do dia mostra a unidade certa (`35 s`, `32,5 m`),
  a assistência identificada (`assist. 40 kg`), peso corporal sem lastro sem
  "0 kg" e as quedas sob a série (`↳ 22,5 kg × 9 reps`). O app não calcula
  volume total, então tempo e distância nunca são somados como repetições nem
  a assistência como carga.
- A sessão grava no snapshot as séries já resolvidas para a semana do bloco,
  junto com `semana_bloco`, `bloco_semanas` e `descricao_semana` (nulos sem
  bloco ou sem ciclo). O histórico mostra o que foi prescrito naquele dia
  mesmo que o plano ou o ciclo mudem depois, e snapshots antigos são lidos
  com a semana nula. A aba Treino mostra "Semana N de M" (com a descrição,
  se houver) ao lado do badge do ciclo e o detalhe do dia em Resultados
  mostra a semana da sessão.
- Cada rodada do intervalado é uma linha de `workout_sets`: `set_index` é o
  número da rodada, `metric` é `tempo`, `duration_seconds` o trabalho feito
  e `rpe` o RPE do bloco (o mesmo em toda rodada feita, nulo se não
  informado). Rodada pulada tem `skipped_at`. O snapshot grava o
  intervalado já resolvido para a semana (`tipo`, `intervalado` com as
  faixas) e, em `series`, uma série de tempo por rodada, então quem só
  conhece séries continua lendo a sessão. Snapshots antigos são lidos como
  `tipo: "series"`.
- Na sessão, o intervalado é um passo só. "Iniciar" liga o timer guiado:
  trabalho e recuperação alternam sozinhos com contagem regressiva grande,
  "Rodada 3 de 8" e bipe na troca de fase (e nos 3 últimos segundos da
  recuperação). Com faixa de trabalho, a contagem vai até o mínimo (aviso) e
  depois até o máximo (troca sozinha); "Encerrar trabalho" fecha a rodada
  com o tempo feito. Dá para pausar, pular a rodada, começar a próxima antes
  do fim da recuperação e encerrar o bloco antes (o que falta fica pulado).
  O estado fica em localStorage com timestamps, então fechar e reabrir o
  app retoma no ponto certo, e a tela fica acesa com wake lock. No fim, uma
  conferência mostra cada rodada (tempo editável, feita ou pulada) e o RPE
  do bloco em botões de 1 a 10 antes de gravar; "Lançar sem timer" abre a
  mesma conferência já preenchida com o alvo. A gravação passa pela fila
  otimista como as séries.
- Em Resultados, o intervalado aparece numa linha só com o que foi feito,
  `8 × 30 s / 90 s · RPE 8` (faixa quando as rodadas variaram, puladas no
  fim), e a meta do dia embaixo.
- A exportação JSON por período mantém o formato anterior e só acrescenta
  campos: por exercício `equipment`, `per_side`, `rest_seconds_min/max`,
  `target_rir_min/max` e `notes`; por série planejada `drops` (alvos das
  quedas) e `rest_seconds_min/max` (descanso efetivo depois da série); por série realizada `drops` (o que foi feito em cada queda); por
  treino `block_week` e `block_weeks` (semana do bloco e duração dele, nulos
  sem bloco); por exercício `exercise_type` (`series` ou `intervalado`) e
  `interval` (modalidade, rodadas e faixas de trabalho, recuperação e RPE
  alvo, nulo em exercício de séries); por série realizada `rpe`; por
  treino `started_at` (início marcado, nulo em sessões anteriores a ele),
  e com ele `duration_minutes` passa a ser de `started_at` a `finished_at`
  menos o tempo pausado; por treino `paused_seconds` (total pausado, zero
  sem pausa); por exercício `is_extra` (acrescentado só àquela sessão,
  fora do treino do plano). No
  intervalado, cada item de `planned` e `sets` é uma rodada e
  `load_convention` não tem significado.
- Um exercício extra fica só no snapshot da sessão, com `extra: true`. A
  chave dele (`extra-` mais o nome em slug, com sufixo quando já existe) é
  gravada uma vez e reaproveitada quando a sugestão é escolhida de novo em
  outra sessão, o que liga o histórico do exercício.

## Estrutura

```
src/
  lib/              contrato do plano (Zod), datas, cliente Supabase, tipos do banco
  contexts/         sessão de auth e data selecionada, compartilhados entre abas
  features/
    auth/           tela de login
    shared/         navegação inferior, cabeçalho de data
    routine/        checklist diário de hábitos (templates recorrentes, itens avulsos)
    workout/        importação de plano, sessão/séries, ciclo de progresso, finalização
      builder/      montador de plano na tela (estado, conversão para o JSON v2, rascunho)
    cycle/          ciclo de treino (data de início, "Dia N do ciclo")
    cardio/         catálogo de atividades e registro de cardio
    food/           catálogo de alimentos (TACO + próprios), consumo por refeição
    bodyMetrics/    peso corporal e sono (registro rápido diário)
    results/        grade semanal de treinos concluídos
    notifications/  service worker, assinatura de push e ativação no Menu
    exerciseCatalog/ catálogo de exercícios: busca, sugestões e ligação de nomes do histórico
supabase/migrations/  esquema SQL + RLS + funções (importação de plano, cálculo nutricional)
supabase/functions/   Edge Function send-due-pushes (Deno, fora do tsc e do build do Vite)
supabase/scheduler/   SQL do pg_cron que chama a Edge Function
supabase/seed/exercises/  seed do catálogo global de exercícios e apelidos (pt-BR,
                        conteúdo próprio), com regras e vocabulários no README da pasta
public/sw.js          service worker do Web Push
examples/             plano de treino de exemplo (JSON)
schemas/               JSON Schema gerado a partir do contrato Zod
tests/                 testes Vitest (contrato, datas, seleção de treino, hash canônico,
                        progresso de sessão, grade de resultados, sugestão de refeição)
CHANGELOG.md           histórico de mudanças, por data
```

## Catálogo de exercícios

Um catálogo só, compartilhado por todas as contas, em vez de cada pessoa
cadastrar os próprios exercícios repetidos. A fonte é
`supabase/seed/exercises/`: 202 exercícios com nome, família, músculo primário
e secundários, equipamento, pegada, largura, acessório, padrão de movimento,
forma de carga sugerida e descrição curta, os apelidos globais (ex: "stiff" e
"levantamento terra romeno") e os nomes genéricos que valem para mais de uma
variação ("pull down", "remada baixa", "tríceps polia"). O texto é todo
próprio, em pt-BR de academia. A regra de identidade (barra e halter são
exercícios diferentes, pegada que muda a carga também, tempo e pausa não), os
vocabulários e a licença estão no `README.md` da pasta. `validateExerciseSeed`
(`src/lib/exerciseCatalogSeed.ts`) confere os três arquivos dentro do
`npm run test`.

**No banco** (`20261001000000_exercise_catalog.sql`, seed em
`20261001000100_exercise_catalog_seed.sql`):

- `exercises`: global (`owner_user_id` nulo) ou da conta. O exercício da conta
  ganha slug `meu_*` e nasce só com o nome; o global tem ficha completa.
- `exercise_aliases`: apelido global ou da conta. O da conta vale só para ela
  (a sigla "sprh" de uma pessoa não aparece para outra).
- `exercise_generic_names`: nome genérico ligado a famílias.
- `workout_sets.exercise_id`: preenchido por gatilho a partir do snapshot da
  sessão, nunca pelo app. A ordem é o slug `catalogo` do plano, o apelido da
  conta, o exercício da conta, o nome global e o apelido global; nome genérico
  ou desconhecido fica nulo. Prescrição no nome ("(RIR 2)", "drop", "leve")
  não atrapalha. Criar, trocar ou apagar um apelido da conta religa as séries
  antigas daquele nome.

**No app:**

- Montador: o nome do exercício sugere do catálogo enquanto a pessoa digita
  (nome, apelido, apelido da conta, iniciais como "srh", nome genérico com as
  variações para escolher). Escolher preenche nome, slug, equipamento, pegada
  e forma de carga. Se o que foi digitado não era um nome conhecido, aparece
  "Guardar como seu apelido". Sem resultado, dá para criar o exercício só para
  a conta. "Desvincular" tira o slug e deixa o nome como digitado.
- Menu › Exercícios do histórico: nomes dos treinos que ficaram sem vínculo
  (genéricos, ambíguos, novos), com a busca para escolher o exercício ou criar
  um da conta. Ligar vale para as séries antigas e futuras com aquele nome.

**Curadoria** (só pelo SQL, como admin do banco): `exercise_curation_aliases`
lista apelidos de conta que ainda não são globais, com quantas contas usam cada
um; `exercise_curation_private` lista os exercícios criados pelas contas.
`select promote_exercise_alias('<apelido normalizado>', '<id do global>')`
promove um apelido a global; `select merge_private_exercise('<id do privado>',
'<id do global>')` funde um exercício da conta num global (séries e apelidos
vão junto, e o nome antigo vira apelido da conta). Para promover um privado,
cria-se o global pelo seed e funde-se o privado nele. Nada é promovido sozinho.

Mudar o seed: editar os JSON da pasta, rodar `npm run test` e gerar uma
migração nova com `npm run exercises:seed-sql -- supabase/migrations/<timestamp>_exercise_catalog_seed.sql`.
A migração já aplicada não é reescrita.

## Estado atual

Em uso real pelo autor, testado no celular. Ver `CHANGELOG.md` para o
histórico de features e correções. Pendência conhecida: integração com
Google Fit (sono/passos do Amazfit/Zepp), adiada por ser um projeto à parte
(exige OAuth e uma Edge Function), ainda não implementada.

Instalável na tela de início (manifest e ícones em `public/`, nome
"Organizer"), abrindo em tela cheia como app.

O service worker (`public/sw.js`) existe só para as notificações e não
guarda cache: a aba precisa estar aberta antes de o sinal cair. Uma
série de treino confirmada com a aba já aberta entra na fila de envio e
sincroniza sozinha assim que a rede volta, mas recarregar a página (ou abrir
o app do zero) sem conexão não funciona, porque o próprio HTML/JS ainda
precisa ser baixado. O uso pensado é academia com sinal ruim mas
intermitente, não modo avião do início ao fim.
