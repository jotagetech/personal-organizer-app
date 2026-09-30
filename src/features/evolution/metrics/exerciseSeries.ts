// Evolução de um exercício sessão a sessão. Usa o mesmo recorte e as mesmas
// contas dos recordes, então o ponto mais alto de cada série é o recorde.

import type { ExerciseLog, LogSet } from '@/features/evolution/data/exerciseLog'
import {
    estimateOneRepMax,
    exerciseSeriesScope,
    isEstimable,
    sessionTotalReps,
    sessionVolume,
    type DateRange,
    type RecordKind,
} from '@/features/evolution/metrics/exerciseStats'
import type { IsoDate } from '@/lib/dateUtils'
import type { LoadConvention, SetMetric } from '@/lib/workoutPlanSchema'

export type SessionPoint = {
    date: IsoDate
    // Carga máxima, reps, menor assistência, tempo ou distância, conforme a
    // forma de carga e a métrica do exercício.
    topValue: number
    oneRepMax: number | null
    volume: number | null
}

function maxOf(values: readonly number[]): number | null {
    const max = values.length === 0 ? null : Math.max(...values)

    return max
}

function minOf(values: readonly number[]): number | null {
    const min = values.length === 0 ? null : Math.min(...values)

    return min
}

function positiveOrNull(value: number | null): number | null {
    const result = value !== null && value > 0 ? value : null

    return result
}

function numbersOf(sets: readonly LogSet[], pick: (set: LogSet) => number | null): number[] {
    const values = sets.map(pick).filter((value): value is number => value !== null)

    return values
}

// Qual recorde a série de valor principal acompanha.
export function topRecordKind(metric: SetMetric, formaCarga: LoadConvention): RecordKind {
    if (metric === 'tempo') {
        return 'maxDuration'
    }
    if (metric === 'distancia') {
        return 'maxDistance'
    }
    switch (formaCarga) {
        case 'peso_corporal':
            return 'maxReps'
        case 'assistencia':
            return 'minAssistance'
        case 'total':
        case 'por_lado':
        case 'por_halter':
            return 'maxLoad'
    }
}

function topValueOf(sets: readonly LogSet[], kind: RecordKind): number | null {
    switch (kind) {
        case 'maxDuration':
            return positiveOrNull(maxOf(numbersOf(sets, (set) => set.durationSeconds)))
        case 'maxDistance':
            return positiveOrNull(maxOf(numbersOf(sets, (set) => set.distanceM)))
        case 'maxReps':
            return positiveOrNull(maxOf(numbersOf(sets, (set) => set.reps)))
        case 'minAssistance': {
            const assisted = sets.filter((set) => set.loadKg !== null && (set.reps ?? 0) >= 1)

            return minOf(numbersOf(assisted, (set) => set.loadKg))
        }
        default:
            return positiveOrNull(maxOf(numbersOf(sets, (set) => set.loadKg)))
    }
}

function hasLoadFormula(metric: SetMetric, formaCarga: LoadConvention): boolean {
    const isRepsMetric = metric === 'repeticoes'
    const isLoaded = formaCarga === 'total' || formaCarga === 'por_lado' || formaCarga === 'por_halter'

    return isRepsMetric && isLoaded
}

function bestOneRepMaxOf(sets: readonly LogSet[]): number | null {
    const estimates = sets.filter(isEstimable).map((set) => estimateOneRepMax(set.loadKg ?? 0, set.reps ?? 0))

    return positiveOrNull(maxOf(estimates))
}

function volumeOf(sets: readonly LogSet[], metric: SetMetric, formaCarga: LoadConvention): number | null {
    if (metric !== 'repeticoes') {
        return null
    }
    if (formaCarga === 'peso_corporal') {
        return positiveOrNull(sessionTotalReps(sets))
    }
    if (formaCarga === 'assistencia') {
        return null
    }

    return positiveOrNull(sessionVolume(sets))
}

// Do mais antigo para o mais novo, um ponto por sessão. Sessão sem valor
// principal (por exemplo, só séries sem carga) não vira ponto.
export function exerciseSessionSeries(log: ExerciseLog, key: string, range?: DateRange): SessionPoint[] {
    const scope = exerciseSeriesScope(log, key, range)
    if (scope === null) {
        return []
    }

    const { metric, formaCarga } = scope
    const kind = topRecordKind(metric, formaCarga)
    const canEstimate = hasLoadFormula(metric, formaCarga)
    const points: SessionPoint[] = []
    scope.sessions.forEach((session) => {
        const topValue = topValueOf(session.sets, kind)
        if (topValue === null) {
            return
        }
        points.push({
            date: session.date,
            topValue,
            oneRepMax: canEstimate ? bestOneRepMaxOf(session.sets) : null,
            volume: volumeOf(session.sets, metric, formaCarga),
        })
    })

    return points
}
