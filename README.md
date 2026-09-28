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

   Via `supabase db push`, ou colando cada arquivo no SQL Editor do projeto.
3. Em **Authentication → Providers**, mantenha e-mail/senha habilitado e crie
   manualmente o único usuário da conta pessoal (sem tela de cadastro público,
   por decisão de escopo).
4. Copie a URL do projeto e a `anon key` para `.env` (`VITE_SUPABASE_URL` e
   `VITE_SUPABASE_ANON_KEY`).
5. RLS habilitado em todas as tabelas, restringindo cada uma ao próprio
   usuário autenticado. Nenhuma chave privilegiada (`service_role`) é usada no
   frontend.

## Funcionalidades

- **Treino**: importa plano de treino via JSON, sugere o treino do dia,
  registra um exercício/uma série por vez (carga, repetições, RIR opcional,
  comentário livre por série), com barra de progresso e opção de voltar.
  Finalizar o treino registra duração, sentimento (escala 1-5) e abre o
  registro de cardio do dia.
- **Ciclo**: marca a data de início de um ciclo de treino (menu "⋮" na aba
  Treino) e mostra "Dia N do ciclo", independente de trocas no plano.
- **Cardio**: catálogo de atividades cadastrado na hora, registro por dia
  (duração, distância opcional, sentimento, observação).
- **Alimentação**: catálogo de alimentos com nutrição opcional (kcal/
  proteína/carboidrato/gordura por uma quantidade de referência), semeado com
  a Tabela TACO. Chips de "frequentes", autocomplete, sugestão de refeição
  pela hora do dia, total diário de kcal/proteína.
- **Peso corporal e sono**: registro rápido diário (um número, upsert por
  dia), na aba Resultados.
- **Resultados**: grade semanal de dias de treino concluído (verde = treino
  finalizado naquele dia), mais os registros de peso/sono.

## Estrutura

```
src/
  lib/              contrato do plano (Zod), datas, cliente Supabase, tipos do banco
  contexts/         sessão de auth e data selecionada, compartilhados entre abas
  features/
    auth/           tela de login
    shared/         navegação inferior, cabeçalho de data
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
