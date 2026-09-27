import { setKey, type WorkoutSetRow, type WorkoutSnapshot } from '@/features/workout/types'

export type StepPosition = { exerciseIndex: number; setIndexInExercise: number }

export function findFirstIncompletePosition(
    snapshot: WorkoutSnapshot,
    setsByKey: Map<string, WorkoutSetRow>,
): StepPosition | null {
    for (let exerciseIndex = 0; exerciseIndex < snapshot.exercicios.length; exerciseIndex += 1) {
        const exercicio = snapshot.exercicios[exerciseIndex]
        for (let setIndexInExercise = 0; setIndexInExercise < exercicio.series.length; setIndexInExercise += 1) {
            const set = exercicio.series[setIndexInExercise]
            const existingSet = setsByKey.get(setKey(exercicio.exercise_key, set.set_index))
            if (!existingSet?.completed_at) {
                return { exerciseIndex, setIndexInExercise }
            }
        }
    }

    return null
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

export function isLastPosition(snapshot: WorkoutSnapshot, position: StepPosition): boolean {
    const isLastExercise = position.exerciseIndex === snapshot.exercicios.length - 1
    const currentExercicio = snapshot.exercicios[position.exerciseIndex]
    const isLastSetInExercise = position.setIndexInExercise === currentExercicio.series.length - 1

    return isLastExercise && isLastSetInExercise
}
