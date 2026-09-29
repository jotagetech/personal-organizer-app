import type { BodyWeightEntryRow, SleepEntryRow } from '@/features/bodyMetrics/types'
import type { CardioEntryRow } from '@/features/cardio/types'
import type { FoodEntryRow, MealCategory } from '@/features/food/types'
import type { WorkoutSessionRow, WorkoutSetRow } from '@/features/workout/types'

export type WorkoutSignal = 'none' | 'in_progress' | 'finished'

export type DaySignals = {
    workout: WorkoutSignal
    mealsLogged: Set<MealCategory>
    foodEntryCount: number
    bodyWeightLogged: boolean
    sleepLogged: boolean
    cardioCount: number
}

export type DayWorkoutResult = { session: WorkoutSessionRow; sets: WorkoutSetRow[] } | null

export type DaySignalSources = {
    workoutResult: DayWorkoutResult
    foodEntries: FoodEntryRow[]
    bodyWeightEntry: BodyWeightEntryRow | null
    sleepEntry: SleepEntryRow | null
    cardioEntries: CardioEntryRow[]
}

// Lógica pura, sem chamada de rede: dado o resultado de cada consulta, deriva
// os sinais. Fica num módulo sem dependência do cliente Supabase pra ser
// reaproveitada por quem já buscou esses mesmos dados por outro motivo (ex:
// getDaySummary, ou a exportação de um período inteiro), sem duplicar a busca.
export function deriveDaySignals(sources: DaySignalSources): DaySignals {
    const mealsLogged = new Set<MealCategory>(
        sources.foodEntries.map((entry) => entry.meal_category as MealCategory),
    )

    return {
        workout: deriveWorkoutSignal(sources.workoutResult),
        mealsLogged,
        foodEntryCount: sources.foodEntries.length,
        bodyWeightLogged: sources.bodyWeightEntry !== null,
        sleepLogged: sources.sleepEntry !== null,
        cardioCount: sources.cardioEntries.length,
    }
}

function deriveWorkoutSignal(workoutResult: DayWorkoutResult): WorkoutSignal {
    if (!workoutResult) {
        return 'none'
    }

    return workoutResult.session.finished_at ? 'finished' : 'in_progress'
}
