// Textos do cardio intervalado: a prescrição no card da sessão e o resultado
// no detalhe do dia. Minuto inteiro vira "min" (blocos de 3 a 4 min); o resto
// fica em segundos, que é como a ficha costuma escrever tiros curtos.

import { formatDecimal } from '@/features/workout/setPresentation'
import type { WorkoutSnapshotInterval } from '@/features/workout/types'

const SECONDS_PER_MINUTE = 60

function isWholeMinute(seconds: number): boolean {
    return seconds >= SECONDS_PER_MINUTE && seconds % SECONDS_PER_MINUTE === 0
}

export function formatIntervalSeconds(seconds: number): string {
    if (isWholeMinute(seconds)) {
        return `${formatDecimal(seconds / SECONDS_PER_MINUTE)} min`
    }

    return `${formatDecimal(seconds)} s`
}

export function formatIntervalSecondsRange(min: number, max: number): string {
    if (min === max) {
        return formatIntervalSeconds(min)
    }
    if (isWholeMinute(min) && isWholeMinute(max)) {
        return `${formatDecimal(min / SECONDS_PER_MINUTE)} a ${formatDecimal(max / SECONDS_PER_MINUTE)} min`
    }

    return `${formatDecimal(min)} a ${formatDecimal(max)} s`
}

export function formatRpeRange(min: number | null, max: number | null): string | null {
    if (min === null || max === null) {
        return null
    }

    return min === max ? `RPE ${min}` : `RPE ${min} a ${max}`
}

// "8 × 30 s / 90 s": rodadas × trabalho / recuperação.
export function formatIntervalPrescription(interval: WorkoutSnapshotInterval): string {
    const work = formatIntervalSecondsRange(interval.trabalho_segundos_min, interval.trabalho_segundos_max)
    const recovery = formatIntervalSecondsRange(interval.recuperacao_segundos_min, interval.recuperacao_segundos_max)

    return `${interval.rodadas} × ${work} / ${recovery}`
}

export type IntervalRoundOutcome = {
    status: 'completed' | 'skipped' | 'pending'
    durationSeconds: number | null
    rpe: number | null
}

function rangeOf(values: number[]): { min: number; max: number } | null {
    if (values.length === 0) {
        return null
    }

    return { min: Math.min(...values), max: Math.max(...values) }
}

// Resultado do dia: "8 × 30 s / 90 s · RPE 8". O trabalho é o que foi feito
// (faixa quando as rodadas variaram), a recuperação é a prescrita, porque ela
// não é registrada.
export function formatIntervalResult(interval: WorkoutSnapshotInterval, rounds: IntervalRoundOutcome[]): string {
    const doneRounds = rounds.filter((round) => round.status === 'completed')
    const skippedCount = rounds.filter((round) => round.status === 'skipped').length
    const skippedText = skippedCount > 0 ? ` · ${skippedCount} ${skippedCount === 1 ? 'pulada' : 'puladas'}` : ''
    if (doneRounds.length === 0) {
        return skippedCount > 0 ? `nenhuma rodada feita${skippedText}` : 'não registrado'
    }

    const workRange = rangeOf(
        doneRounds.map((round) => round.durationSeconds).filter((seconds): seconds is number => seconds !== null),
    )
    const workText = workRange ? formatIntervalSecondsRange(workRange.min, workRange.max) : '?'
    const recoveryText = formatIntervalSecondsRange(interval.recuperacao_segundos_min, interval.recuperacao_segundos_max)
    const rpeRange = rangeOf(doneRounds.map((round) => round.rpe).filter((rpe): rpe is number => rpe !== null))
    const rpeText = rpeRange ? ` · ${formatRpeRange(rpeRange.min, rpeRange.max)}` : ''

    return `${doneRounds.length} × ${workText} / ${recoveryText}${rpeText}${skippedText}`
}
