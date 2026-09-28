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

type DaySignalSources = {
    workoutResult: Awaited<ReturnType<typeof getSessionForDate>>
    foodEntries: Awaited<ReturnType<typeof listFoodEntriesForDate>>
    bodyWeightEntry: Awaited<ReturnType<typeof getBodyWeightForDate>>
    sleepEntry: Awaited<ReturnType<typeof getSleepForDate>>
    cardioEntries: Awaited<ReturnType<typeof listCardioEntriesForDate>>
}

// Lógica pura, sem chamada de rede: dado o resultado de cada consulta, deriva
// os sinais. Extraída pra ser reaproveitada por quem já buscou esses mesmos
// dados por outro motivo (ex: getDaySummary), sem duplicar a busca.
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

    return deriveDaySignals({ workoutResult, foodEntries, bodyWeightEntry, sleepEntry, cardioEntries })
}

function deriveWorkoutSignal(workoutResult: Awaited<ReturnType<typeof getSessionForDate>>): WorkoutSignal {
    if (!workoutResult) {
        return 'none'
    }

    return workoutResult.session.finished_at ? 'finished' : 'in_progress'
}
