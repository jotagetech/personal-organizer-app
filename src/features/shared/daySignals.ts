import { getBodyWeightForDate, getSleepForDate } from '@/features/bodyMetrics/api'
import { listCardioEntriesForDate } from '@/features/cardio/api'
import { listFoodEntriesForDate } from '@/features/food/api'
import type { MealCategory } from '@/features/food/types'
import { getSessionForDate } from '@/features/workout/api'
import type { IsoDate } from '@/lib/dateUtils'

export type WorkoutSignal = 'none' | 'in_progress' | 'finished'

export type DaySignals = {
    workout: WorkoutSignal
    mealsLogged: Set<MealCategory>
    foodEntryCount: number
    bodyWeightLogged: boolean
    sleepLogged: boolean
    cardioCount: number
}

// Sinais leves pro indicador das abas: só presença/ausência, nunca os dados
// completos do dia (isso já existe em getDaySummary, pro detalhe do dia em
// Resultados, e é caro demais pra rodar a cada troca de aba/data).
export async function fetchDaySignals(date: IsoDate): Promise<DaySignals> {
    const [workoutResult, foodEntries, bodyWeightEntry, sleepEntry, cardioEntries] = await Promise.all([
        getSessionForDate(date),
        listFoodEntriesForDate(date),
        getBodyWeightForDate(date),
        getSleepForDate(date),
        listCardioEntriesForDate(date),
    ])

    const mealsLogged = new Set<MealCategory>(
        foodEntries.map((entry) => entry.meal_category as MealCategory),
    )

    const daySignals: DaySignals = {
        workout: deriveWorkoutSignal(workoutResult),
        mealsLogged,
        foodEntryCount: foodEntries.length,
        bodyWeightLogged: bodyWeightEntry !== null,
        sleepLogged: sleepEntry !== null,
        cardioCount: cardioEntries.length,
    }
    return daySignals
}

function deriveWorkoutSignal(workoutResult: Awaited<ReturnType<typeof getSessionForDate>>): WorkoutSignal {
    if (!workoutResult) {
        return 'none'
    }

    return workoutResult.session.finished_at ? 'finished' : 'in_progress'
}
