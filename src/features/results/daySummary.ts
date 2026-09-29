import { setStatusOf, type SetStatus } from '@/features/workout/sessionProgress'
import { setKey, type WorkoutSetRow, type WorkoutSnapshot } from '@/features/workout/types'

export type WorkoutSetSummary = {
    setIndex: number
    loadKg: number | null
    reps: number | null
    rir: number | null
    note: string | null
    isCompleted: boolean
    status: SetStatus
}

export type WorkoutExerciseSummary = {
    exerciseKey: string
    exerciseName: string
    sets: WorkoutSetSummary[]
}

export type WorkoutSummary = {
    exercises: WorkoutExerciseSummary[]
    orphanSets: WorkoutSetRow[]
}

// Séries órfãs acontecem quando o plano foi trocado depois de séries já
// registradas (o exercise_key delas não existe mais no snapshot atual);
// separá-las evita perder o registro histórico ao mesmo tempo que evita
// tratá-las como parte do treino de hoje.
export function summarizeWorkoutSets(snapshot: WorkoutSnapshot, sets: WorkoutSetRow[]): WorkoutSummary {
    const setsByKey = new Map(sets.map((set) => [setKey(set.exercise_key, set.set_index), set]))
    const knownKeys = new Set<string>()

    const exercises: WorkoutExerciseSummary[] = snapshot.exercicios.map((exercicio) => {
        const exerciseSets: WorkoutSetSummary[] = exercicio.series.map((serie) => {
            const key = setKey(exercicio.exercise_key, serie.set_index)
            knownKeys.add(key)
            const matchingSet = setsByKey.get(key)
            const status = setStatusOf(matchingSet)

            const setSummary: WorkoutSetSummary = {
                setIndex: serie.set_index,
                loadKg: matchingSet?.load_kg ?? null,
                reps: matchingSet?.reps ?? null,
                rir: matchingSet?.rir ?? null,
                note: matchingSet?.note ?? null,
                isCompleted: status === 'completed',
                status,
            }
            return setSummary
        })

        const exerciseSummary: WorkoutExerciseSummary = {
            exerciseKey: exercicio.exercise_key,
            exerciseName: exercicio.nome,
            sets: exerciseSets,
        }
        return exerciseSummary
    })

    const orphanSets = sets.filter((set) => !knownKeys.has(setKey(set.exercise_key, set.set_index)))

    return { exercises, orphanSets }
}
