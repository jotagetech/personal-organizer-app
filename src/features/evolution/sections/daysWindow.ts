import { cycleForDate } from '@/features/cycle/cycleTimeline'
import type { WorkoutCycleRow } from '@/features/cycle/types'
import { shiftIsoDate, type IsoDate } from '@/lib/dateUtils'

const DEFAULT_LOOKBACK_DAYS = 27

export type DaysWindow = {
    // Início da janela consultada; nunca depois de hoje.
    rangeStart: IsoDate
    cycleNumber: number | null
    cycleStart: IsoDate | null
    // Último dia do ciclo quando ele já tem data de fim.
    cycleEnd: IsoDate | null
}

// A janela segue o ciclo da data selecionada. Sem ciclo nessa data, vale os
// últimos dias.
export function resolveDaysWindow(
    cycles: readonly WorkoutCycleRow[],
    selectedDate: IsoDate,
    today: IsoDate,
): DaysWindow {
    const current = cycleForDate(cycles, selectedDate)
    if (!current) {
        return {
            rangeStart: shiftIsoDate(today, -DEFAULT_LOOKBACK_DAYS),
            cycleNumber: null,
            cycleStart: null,
            cycleEnd: null,
        }
    }

    const cycleStart = current.cycle.start_date

    return {
        rangeStart: cycleStart <= today ? cycleStart : today,
        cycleNumber: current.number,
        cycleStart,
        cycleEnd: current.endDate,
    }
}

// Ciclo fechado termina no último dia dele. Ciclo em aberto, ou sem ciclo,
// vai até hoje e se estende ao último treino concluído depois disso.
export function resolveDaysRangeEnd(
    window: DaysWindow,
    finishedDates: readonly IsoDate[],
    today: IsoDate,
): IsoDate {
    if (window.cycleEnd !== null) {
        return window.cycleEnd
    }

    const rangeEnd = finishedDates.reduce((latest, date) => (date > latest ? date : latest), today)

    return rangeEnd
}

export function formatDayMonth(isoDate: IsoDate): string {
    const [, month, day] = isoDate.split('-')
    const formattedLabel = `${day}/${month}`

    return formattedLabel
}

export function formatDaysGridTitle(window: DaysWindow): string {
    const baseTitle = 'Dias de treino concluídos'
    if (window.cycleNumber === null || window.cycleStart === null) {
        return baseTitle
    }

    const sinceLabel = `desde ${formatDayMonth(window.cycleStart)}`
    const untilLabel = window.cycleEnd !== null ? ` até ${formatDayMonth(window.cycleEnd)}` : ''
    const title = `${baseTitle} · Ciclo ${window.cycleNumber} · ${sinceLabel}${untilLabel}`

    return title
}

export function formatExpandGridLabel(window: DaysWindow, totalWeeks: number): string {
    const scopeLabel = window.cycleNumber === null ? 'Ver todas as semanas' : 'Ver ciclo inteiro'
    const label = `${scopeLabel} (${totalWeeks} semanas)`

    return label
}
