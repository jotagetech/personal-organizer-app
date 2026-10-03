import { getBodyWeightForDate, getSleepForDate } from '@/features/bodyMetrics/api'
import { listCardioEntriesForDate } from '@/features/cardio/api'
import { listFoodEntriesForDate } from '@/features/food/api'
import {
    buildDaySignalsByDate,
    type SignalFoodRow,
    type SignalMetricRow,
    type SignalSessionRow,
} from '@/features/shared/buildDaySignalsByDate'
import { deriveDaySignals, type DaySignals } from '@/features/shared/deriveDaySignals'
import { getSessionForDate } from '@/features/workout/api'
import { listDatesInPeriod } from '@/features/export/period'
import { supabase } from '@/lib/supabaseClient'
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

async function selectRangeRows<Row>(
    table: 'workout_sessions' | 'food_entries' | 'body_weight_entries' | 'sleep_entries',
    columns: string,
    dateColumn: 'session_date' | 'entry_date',
    start: IsoDate,
    end: IsoDate,
): Promise<Row[]> {
    const { data, error } = await supabase.from(table).select(columns).gte(dateColumn, start).lte(dateColumn, end)
    if (error) {
        throw new Error(error.message)
    }

    return (data ?? []) as Row[]
}

// Os mesmos sinais de fetchDaySignals para vários dias, com uma consulta por
// tabela para o intervalo inteiro, lendo só as colunas que os sinais usam.
export async function fetchDaySignalsForRange(start: IsoDate, end: IsoDate): Promise<Map<IsoDate, DaySignals>> {
    const [sessions, foodEntries, bodyWeightEntries, sleepEntries] = await Promise.all([
        selectRangeRows<SignalSessionRow>('workout_sessions', 'session_date, finished_at', 'session_date', start, end),
        selectRangeRows<SignalFoodRow>('food_entries', 'entry_date, meal_category', 'entry_date', start, end),
        selectRangeRows<SignalMetricRow>('body_weight_entries', 'entry_date', 'entry_date', start, end),
        selectRangeRows<SignalMetricRow>('sleep_entries', 'entry_date', 'entry_date', start, end),
    ])
    const signalsByDate = buildDaySignalsByDate(listDatesInPeriod({ start, end }), {
        sessions,
        foodEntries,
        bodyWeightEntries,
        sleepEntries,
    })

    return signalsByDate
}
