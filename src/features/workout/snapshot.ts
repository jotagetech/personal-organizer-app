import type { Workout } from '@/lib/workoutPlanSchema'
import type { WorkoutSnapshot } from '@/features/workout/types'

export function buildWorkoutSnapshot(workout: Workout): WorkoutSnapshot {
    const exercicios = workout.exercicios.map((exercicio) => ({
        exercise_key: exercicio.id,
        nome: exercicio.nome,
        forma_carga: exercicio.forma_carga,
        series: exercicio.series.map((set, seriesIndex) => ({
            set_index: seriesIndex + 1,
            repeticoes_min: set.repeticoes_min,
            repeticoes_max: set.repeticoes_max,
            carga_sugerida: set.carga_sugerida ?? null,
        })),
    }))

    const snapshot: WorkoutSnapshot = {
        workout_key: workout.id,
        nome: workout.nome,
        exercicios,
    }

    return snapshot
}
