import type { Workout } from '@/lib/workoutPlanSchema'
import { CURRENT_SNAPSHOT_VERSION } from '@/lib/workoutSnapshotSchema'
import { applyWeekToWorkout, type PlanWeek } from '@/features/workout/planWeek'
import type { WorkoutSnapshot } from '@/features/workout/types'

export function buildWorkoutSnapshot(workout: Workout, planWeek: PlanWeek | null = null): WorkoutSnapshot {
    const workoutForWeek = applyWeekToWorkout(workout, planWeek?.semana ?? null)
    const exercicios = workoutForWeek.exercicios.map((exercicio) => ({
        exercise_key: exercicio.id,
        nome: exercicio.nome,
        tipo: exercicio.tipo,
        intervalado: exercicio.intervalado ? { ...exercicio.intervalado } : null,
        equipamento: exercicio.equipamento,
        forma_carga: exercicio.forma_carga,
        por_lado: exercicio.por_lado,
        descanso_segundos_min: exercicio.descanso_segundos_min,
        descanso_segundos_max: exercicio.descanso_segundos_max,
        rir_alvo_min: exercicio.rir_alvo_min,
        rir_alvo_max: exercicio.rir_alvo_max,
        observacoes: exercicio.observacoes,
        series: exercicio.series.map((set, seriesIndex) => ({
            set_index: seriesIndex + 1,
            metrica: set.metrica,
            alvo_min: set.alvo_min,
            alvo_max: set.alvo_max,
            carga_sugerida: set.carga_sugerida,
            quedas: set.quedas.map((drop, dropPosition) => ({
                drop_index: dropPosition + 1,
                alvo_min: drop.alvo_min,
                alvo_max: drop.alvo_max,
                carga_sugerida: drop.carga_sugerida,
            })),
        })),
    }))

    const snapshot: WorkoutSnapshot = {
        versao: CURRENT_SNAPSHOT_VERSION,
        workout_key: workout.id,
        nome: workout.nome,
        semana_bloco: planWeek?.semana ?? null,
        bloco_semanas: planWeek?.totalSemanas ?? null,
        descricao_semana: planWeek?.descricao ?? null,
        exercicios,
    }

    return snapshot
}
