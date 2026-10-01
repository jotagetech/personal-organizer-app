# Seed do catálogo global de exercícios

Fonte do catálogo compartilhado (`exercises` com `owner_user_id is null`) e dos
apelidos globais (`exercise_aliases` com `owner_user_id is null`). Ainda não
existe migração que carregue estes arquivos no banco.

| Arquivo | Conteúdo |
|---|---|
| `exercises.json` | Um registro por exercício: `slug`, `name_pt`, `family`, `primary_muscle`, `secondary_muscles`, `equipment`, `pegada`, `largura_pegada`, `acessorio`, `default_load_form`, `description_pt`, `source`, `source_ref`, `license`, `attribution` |
| `aliases.json` | Apelidos globais: `alias` (como as pessoas escrevem), `alias_norm` (forma de busca) e `slug` do exercício |
| `generic_names.json` | Nomes que valem para mais de uma variação: `name`, `name_norm` e `families`. A busca por um deles mostra os exercícios dessas famílias para a pessoa escolher |

Apelido de uma conta só (uma sigla pessoal como "sprh", por exemplo) não entra
aqui: ele mora no banco, ligado ao usuário. Este arquivo guarda só nomes que
qualquer pessoa reconheceria como o mesmo exercício.

## Origem e licença

Nomes, apelidos e descrições foram escritos do zero em pt-BR, com o vocabulário
de academia brasileira. Nenhum texto foi copiado de outra base. Por isso todo
registro tem `source = "proprio"`, `license = "proprio"` e `attribution = null`.

Duas bases abertas serviram só como lista de conferência de cobertura (quais
exercícios existem, quais músculos e equipamentos cada um envolve), sem
reaproveitar nome, descrição ou imagem:

- [wger](https://wger.de) (API `/api/v2/exerciseinfo/`): conteúdo sob
  CC-BY-SA 3.0/4.0 e CC0 por exercício.
- [free-exercise-db](https://github.com/yuhonas/free-exercise-db): repositório
  sob Unlicense, mas com origem incerta dos textos e das imagens, por isso nada
  dele é copiado.

Se um registro passar a reaproveitar texto de uma fonte externa, ele precisa de
`source` com o nome da fonte, `source_ref` com o id lá, `license` e
`attribution`. O validador recusa o registro sem esses campos. Texto vindo de
fonte CC-BY-SA também obriga a distribuir aquele texto sob CC-BY-SA.

## Regra de identidade

Dois registros são o mesmo exercício quando a carga de um é comparável à do
outro.

- Equipamento diferente gera exercício diferente: barra, halteres, máquina,
  smith e polia ficam separados (`supino_reto_barra` e `supino_reto_halteres`).
- Pegada, largura, acessório, ângulo do banco ou alavanca que mudam a carga
  também separam: puxada aberta pronada, fechada pronada, supinada, neutra e
  com triângulo são cinco exercícios; tríceps na polia com barra reta, barra
  W, corda e pegada supinada são quatro; Copenhagen curta e longa, dois.
- Pegada, largura e acessório ficam em campos próprios (`pegada`,
  `largura_pegada`, `acessorio`), com os mesmos valores do contrato do plano.
  Na mesma família e equipamento, dois exercícios iguais nos três campos são
  recusados como duplicata. Quando a diferença está no trajeto e não na
  pegada (puxada atrás da nuca, remada Pendlay), o exercício ganha família
  própria.
- Tempo controlado, pausa, drop, número de séries, "leve" ou "pesado" são
  prescrição do plano e não geram exercício novo.
- Alternar os braços não muda a carga por halter: rosca alternada é a mesma
  `rosca_direta_halteres`, e elevação frontal alternada é a mesma
  `elevacao_frontal_halteres`.
- Stiff e levantamento terra romeno com barra ficam no mesmo exercício
  (`stiff_barra`), porque nas fichas brasileiras os dois nomes são usados para
  o mesmo movimento.
- Variações relacionadas se agrupam por `family` (`supino_reto`, `puxada`,
  `stiff`).
- Na dúvida, o registro fica separado. Juntar depois é fácil, mas separar
  histórico misturado não é.

## Vocabulários

`equipment` segue `EQUIPMENT_TYPES` do contrato do plano
(`src/lib/workoutPlanSchema.ts`): `barra`, `halteres`, `maquina`, `cabo`,
`kettlebell`, `elastico`, `peso_corporal`, `outro`. Smith e barra hexagonal
contam como `maquina` e `barra`, respectivamente; anilha e roda abdominal são
`outro`.

`default_load_form` segue `LOAD_CONVENTIONS` do mesmo arquivo: `total`,
`por_lado`, `por_halter`, `peso_corporal`, `assistencia`. É só o valor sugerido;
o plano continua dizendo a forma real de cada exercício.

`primary_muscle` e `secondary_muscles` usam `MUSCLE_GROUPS`
(`src/lib/exerciseCatalogSeed.ts`), pensado para somar volume semanal por grupo:

`peito`, `costas`, `trapezio`, `lombar`, `ombro_anterior`, `ombro_lateral`,
`ombro_posterior`, `biceps`, `triceps`, `antebraco`, `abdomen`, `gluteos`,
`quadriceps`, `posterior_coxa`, `adutores`, `abdutores`, `panturrilha`,
`tibial`.

Cada exercício tem um primário só, onde a série conta no volume. Os secundários
são informativos.

## Formato

- `slug`: minúsculas, sem acento, `_` como separador. É estável para sempre,
  porque vai para o JSON do plano e para o conversor. Renomear o exercício muda
  `name_pt`, nunca o `slug`.
- `alias_norm`: `normalizeAlias(alias)`, que deixa tudo minúsculo, sem acento e
  troca qualquer pontuação por espaço ("Leg press 45°" vira `leg press 45`).
- Um `alias_norm` aponta para um exercício só e não pode repetir o nome oficial
  normalizado de outro exercício.
- Nome usado para mais de uma variação não vira apelido de nenhuma delas: vai
  para `generic_names.json`, ligado às famílias. "Flexora" pode ser mesa ou
  cadeira; "pull down" e "puxador frente" aparecem nas fichas para várias
  puxadas; "remada baixa", "tríceps polia" e "rosca direta" também. Quem
  escreve um desses escolhe a variação, e a escolha pode virar apelido da
  conta dela. Nome cuja variação padrão é universal continua apelido
  global: "supino reto" é sempre a pegada média, "barra fixa" é sempre a
  pronada.

## Como editar e validar

Os três JSON são a fonte; não há geração automática a partir de base externa.
Para incluir um exercício, acrescente o registro em `exercises.json` e os
apelidos em `aliases.json`, com `alias_norm` já normalizado. Nome genérico
entra em `generic_names.json`, com `name_norm` normalizado. Depois rode:

```bash
npm run test
```

O teste `tests/exerciseCatalogSeed.test.ts` passa os três arquivos por
`validateExerciseSeed` e falha listando cada problema: slug repetido ou fora do
formato, vocabulário inválido (inclusive pegada, largura e acessório), duas
variações iguais na mesma família, apelido apontando para slug inexistente,
`alias_norm` errado ou repetido entre exercícios, nome genérico de família
inexistente ou que já é apelido, e fonte externa sem licença.
