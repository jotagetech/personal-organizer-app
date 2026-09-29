import { cycleWeekOn } from '@/features/cycle/cycleProgress'
import type { IsoDate } from '@/lib/dateUtils'
import {
    buildIntervalExercise,
    type Exercise,
    type ExerciseWeekVariation,
    type IntervalPrescription,
    type Workout,
    type WorkoutPlan,
} from '@/lib/workoutPlanSchema'

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

// Cada par da faixa é trocado inteiro (a validação exige os dois campos
// juntos), então basta olhar o mínimo para saber se a variação mexe nele.
function applyWeekToIntervalExercise(
    exercise: Exercise,
    prescription: IntervalPrescription,
    variation: ExerciseWeekVariation,
): Exercise {
    const {
        trabalho_segundos_min: workMin,
        trabalho_segundos_max: workMax,
        recuperacao_segundos_min: recoveryMin,
        recuperacao_segundos_max: recoveryMax,
    } = variation
    const overridesWork = workMin !== null && workMax !== null
    const overridesRecovery = recoveryMin !== null && recoveryMax !== null
    const overridesRpe = variation.rpe_alvo_min !== null
    const prescriptionForWeek: IntervalPrescription = {
        ...prescription,
        rodadas: variation.rodadas ?? prescription.rodadas,
        trabalho_segundos_min: overridesWork ? workMin : prescription.trabalho_segundos_min,
        trabalho_segundos_max: overridesWork ? workMax : prescription.trabalho_segundos_max,
        recuperacao_segundos_min: overridesRecovery ? recoveryMin : prescription.recuperacao_segundos_min,
        recuperacao_segundos_max: overridesRecovery ? recoveryMax : prescription.recuperacao_segundos_max,
        rpe_alvo_min: overridesRpe ? variation.rpe_alvo_min : prescription.rpe_alvo_min,
        rpe_alvo_max: overridesRpe ? variation.rpe_alvo_max : prescription.rpe_alvo_max,
    }

    return buildIntervalExercise(exercise, prescriptionForWeek)
}

function applyWeekToExercise(exercise: Exercise, semana: number): Exercise {
    const variation = exercise.variacoes_semana.find((candidate) => candidate.semanas.includes(semana))
    if (!variation) {
        return exercise
    }
    if (exercise.intervalado) {
        return applyWeekToIntervalExercise(exercise, exercise.intervalado, variation)
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
