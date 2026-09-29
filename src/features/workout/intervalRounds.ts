// Conferência das rodadas do intervalado antes de gravar: vem do timer, do
// que já estava registrado ou (lançamento sem timer) da prescrição. Cada
// rodada vira uma linha de série de tempo, com o trabalho em
// duration_seconds e o RPE do bloco repetido em cada rodada feita.

import type { IntervalRoundResult } from '@/features/workout/intervalTimer'
import { setStatusOf, type SkipSetValues } from '@/features/workout/sessionProgress'
import { setKey, type WorkoutSetRow, type WorkoutSnapshotExercise } from '@/features/workout/types'
import { MAX_RPE, MIN_RPE } from '@/lib/workoutPlanSchema'

export type EditableRound = {
    setIndex: number
    status: 'feita' | 'pulada'
    secondsText: string
    // Quando a rodada terminou de verdade (timer) ou foi registrada antes;
    // null usa a hora da confirmação.
    resolvedAtIso: string | null
}

function defaultWorkSeconds(exercicio: WorkoutSnapshotExercise): number {
    return exercicio.intervalado?.trabalho_segundos_max ?? exercicio.series[0]?.alvo_max ?? 0
}

export function roundsFromTimer(exercicio: WorkoutSnapshotExercise, results: IntervalRoundResult[]): EditableRound[] {
    return exercicio.series.map((serie, roundPosition) => {
        const result = results[roundPosition]
        if (!result) {
            return { setIndex: serie.set_index, status: 'pulada', secondsText: '', resolvedAtIso: null }
        }

        return {
            setIndex: serie.set_index,
            status: result.status,
            secondsText: result.workSeconds === null ? '' : String(result.workSeconds),
            resolvedAtIso: new Date(result.endedAtMs).toISOString(),
        }
    })
}

// Sem registro nenhum, a rodada aparece como feita no alvo: é o caso de quem
// fez o intervalado sem o timer e só quer confirmar.
export function roundsFromRows(
    exercicio: WorkoutSnapshotExercise,
    setsByKey: Map<string, WorkoutSetRow>,
): EditableRound[] {
    const fallbackSeconds = String(defaultWorkSeconds(exercicio))

    return exercicio.series.map((serie) => {
        const row = setsByKey.get(setKey(exercicio.exercise_key, serie.set_index))
        const status = setStatusOf(row)
        if (status === 'skipped') {
            const resolvedAtIso = row?.skipped_at ?? null
            return { setIndex: serie.set_index, status: 'pulada', secondsText: fallbackSeconds, resolvedAtIso }
        }
        if (status === 'completed' && row) {
            const secondsText = row.duration_seconds === null ? fallbackSeconds : String(row.duration_seconds)
            return { setIndex: serie.set_index, status: 'feita', secondsText, resolvedAtIso: row.completed_at }
        }

        return { setIndex: serie.set_index, status: 'feita', secondsText: fallbackSeconds, resolvedAtIso: null }
    })
}

export function rpeFromRows(exercicio: WorkoutSnapshotExercise, setsByKey: Map<string, WorkoutSetRow>): number | null {
    for (const serie of exercicio.series) {
        const rpe = setsByKey.get(setKey(exercicio.exercise_key, serie.set_index))?.rpe
        if (rpe != null) {
            return rpe
        }
    }

    return null
}

export function parseRoundSeconds(text: string): number | null {
    const normalizedText = text.trim()
    if (!/^\d+$/.test(normalizedText)) {
        return null
    }
    const seconds = Number(normalizedText)

    return seconds > 0 ? seconds : null
}

export function isValidRpe(rpe: number | null): boolean {
    return rpe === null || (Number.isInteger(rpe) && rpe >= MIN_RPE && rpe <= MAX_RPE)
}

export function canConfirmRounds(rounds: EditableRound[], rpe: number | null): boolean {
    const everyDoneRoundHasTime = rounds.every(
        (round) => round.status === 'pulada' || parseRoundSeconds(round.secondsText) !== null,
    )

    return everyDoneRoundHasTime && isValidRpe(rpe)
}

// O comentário que a linha já tinha sobrevive à regravação.
export function buildIntervalRoundValues(
    exercicio: WorkoutSnapshotExercise,
    rounds: EditableRound[],
    rpe: number | null,
    setsByKey: Map<string, WorkoutSetRow>,
    nowIso: string,
): SkipSetValues[] {
    return rounds.map((round) => {
        const note = setsByKey.get(setKey(exercicio.exercise_key, round.setIndex))?.note ?? null
        const resolvedAtIso = round.resolvedAtIso ?? nowIso
        const isDone = round.status === 'feita'

        return {
            setIndex: round.setIndex,
            values: {
                loadKg: null,
                reps: null,
                rir: null,
                note,
                completedAt: isDone ? resolvedAtIso : null,
                skippedAt: isDone ? null : resolvedAtIso,
                metric: 'tempo',
                durationSeconds: isDone ? parseRoundSeconds(round.secondsText) : null,
                distanceM: null,
                rpe: isDone ? rpe : null,
            },
        }
    })
}
