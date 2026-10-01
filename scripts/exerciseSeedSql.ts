import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

export const EXERCISE_SEED_DIR = path.join(projectRoot, 'supabase', 'seed', 'exercises')

export type SeedExerciseRow = {
    slug: string
    name_pt: string
    family: string
    primary_muscle: string
    secondary_muscles: string[]
    equipment: string
    pegada: string | null
    largura_pegada: string | null
    acessorio: string | null
    padrao_movimento: string
    default_load_form: string
    description_pt: string
    source: string
    source_ref: string | null
    license: string | null
    attribution: string | null
}

export type SeedAliasRow = { alias: string; alias_norm: string; slug: string }

export type SeedGenericNameRow = { name: string; name_norm: string; families: string[] }

export type ExerciseSeedFiles = {
    exercises: SeedExerciseRow[]
    aliases: SeedAliasRow[]
    genericNames: SeedGenericNameRow[]
}

const EXERCISE_COLUMNS = [
    'slug',
    'name_pt',
    'family',
    'primary_muscle',
    'secondary_muscles',
    'equipment',
    'pegada',
    'largura_pegada',
    'acessorio',
    'padrao_movimento',
    'default_load_form',
    'description_pt',
    'source',
    'source_ref',
    'license',
    'attribution',
] as const

const UPDATABLE_EXERCISE_COLUMNS = EXERCISE_COLUMNS.filter((column) => column !== 'slug')

function readJsonFile<T>(fileName: string): T {
    const content = readFileSync(path.join(EXERCISE_SEED_DIR, fileName), 'utf8')
    const parsed = JSON.parse(content) as T

    return parsed
}

export function readExerciseSeedFiles(): ExerciseSeedFiles {
    const seedFiles = {
        exercises: readJsonFile<SeedExerciseRow[]>('exercises.json'),
        aliases: readJsonFile<SeedAliasRow[]>('aliases.json'),
        genericNames: readJsonFile<SeedGenericNameRow[]>('generic_names.json'),
    }

    return seedFiles
}

export function sqlText(value: string | null): string {
    const literal = value === null ? 'null' : `'${value.replaceAll("'", "''")}'`

    return literal
}

export function sqlTextArray(values: string[]): string {
    const items = values.map(sqlText).join(', ')
    const literal = values.length === 0 ? `'{}'::text[]` : `array[${items}]::text[]`

    return literal
}

function exerciseValues(exercise: SeedExerciseRow): string {
    const values = EXERCISE_COLUMNS.map((column) => {
        const value = exercise[column]
        const literal = Array.isArray(value) ? sqlTextArray(value) : sqlText(value)

        return literal
    })
    const row = `    (${values.join(', ')})`

    return row
}

function exercisesUpsert(exercises: SeedExerciseRow[]): string {
    const assignments = UPDATABLE_EXERCISE_COLUMNS.map((column) => `    ${column} = excluded.${column}`).join(',\n')
    const statement = [
        `insert into exercises (${EXERCISE_COLUMNS.join(', ')})`,
        'values',
        exercises.map(exerciseValues).join(',\n'),
        'on conflict (slug) where owner_user_id is null do update set',
        `${assignments};`,
    ].join('\n')

    return statement
}

// Apelido global que saiu do seed deixa de existir; o que ficou é atualizado
// para o slug atual. Apelidos de conta não são tocados.
function aliasesSync(aliases: SeedAliasRow[]): string {
    const rows = aliases.map((alias) => `    (${sqlText(alias.alias)}, ${sqlText(alias.slug)})`).join(',\n')
    const statement = [
        'create temporary table seed_exercise_aliases (alias text, slug text);',
        'insert into seed_exercise_aliases (alias, slug) values',
        `${rows};`,
        '',
        'delete from exercise_aliases a',
        'where a.owner_user_id is null',
        '    and a.alias_norm not in (select normalize_exercise_name(s.alias) from seed_exercise_aliases s);',
        '',
        'insert into exercise_aliases (exercise_id, owner_user_id, alias)',
        'select e.id, null, s.alias',
        'from seed_exercise_aliases s',
        'join exercises e on e.slug = s.slug and e.owner_user_id is null',
        'on conflict (alias_norm) where owner_user_id is null do update set',
        '    exercise_id = excluded.exercise_id,',
        '    alias = excluded.alias;',
        '',
        'drop table seed_exercise_aliases;',
    ].join('\n')

    return statement
}

function genericNamesSync(genericNames: SeedGenericNameRow[]): string {
    const rows = genericNames
        .map((generic) => `    (${sqlText(generic.name_norm)}, ${sqlText(generic.name)}, ${sqlTextArray(generic.families)})`)
        .join(',\n')
    const names = genericNames.map((generic) => sqlText(generic.name_norm)).join(', ')
    const statement = [
        `delete from exercise_generic_names where name_norm not in (${names});`,
        '',
        'insert into exercise_generic_names (name_norm, name, families) values',
        rows,
        'on conflict (name_norm) do update set',
        '    name = excluded.name,',
        '    families = excluded.families;',
    ].join('\n')

    return statement
}

// Depois de carregar o catálogo, toda série existente é ligada de novo pela
// mesma regra do gatilho, para o histórico anterior também ganhar vínculo.
// Snapshot sem a lista de exercícios é pulado em vez de derrubar o update.
const RELINK_ALL_SETS = [
    'update workout_sets ws',
    "set exercise_id = resolve_exercise_id(s.user_id, item ->> 'catalogo', item ->> 'nome')",
    'from workout_sessions s',
    'cross join lateral jsonb_array_elements(',
    '    case',
    "        when jsonb_typeof(s.workout_snapshot -> 'exercicios') = 'array' then s.workout_snapshot -> 'exercicios'",
    "        else '[]'::jsonb",
    '    end',
    ') as item',
    "where ws.session_id = s.id and item ->> 'exercise_key' = ws.exercise_key;",
].join('\n')

const HEADER = [
    '-- Gerado por `npm run exercises:seed-sql` a partir de supabase/seed/exercises/.',
    '-- Não editar à mão: mudar os JSON da pasta e gerar uma migração nova.',
    '-- Conteúdo próprio (nomes, apelidos e descrições escritos para o app).',
].join('\n')

export function buildExerciseSeedSql(seed: ExerciseSeedFiles): string {
    const sql = [
        HEADER,
        exercisesUpsert(seed.exercises),
        aliasesSync(seed.aliases),
        genericNamesSync(seed.genericNames),
        RELINK_ALL_SETS,
    ].join('\n\n')

    return `${sql}\n`
}
