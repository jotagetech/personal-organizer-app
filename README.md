# Treino e Alimentação (v0)

App pessoal para registrar treinos (a partir de um plano importado em JSON) e
alimentação do dia a dia. Ver `instrucoes-app-treino-alimentacao-v0.md` (fora do
controle de versão) para a especificação completa.

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
2. Aplique a migração em `supabase/migrations/20260927000000_init.sql` (via
   `supabase db push`, ou colando o conteúdo no SQL Editor do projeto).
3. Em **Authentication → Providers**, mantenha e-mail/senha habilitado e crie
   manualmente o único usuário da conta pessoal (a v0 não tem tela de cadastro
   público, por decisão de escopo).
4. Copie a URL do projeto e a `anon key` para `.env` (`VITE_SUPABASE_URL` e
   `VITE_SUPABASE_ANON_KEY`).
5. RLS já vem habilitado pela migração, restringindo cada tabela ao próprio
   usuário autenticado. Nenhuma chave privilegiada (`service_role`) é usada no
   frontend.

## Estrutura

```
src/
  lib/              contrato do plano (Zod), datas, cliente Supabase, tipos do banco
  contexts/         sessão de auth e data selecionada, compartilhados entre abas
  features/
    auth/           tela de login
    shared/         navegação inferior, cabeçalho de data
    workout/        importação de plano, sugestão de treino do dia, sessão/séries
    food/           formulário e lista de consumo por refeição
supabase/migrations/  esquema SQL + RLS + função de importação atômica de plano
examples/             plano de treino de exemplo (JSON)
schemas/               JSON Schema gerado a partir do contrato Zod
tests/                 testes Vitest (contrato, datas, seleção de treino, hash canônico)
```

## O que foi verificado nesta entrega

- `npm run typecheck`, `npm run build` e `npm run test` (24 testes) rodam limpos.
- `npm run schema:generate` gera `schemas/workout-plan.schema.json` a partir do
  mesmo schema Zod usado em runtime (sem duplicar as regras do contrato).
- O servidor de desenvolvimento sobe e serve a página corretamente
  (`curl` no `index.html` gerado pelo Vite).

## O que NÃO foi verificado (depende de credenciais reais do Supabase)

- Nenhuma chamada real a Supabase foi exercitada (login, importação de plano,
  criação de sessão/séries, RLS em produção): não há projeto Supabase
  configurado nesta entrega.
- Não houve verificação visual em navegador real do fluxo completo (extensão
  Claude para Chrome não estava conectada no momento da implementação).
- As políticas de RLS e a função `import_workout_plan` foram escritas e
  revisadas, mas não testadas contra um banco real.

Antes de considerar a v0 pronta para uso: criar o projeto Supabase, aplicar a
migração, configurar `.env`, criar o usuário único, e validar manualmente os
fluxos de treino e alimentação num celular real ou emulado.
