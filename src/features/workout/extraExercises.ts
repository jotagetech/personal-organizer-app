// Exercício extra: acrescentado só ao snapshot da sessão do dia, sem mudar o
// plano. Não existe catálogo de exercícios, então as sugestões saem dos dias
// do plano ativo e dos extras já gravados em sessões anteriores; reaproveitar
// uma sugestão mantém o `exercise_key` dela, e é isso que liga o histórico.

import { slugify } from '@/features/workout/builder/builderIds'
import { parseBuilderNumber } from '@/features/workout/builder/builderDocument'
import type { BuilderRange } from '@/features/workout/builder/builderTypes'
import type { PlanWeek } from '@/features/workout/planWeek'
import { planDefaultRest, resolveEffectiveRest, restFieldsOf, type RestRange } from '@/features/workout/restPrescription'
import { buildSnapshotExercise } from '@/features/workout/snapshot'
import type { WorkoutSnapshot, WorkoutSnapshotExercise } from '@/features/workout/types'
import type { SetMetric, WorkoutPlan } from '@/lib/workoutPlanSchema'

export const EXTRA_KEY_PREFIX = 'extra-'
export const MAX_EXTRA_SETS = 20
const MAX_SUGGESTIONS = 8
const KEY_FALLBACK = 'exercicio'
const FIRST_KEY_SUFFIX = 2

export type ExtraSuggestionSource = { kind: 'plano'; workoutName: string } | { kind: 'extra'; sessionDate: string }

export type ExtraSuggestion = {
    exercise: WorkoutSnapshotExercise
    source: ExtraSuggestionSource
}

export type PastSessionSnapshot = {
    sessionDate: string
    snapshot: WorkoutSnapshot
}

export type ExtraSuggestionSources = {
    plan: WorkoutPlan
    planWeek: PlanWeek | null
    pastSessions: PastSessionSnapshot[]
    todaySnapshot: WorkoutSnapshot
}

// Comparação de nome tolerante a acento, caixa e espaço repetido: "Rosca
// Direta" e "rosca  direta" são o mesmo exercício para quem digita no celular.
export function normalizeExerciseName(nome: string): string {
    const withoutAccents = nome.normalize('NFD').replace(/[̀-ͯ]/g, '')
    const normalized = withoutAccents.toLowerCase().replace(/\s+/g, ' ').trim()

    return normalized
}

// O extra entra sozinho no fim da lista, longe dos parceiros que tinha na
// ficha, então nunca leva o grupo junto.
function asExtra(exercise: WorkoutSnapshotExercise): WorkoutSnapshotExercise {
    const { grupo: _grupo, ...ungrouped } = exercise

    return { ...ungrouped, extra: true }
}

// O plano vem antes dos extras antigos: um exercício que existe nos dois
// lugares com o mesmo `exercise_key` sugere a prescrição atual do plano. Entre
// os extras, a sessão mais recente vence. O que já está no treino de hoje não
// é sugerido.
export function collectExtraSuggestions(sources: ExtraSuggestionSources): ExtraSuggestion[] {
    const seenKeys = new Set(sources.todaySnapshot.exercicios.map((exercicio) => exercicio.exercise_key))
    const defaultRest = planDefaultRest(sources.plan)
    const suggestions: ExtraSuggestion[] = []

    for (const workout of sources.plan.treinos) {
        for (const planned of workout.exercicios) {
            if (seenKeys.has(planned.id)) {
                continue
            }
            seenKeys.add(planned.id)
            suggestions.push({
                exercise: asExtra(buildSnapshotExercise(planned, sources.planWeek, defaultRest)),
                source: { kind: 'plano', workoutName: workout.nome },
            })
        }
    }

    const newestFirst = [...sources.pastSessions].sort((a, b) => (a.sessionDate < b.sessionDate ? 1 : -1))
    for (const pastSession of newestFirst) {
        for (const exercicio of pastSession.snapshot.exercicios) {
            if (!exercicio.extra || seenKeys.has(exercicio.exercise_key)) {
                continue
            }
            seenKeys.add(exercicio.exercise_key)
            suggestions.push({
                exercise: asExtra(exercicio),
                source: { kind: 'extra', sessionDate: pastSession.sessionDate },
            })
        }
    }

    return suggestions
}

// Nome que começa com o texto digitado aparece antes de nome que só o contém.
export function filterExtraSuggestions(suggestions: ExtraSuggestion[], query: string): ExtraSuggestion[] {
    const normalizedQuery = normalizeExerciseName(query)
    if (normalizedQuery === '') {
        return []
    }
    const matches = suggestions.filter((suggestion) =>
        normalizeExerciseName(suggestion.exercise.nome).includes(normalizedQuery),
    )
    const prefixMatches = matches.filter((suggestion) =>
        normalizeExerciseName(suggestion.exercise.nome).startsWith(normalizedQuery),
    )
    const otherMatches = matches.filter((suggestion) => !prefixMatches.includes(suggestion))
    const ranked = [...prefixMatches, ...otherMatches].slice(0, MAX_SUGGESTIONS)

    return ranked
}

export function findExactSuggestion(suggestions: ExtraSuggestion[], query: string): ExtraSuggestion | null {
    const normalizedQuery = normalizeExerciseName(query)
    const exactMatch =
        suggestions.find((suggestion) => normalizeExerciseName(suggestion.exercise.nome) === normalizedQuery) ?? null

    return exactMatch
}

export function knownExerciseKeys(sources: ExtraSuggestionSources): Set<string> {
    const keys = new Set<string>()
    sources.plan.treinos.forEach((workout) => workout.exercicios.forEach((exercicio) => keys.add(exercicio.id)))
    sources.pastSessions.forEach((pastSession) =>
        pastSession.snapshot.exercicios.forEach((exercicio) => keys.add(exercicio.exercise_key)),
    )
    sources.todaySnapshot.exercicios.forEach((exercicio) => keys.add(exercicio.exercise_key))

    return keys
}

// A chave nasce do nome, com prefixo próprio para nunca cair no espaço de ids
// que o montador de plano gera, e ganha sufixo numérico quando já está em
// uso. Gravada no snapshot, ela não muda mais: é a que a sugestão reaproveita
// nas próximas sessões.
export function generateExtraExerciseKey(nome: string, takenKeys: Set<string>): string {
    const base = `${EXTRA_KEY_PREFIX}${slugify(nome) || KEY_FALLBACK}`
    let candidate = base
    let suffix = FIRST_KEY_SUFFIX
    while (takenKeys.has(candidate)) {
        candidate = `${base}-${suffix}`
        suffix += 1
    }

    return candidate
}

export type ExtraExerciseForm = {
    nome: string
    metrica: SetMetric
    series: string
    alvo: BuilderRange
    descanso: BuilderRange
}

export type ParsedExtraExerciseForm = {
    nome: string
    metrica: SetMetric
    seriesCount: number
    alvoMin: number
    alvoMax: number
    descanso: RestRange | null
}

export type ExtraExerciseFormResult =
    | { success: true; value: ParsedExtraExerciseForm }
    | { success: false; message: string }

function isValidTarget(metric: SetMetric, value: number | undefined): value is number {
    if (value === undefined || !Number.isFinite(value) || value <= 0) {
        return false
    }
    const needsInteger = metric !== 'distancia'

    return !needsInteger || Number.isInteger(value)
}

function isValidRest(value: number | undefined): value is number {
    const isValid = value !== undefined && Number.isInteger(value) && value >= 0

    return isValid
}

function parseRest(range: BuilderRange): RestRange | null | 'invalid' {
    const min = parseBuilderNumber(range.min)
    const max = parseBuilderNumber(range.max)
    if (min === undefined && max === undefined) {
        return null
    }
    if (!isValidRest(min) || !isValidRest(max) || min > max) {
        return 'invalid'
    }

    return { min, max }
}

// Mesmas regras do contrato do plano para série e descanso: repetições e
// segundos inteiros positivos, metros positivos, descanso inteiro e opcional.
export function parseExtraExerciseForm(form: ExtraExerciseForm): ExtraExerciseFormResult {
    const nome = form.nome.trim().replace(/\s+/g, ' ')
    if (nome === '') {
        return { success: false, message: 'Informe o nome do exercício.' }
    }
    const seriesCount = parseBuilderNumber(form.series)
    if (seriesCount === undefined || !Number.isInteger(seriesCount) || seriesCount < 1 || seriesCount > MAX_EXTRA_SETS) {
        return { success: false, message: `Informe de 1 a ${MAX_EXTRA_SETS} séries.` }
    }
    const alvoMin = parseBuilderNumber(form.alvo.min)
    const alvoMax = parseBuilderNumber(form.alvo.max)
    if (!isValidTarget(form.metrica, alvoMin) || !isValidTarget(form.metrica, alvoMax) || alvoMin > alvoMax) {
        return { success: false, message: 'Informe o alvo da série (mínimo até máximo).' }
    }
    const descanso = parseRest(form.descanso)
    if (descanso === 'invalid') {
        return { success: false, message: 'Descanso em segundos inteiros, mínimo até máximo, ou vazio.' }
    }

    return { success: true, value: { nome, metrica: form.metrica, seriesCount, alvoMin, alvoMax, descanso } }
}

// Sem descanso próprio vale o padrão do plano, pela mesma resolução de camadas
// usada na montagem do snapshot; o resultado fica gravado no exercício.
export function buildNewExtraExercise(
    exerciseKey: string,
    parsed: ParsedExtraExerciseForm,
    defaultRest: RestRange | null,
): WorkoutSnapshotExercise {
    const rest = resolveEffectiveRest({
        tipo: 'series',
        serie: null,
        variacaoSemana: null,
        exercicio: parsed.descanso,
        padraoPlano: defaultRest,
    })
    const series = Array.from({ length: parsed.seriesCount }, (_, seriesIndex) => ({
        set_index: seriesIndex + 1,
        metrica: parsed.metrica,
        alvo_min: parsed.alvoMin,
        alvo_max: parsed.alvoMax,
        carga_sugerida: null,
        descanso_segundos_min: null,
        descanso_segundos_max: null,
        quedas: [],
    }))
    const exercise: WorkoutSnapshotExercise = {
        exercise_key: exerciseKey,
        nome: parsed.nome,
        tipo: 'series',
        intervalado: null,
        equipamento: null,
        forma_carga: 'total',
        por_lado: false,
        ...restFieldsOf(rest),
        rir_alvo_min: null,
        rir_alvo_max: null,
        observacoes: null,
        series,
        extra: true,
    }

    return exercise
}

// Entra no fim da lista, marcado como extra. Uma chave que o snapshot já tem
// não entra de novo: reaplicar o mesmo extra (reenvio da fila, releitura da
// data) deixa o snapshot igual.
export function appendExtraExercise(snapshot: WorkoutSnapshot, exercise: WorkoutSnapshotExercise): WorkoutSnapshot {
    const alreadyPresent = snapshot.exercicios.some((exercicio) => exercicio.exercise_key === exercise.exercise_key)
    if (alreadyPresent) {
        return snapshot
    }

    return { ...snapshot, exercicios: [...snapshot.exercicios, asExtra(exercise)] }
}

export function appendExtraExercises(snapshot: WorkoutSnapshot, exercises: WorkoutSnapshotExercise[]): WorkoutSnapshot {
    return exercises.reduce(appendExtraExercise, snapshot)
}
