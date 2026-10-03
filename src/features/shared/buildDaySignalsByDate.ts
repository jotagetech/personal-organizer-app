import type { MealCategory } from '@/features/food/types'
import type { DaySignals, WorkoutSignal } from '@/features/shared/deriveDaySignals'
import type { IsoDate } from '@/lib/dateUtils'

// Só as colunas que os sinais usam: quem busca por intervalo lê esse recorte
// em vez da linha inteira.
export type SignalSessionRow = { session_date: IsoDate; finished_at: string | null }
export type SignalFoodRow = { entry_date: IsoDate; meal_category: string }
export type SignalMetricRow = { entry_date: IsoDate }

export type DaySignalsRangeSources = {
    sessions: SignalSessionRow[]
    foodEntries: SignalFoodRow[]
    bodyWeightEntries: SignalMetricRow[]
    sleepEntries: SignalMetricRow[]
}

function groupByDate<Row>(rows: Row[], dateOf: (row: Row) => IsoDate): Map<IsoDate, Row[]> {
    const rowsByDate = new Map<IsoDate, Row[]>()
    for (const row of rows) {
        const date = dateOf(row)
        const dateRows = rowsByDate.get(date)
        if (dateRows) {
            dateRows.push(row)
        } else {
            rowsByDate.set(date, [row])
        }
    }

    return rowsByDate
}

function workoutSignalOf(sessions: SignalSessionRow[]): WorkoutSignal {
    if (sessions.length === 0) {
        return 'none'
    }

    return sessions.some((session) => session.finished_at) ? 'finished' : 'in_progress'
}

// Lógica pura: monta os sinais de cada data pedida a partir das leituras de
// um intervalo inteiro. Toda data pedida tem entrada no mapa, mesmo sem
// registro nenhum. O cardio não entra nos sinais da rotina, então a contagem
// dele fica zerada.
export function buildDaySignalsByDate(dates: IsoDate[], sources: DaySignalsRangeSources): Map<IsoDate, DaySignals> {
    const sessionsByDate = groupByDate(sources.sessions, (row) => row.session_date)
    const foodByDate = groupByDate(sources.foodEntries, (row) => row.entry_date)
    const weightDates = new Set(sources.bodyWeightEntries.map((row) => row.entry_date))
    const sleepDates = new Set(sources.sleepEntries.map((row) => row.entry_date))

    const signalsByDate = new Map<IsoDate, DaySignals>()
    for (const date of dates) {
        const foodEntries = foodByDate.get(date) ?? []
        signalsByDate.set(date, {
            workout: workoutSignalOf(sessionsByDate.get(date) ?? []),
            mealsLogged: new Set(foodEntries.map((entry) => entry.meal_category as MealCategory)),
            foodEntryCount: foodEntries.length,
            bodyWeightLogged: weightDates.has(date),
            sleepLogged: sleepDates.has(date),
            cardioCount: 0,
        })
    }

    return signalsByDate
}
