import { cycleWeekOn } from '@/features/cycle/cycleProgress'
import type { IsoDate } from '@/lib/dateUtils'
import type { Exercise, Workout, WorkoutPlan } from '@/lib/workoutPlanSchema'

export type PlanWeek = {
    semana: number
    totalSemanas: number
    descricao: string | null
}

// Quando o ciclo passa da duração do bloco, o bloco recomeça: com 4 semanas,
// a semana 5 do ciclo volta a ser a semana 1. Assim um ciclo longo segue a
// periodização em vez de ficar parado na semana de redução de volume.
export function resolvePlanWeek(
    plan: WorkoutPlan,
    cycleStartDate: IsoDate | null,
    date: IsoDate,
): PlanWeek | null {
    if (plan.bloco_semanas === null || cycleStartDate === null) {
        return null
    }

    const cycleWeek = cycleWeekOn(cycleStartDate, date)
    if (cycleWeek === null) {
        return null
    }

    const semana = ((cycleWeek - 1) % plan.bloco_semanas) + 1
    const description = plan.semanas.find((week) => week.semana === semana)

    return { semana, totalSemanas: plan.bloco_semanas, descricao: description?.descricao ?? null }
}

export function formatPlanWeekLabel(semana: number, totalSemanas: number): string {
    return `Semana ${semana} de ${totalSemanas}`
}

function applyWeekToExercise(exercise: Exercise, semana: number): Exercise {
    const variation = exercise.variacoes_semana.find((candidate) => candidate.semanas.includes(semana))
    if (!variation) {
        return exercise
    }

    const overridesRest = variation.descanso_segundos_min !== null
    const overridesRir = variation.rir_alvo_min !== null

    return {
        ...exercise,
        series: variation.series ?? exercise.series,
        descanso_segundos_min: overridesRest ? variation.descanso_segundos_min : exercise.descanso_segundos_min,
        descanso_segundos_max: overridesRest ? variation.descanso_segundos_max : exercise.descanso_segundos_max,
        rir_alvo_min: overridesRir ? variation.rir_alvo_min : exercise.rir_alvo_min,
        rir_alvo_max: overridesRir ? variation.rir_alvo_max : exercise.rir_alvo_max,
    }
}

// Sem semana (plano sem bloco ou sem ciclo ativo), o treino vale como está,
// com as séries base de cada exercício.
export function applyWeekToWorkout(workout: Workout, semana: number | null): Workout {
    if (semana === null) {
        return workout
    }

    return { ...workout, exercicios: workout.exercicios.map((exercise) => applyWeekToExercise(exercise, semana)) }
}
