import { getBodyWeightForDate, getSleepForDate } from '@/features/bodyMetrics/api'
import { listCardioEntriesForDate } from '@/features/cardio/api'
import { listFoodEntriesForDate } from '@/features/food/api'
import { deriveDaySignals, type DaySignals } from '@/features/shared/deriveDaySignals'
import { getSessionForDate } from '@/features/workout/api'
import type { IsoDate } from '@/lib/dateUtils'

export { deriveDaySignals }
export type { DaySignals, WorkoutSignal } from '@/features/shared/deriveDaySignals'

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
