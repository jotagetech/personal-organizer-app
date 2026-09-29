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
- **Treino**: importa plano de treino via JSON, sugere o treino do dia,
  registra um exercício/uma série por vez (carga, repetições, RIR opcional,
  comentário livre por série), com barra de progresso e opção de voltar.
  Séries podem ser de repetições, tempo ou distância, com drop set (cada
  queda é um passo próprio), e o card mostra equipamento, execução por lado,
  RIR alvo, descanso prescrito e observações do plano (ver "Plano de treino
  (contrato)").
  Finalizar o treino registra duração, sentimento (escala 1-5) e abre o
  registro de cardio do dia.
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

**Versões.** O contrato atual é a `versao: 2`. Arquivos `versao: 1` (só
repetições, com `carga_sugerida`) continuam sendo aceitos sem nenhuma
alteração, e planos e sessões já salvos com o formato antigo são lidos
normalmente: o app normaliza tudo para o formato atual na leitura. Uma série
antiga sem métrica gravada vale como repetições.

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

**Descanso** prescrito, em segundos (`descanso_segundos_min` e
`descanso_segundos_max`, sempre o par):

```json
{ "descanso_segundos_min": 90, "descanso_segundos_max": 120 }
```

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

**Observações** (`observacoes`): texto livre do exercício, mostrado no card:

```json
{ "observacoes": "Descida controlada de 4 a 6 segundos." }
```

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
- A exportação JSON por período mantém o formato anterior e só acrescenta
  campos: por exercício `equipment`, `per_side`, `rest_seconds_min/max`,
  `target_rir_min/max` e `notes`; por série planejada `drops` (alvos das
  quedas); por série realizada `drops` (o que foi feito em cada queda).

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
    cycle/          ciclo de treino (data de início, "Dia N do ciclo")
    cardio/         catálogo de atividades e registro de cardio
    food/           catálogo de alimentos (TACO + próprios), consumo por refeição
    bodyMetrics/    peso corporal e sono (registro rápido diário)
    results/        grade semanal de treinos concluídos
supabase/migrations/  esquema SQL + RLS + funções (importação de plano, cálculo nutricional)
examples/             plano de treino de exemplo (JSON)
schemas/               JSON Schema gerado a partir do contrato Zod
tests/                 testes Vitest (contrato, datas, seleção de treino, hash canônico,
                        progresso de sessão, grade de resultados, sugestão de refeição)
CHANGELOG.md           histórico de mudanças, por data
```

## Estado atual

Em uso real pelo autor, testado no celular. Ver `CHANGELOG.md` para o
histórico de features e correções. Pendência conhecida: integração com
Google Fit (sono/passos do Amazfit/Zepp), adiada por ser um projeto à parte
(exige OAuth e uma Edge Function), ainda não implementada.

Instalável na tela de início (manifest e ícones em `public/`, nome
"Organizer"), abrindo em tela cheia como app.

Sem service worker: a aba precisa estar aberta antes de o sinal cair. Uma
série de treino confirmada com a aba já aberta entra na fila de envio e
sincroniza sozinha assim que a rede volta, mas recarregar a página (ou abrir
o app do zero) sem conexão não funciona, porque o próprio HTML/JS ainda
precisa ser baixado. O uso pensado é academia com sinal ruim mas
intermitente, não modo avião do início ao fim.
