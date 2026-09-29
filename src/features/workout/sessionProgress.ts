import {
    setKey,
    type WorkoutSetRow,
    type WorkoutSnapshot,
    type WorkoutSnapshotExercise,
} from '@/features/workout/types'
import type { OutboxSetValues } from '@/lib/outbox/outboxQueue'

export type StepPosition = { exerciseIndex: number; setIndexInExercise: number }

export type SetStatus = 'completed' | 'skipped' | 'pending'

// completed_at e skipped_at nunca coexistem (check no banco); se algum dado
// antigo trouxer os dois, concluída vence porque carrega carga e repetições.
export function setStatusOf(row: WorkoutSetRow | undefined): SetStatus {
    if (row?.completed_at) {
        return 'completed'
    }
    if (row?.skipped_at) {
        return 'skipped'
    }

    return 'pending'
}

export function isSetResolved(row: WorkoutSetRow | undefined): boolean {
    return setStatusOf(row) !== 'pending'
}

function rowAtPosition(
    snapshot: WorkoutSnapshot,
    setsByKey: Map<string, WorkoutSetRow>,
    position: StepPosition,
): WorkoutSetRow | undefined {
    const exercicio = snapshot.exercicios[position.exerciseIndex]
    const serie = exercicio.series[position.setIndexInExercise]

    return setsByKey.get(setKey(exercicio.exercise_key, serie.set_index))
}

function allPositions(snapshot: WorkoutSnapshot): StepPosition[] {
    const positions: StepPosition[] = []
    snapshot.exercicios.forEach((exercicio, exerciseIndex) => {
        exercicio.series.forEach((_serie, setIndexInExercise) => {
            positions.push({ exerciseIndex, setIndexInExercise })
        })
    })

    return positions
}

function isSamePosition(a: StepPosition, b: StepPosition): boolean {
    return a.exerciseIndex === b.exerciseIndex && a.setIndexInExercise === b.setIndexInExercise
}

export function findFirstIncompletePosition(
    snapshot: WorkoutSnapshot,
    setsByKey: Map<string, WorkoutSetRow>,
): StepPosition | null {
    const firstUnresolved = allPositions(snapshot).find(
        (position) => !isSetResolved(rowAtPosition(snapshot, setsByKey, position)),
    )

    return firstUnresolved ?? null
}

// Com navegação livre entre exercícios, a próxima série a fazer não é
// necessariamente a seguinte na ordem da ficha: pode ter ficado algo para trás
// num exercício anterior, então a busca dá a volta até o início.
export function findNextUnresolvedPosition(
    snapshot: WorkoutSnapshot,
    setsByKey: Map<string, WorkoutSetRow>,
    from: StepPosition,
): StepPosition | null {
    const positions = allPositions(snapshot)
    const fromIndex = positions.findIndex((position) => isSamePosition(position, from))
    const startIndex = fromIndex === -1 ? 0 : fromIndex + 1

    for (let offset = 0; offset < positions.length; offset += 1) {
        const candidate = positions[(startIndex + offset) % positions.length]
        if (!isSetResolved(rowAtPosition(snapshot, setsByKey, candidate))) {
            return candidate
        }
    }

    return null
}

export function firstUnresolvedSetInExercise(
    snapshot: WorkoutSnapshot,
    setsByKey: Map<string, WorkoutSetRow>,
    exerciseIndex: number,
): StepPosition {
    const exercicio = snapshot.exercicios[exerciseIndex]
    const unresolvedSetIndex = exercicio.series.findIndex(
        (serie) => !isSetResolved(setsByKey.get(setKey(exercicio.exercise_key, serie.set_index))),
    )

    return { exerciseIndex, setIndexInExercise: unresolvedSetIndex === -1 ? 0 : unresolvedSetIndex }
}

export function isOnlyUnresolvedSet(
    snapshot: WorkoutSnapshot,
    setsByKey: Map<string, WorkoutSetRow>,
    position: StepPosition,
): boolean {
    return allPositions(snapshot).every(
        (candidate) =>
            isSamePosition(candidate, position) || isSetResolved(rowAtPosition(snapshot, setsByKey, candidate)),
    )
}

export type SkipSetValues = { setIndex: number; values: OutboxSetValues }

// Pular o exercício só mexe no que ainda não foi feito: série concluída
// continua concluída, e o comentário de uma série pendente sobrevive ao pulo.
export function buildSkipValuesForRemainingSets(
    exercicio: WorkoutSnapshotExercise,
    setsByKey: Map<string, WorkoutSetRow>,
    nowIso: string,
): SkipSetValues[] {
    const skipValues: SkipSetValues[] = []

    for (const serie of exercicio.series) {
        const existingRow = setsByKey.get(setKey(exercicio.exercise_key, serie.set_index))
        if (isSetResolved(existingRow)) {
            continue
        }

        skipValues.push({ setIndex: serie.set_index, values: buildSkippedSetValues(existingRow?.note ?? null, nowIso) })
    }

    return skipValues
}

export function buildSkippedSetValues(note: string | null, nowIso: string): OutboxSetValues {
    return { loadKg: null, reps: null, rir: null, note, completedAt: null, skippedAt: nowIso }
}

export type SetStatusCounts = { completed: number; skipped: number; pending: number; total: number }

export function countSetsByStatus(snapshot: WorkoutSnapshot, setsByKey: Map<string, WorkoutSetRow>): SetStatusCounts {
    const counts: SetStatusCounts = { completed: 0, skipped: 0, pending: 0, total: 0 }

    for (const position of allPositions(snapshot)) {
        counts[setStatusOf(rowAtPosition(snapshot, setsByKey, position))] += 1
        counts.total += 1
    }

    return counts
}

export type ExerciseProgress = {
    exerciseIndex: number
    nome: string
    completed: number
    skipped: number
    total: number
}

export function summarizeExerciseProgress(
    snapshot: WorkoutSnapshot,
    setsByKey: Map<string, WorkoutSetRow>,
): ExerciseProgress[] {
    return snapshot.exercicios.map((exercicio, exerciseIndex) => {
        const statuses = exercicio.series.map((serie) =>
            setStatusOf(setsByKey.get(setKey(exercicio.exercise_key, serie.set_index))),
        )

        return {
            exerciseIndex,
            nome: exercicio.nome,
            completed: statuses.filter((status) => status === 'completed').length,
            skipped: statuses.filter((status) => status === 'skipped').length,
            total: statuses.length,
        }
    })
}

export function advancePosition(snapshot: WorkoutSnapshot, position: StepPosition): StepPosition | null {
    const currentExercicio = snapshot.exercicios[position.exerciseIndex]
    const hasNextSetInExercise = position.setIndexInExercise + 1 < currentExercicio.series.length
    if (hasNextSetInExercise) {
        return { exerciseIndex: position.exerciseIndex, setIndexInExercise: position.setIndexInExercise + 1 }
    }

    const hasNextExercise = position.exerciseIndex + 1 < snapshot.exercicios.length
    if (hasNextExercise) {
        return { exerciseIndex: position.exerciseIndex + 1, setIndexInExercise: 0 }
    }

    return null
}

export function retreatPosition(snapshot: WorkoutSnapshot, position: StepPosition): StepPosition {
    const hasPreviousSetInExercise = position.setIndexInExercise > 0
    if (hasPreviousSetInExercise) {
        return { exerciseIndex: position.exerciseIndex, setIndexInExercise: position.setIndexInExercise - 1 }
    }

    const previousExerciseIndex = position.exerciseIndex - 1
    const previousExercicio = snapshot.exercicios[previousExerciseIndex]
    return { exerciseIndex: previousExerciseIndex, setIndexInExercise: previousExercicio.series.length - 1 }
}

export function totalSetCount(snapshot: WorkoutSnapshot): number {
    const total = snapshot.exercicios.reduce((sum, exercicio) => sum + exercicio.series.length, 0)

    return total
}

export function positionToGlobalIndex(snapshot: WorkoutSnapshot, position: StepPosition): number {
    const setsInPreviousExercises = snapshot.exercicios
        .slice(0, position.exerciseIndex)
        .reduce((sum, exercicio) => sum + exercicio.series.length, 0)

    return setsInPreviousExercises + position.setIndexInExercise
}

export function isLastPosition(snapshot: WorkoutSnapshot, position: StepPosition): boolean {
    const isLastExercise = position.exerciseIndex === snapshot.exercicios.length - 1
    const currentExercicio = snapshot.exercicios[position.exerciseIndex]
    const isLastSetInExercise = position.setIndexInExercise === currentExercicio.series.length - 1

    return isLastExercise && isLastSetInExercise
}
