// Busca no catálogo de exercícios pelo que a pessoa digita: nome oficial,
// apelido global, apelido da conta, iniciais ("srh" para supino reto com
// halteres) ou nome genérico ("pull down"), que devolve as variações da
// família para ela escolher.

import type { ExerciseCatalogData, ExerciseRow } from '@/features/exerciseCatalog/types'
import { normalizeAlias } from '@/lib/exerciseCatalogSeed'

export type CatalogMatchKind = 'nome' | 'apelido' | 'meu_apelido' | 'iniciais'

export type CatalogMatch = {
    exercise: ExerciseRow
    kind: CatalogMatchKind
    // Texto que casou, para mostrar "apelido: stiff" ao lado do nome.
    matchedText: string
    score: number
}

export type GenericMatch = {
    name: string
    exercises: ExerciseRow[]
}

export type CatalogSearchResult = {
    generic: GenericMatch | null
    matches: CatalogMatch[]
}

type SearchEntry = {
    exerciseId: string
    norm: string
    text: string
    kind: Exclude<CatalogMatchKind, 'iniciais'>
}

export type CatalogIndex = {
    exercisesById: Map<string, ExerciseRow>
    entries: SearchEntry[]
    initialsByExerciseId: Map<string, string>
    genericByNorm: Map<string, GenericMatch>
}

export const DEFAULT_SEARCH_LIMIT = 8

const MIN_QUERY_LENGTH = 2
const MAX_INITIALS_LENGTH = 6

// Conectivos ficam fora das iniciais: "supino reto com halteres" vira "srh".
const INITIALS_STOPWORDS = new Set(['a', 'o', 'e', 'ao', 'com', 'de', 'da', 'do', 'em', 'na', 'no', 'nas', 'nos', 'para', 'sem'])

const SCORE = {
    exact: 100,
    exactInitials: 75,
    prefix: 70,
    everyWordPrefix: 60,
    initialsPrefix: 50,
    contains: 40,
}

// Apelido da própria conta é escolha explícita da pessoa, então vence o
// global de mesmo encaixe.
const OWN_ALIAS_BONUS = 5

export function nameInitials(nameNorm: string): string {
    const initials = nameNorm
        .split(' ')
        .filter((word) => word !== '' && !INITIALS_STOPWORDS.has(word))
        .map((word) => word[0])
        .join('')

    return initials
}

export function buildCatalogIndex(data: ExerciseCatalogData, currentUserId: string | null): CatalogIndex {
    const visibleExercises = data.exercises.filter((exercise) => exercise.merged_into_id === null)
    const exercisesById = new Map(visibleExercises.map((exercise) => [exercise.id, exercise]))
    const nameEntries: SearchEntry[] = visibleExercises.map((exercise) => ({
        exerciseId: exercise.id,
        norm: exercise.name_norm,
        text: exercise.name_pt,
        kind: 'nome',
    }))
    const aliasEntries: SearchEntry[] = data.aliases
        .filter((alias) => exercisesById.has(alias.exercise_id))
        .map((alias) => ({
            exerciseId: alias.exercise_id,
            norm: alias.alias_norm,
            text: alias.alias,
            kind: alias.owner_user_id !== null && alias.owner_user_id === currentUserId ? 'meu_apelido' : 'apelido',
        }))
    const initialsByExerciseId = new Map(
        visibleExercises.map((exercise) => [exercise.id, nameInitials(exercise.name_norm)]),
    )
    const genericByNorm = new Map(
        data.genericNames.map((generic) => {
            const familyExercises = visibleExercises
                .filter((exercise) => exercise.family !== null && generic.families.includes(exercise.family))
                .sort(compareByName)

            return [generic.name_norm, { name: generic.name, exercises: familyExercises }]
        }),
    )
    const index = { exercisesById, entries: [...nameEntries, ...aliasEntries], initialsByExerciseId, genericByNorm }

    return index
}

function compareByName(first: ExerciseRow, second: ExerciseRow): number {
    const order = first.name_pt.localeCompare(second.name_pt, 'pt-BR')

    return order
}

function entryScore(entry: SearchEntry, query: string, queryWords: string[]): number {
    const entryWords = entry.norm.split(' ')
    const everyWordIsPrefix = queryWords.every((queryWord) =>
        entryWords.some((entryWord) => entryWord.startsWith(queryWord)),
    )
    const baseScore = entry.norm === query
        ? SCORE.exact
        : entry.norm.startsWith(query)
            ? SCORE.prefix
            : everyWordIsPrefix
                ? SCORE.everyWordPrefix
                : entry.norm.includes(query)
                    ? SCORE.contains
                    : 0
    const bonus = baseScore > 0 && entry.kind === 'meu_apelido' ? OWN_ALIAS_BONUS : 0
    const score = baseScore + bonus

    return score
}

function initialsScore(initials: string, query: string): number {
    const looksLikeInitials = !query.includes(' ') && query.length <= MAX_INITIALS_LENGTH
    const score = !looksLikeInitials || initials.length < MIN_QUERY_LENGTH
        ? 0
        : initials === query
            ? SCORE.exactInitials
            : initials.startsWith(query)
                ? SCORE.initialsPrefix
                : 0

    return score
}

function keepBest(bestByExercise: Map<string, CatalogMatch>, candidate: CatalogMatch) {
    const current = bestByExercise.get(candidate.exercise.id)
    if (!current || candidate.score > current.score) {
        bestByExercise.set(candidate.exercise.id, candidate)
    }
}

function compareMatches(first: CatalogMatch, second: CatalogMatch): number {
    const order = second.score - first.score || compareByName(first.exercise, second.exercise)

    return order
}

export function searchCatalog(index: CatalogIndex, rawQuery: string, limit = DEFAULT_SEARCH_LIMIT): CatalogSearchResult {
    const query = normalizeAlias(rawQuery)
    if (query.length < MIN_QUERY_LENGTH) {
        return { generic: null, matches: [] }
    }
    const queryWords = query.split(' ')
    const bestByExercise = new Map<string, CatalogMatch>()

    for (const entry of index.entries) {
        const score = entryScore(entry, query, queryWords)
        const exercise = index.exercisesById.get(entry.exerciseId)
        if (score > 0 && exercise) {
            keepBest(bestByExercise, { exercise, kind: entry.kind, matchedText: entry.text, score })
        }
    }
    for (const [exerciseId, initials] of index.initialsByExerciseId) {
        const score = initialsScore(initials, query)
        const exercise = index.exercisesById.get(exerciseId)
        if (score > 0 && exercise) {
            keepBest(bestByExercise, { exercise, kind: 'iniciais', matchedText: initials, score })
        }
    }

    const matches = [...bestByExercise.values()].sort(compareMatches).slice(0, limit)
    const generic = index.genericByNorm.get(query) ?? null
    const result = { generic, matches }

    return result
}

export function findExerciseBySlug(index: CatalogIndex, slug: string): ExerciseRow | null {
    const found = [...index.exercisesById.values()].find((exercise) => exercise.slug === slug) ?? null

    return found
}

// O texto digitado já leva ao exercício sem precisar de apelido novo: é o
// nome, um apelido existente ou as iniciais dele.
export function isKnownNameFor(index: CatalogIndex, rawText: string, exerciseId: string): boolean {
    const text = normalizeAlias(rawText)
    const matchesEntry = index.entries.some((entry) => entry.exerciseId === exerciseId && entry.norm === text)
    const matchesInitials = index.initialsByExerciseId.get(exerciseId) === text
    const isKnown = text === '' || matchesEntry || matchesInitials

    return isKnown
}
