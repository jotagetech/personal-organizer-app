import { diffInDays, isValidIsoDate, shiftIsoDate, weekdayOfIsoDate, type IsoDate } from '@/lib/dateUtils'

export type ExportPeriod = { start: IsoDate; end: IsoDate }

export const PERIOD_SHORTCUTS = ['this_week', 'last_week', 'this_month', 'last_month'] as const
export type PeriodShortcut = (typeof PERIOD_SHORTCUTS)[number]

export const PERIOD_SHORTCUT_LABELS: Record<PeriodShortcut, string> = {
    this_week: 'Esta semana',
    last_week: 'Semana passada',
    this_month: 'Este mês',
    last_month: 'Mês passado',
}

export const MAX_PERIOD_DAYS = 366

const WEEKDAYS_FROM_MONDAY = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'] as const

function mondayOfWeek(date: IsoDate): IsoDate {
    const daysSinceMonday = WEEKDAYS_FROM_MONDAY.indexOf(weekdayOfIsoDate(date))

    return shiftIsoDate(date, -daysSinceMonday)
}

function firstDayOfMonth(date: IsoDate): IsoDate {
    return `${date.slice(0, 8)}01`
}

// Os atalhos "esta semana" e "este mês" terminam hoje, não no fim do
// calendário: dias futuros não têm registro e só inflariam o período.
export function resolvePeriodShortcut(shortcut: PeriodShortcut, today: IsoDate): ExportPeriod {
    switch (shortcut) {
        case 'this_week':
            return { start: mondayOfWeek(today), end: today }
        case 'last_week': {
            const lastMonday = shiftIsoDate(mondayOfWeek(today), -7)
            return { start: lastMonday, end: shiftIsoDate(lastMonday, 6) }
        }
        case 'this_month':
            return { start: firstDayOfMonth(today), end: today }
        case 'last_month': {
            const lastDayOfPreviousMonth = shiftIsoDate(firstDayOfMonth(today), -1)
            return { start: firstDayOfMonth(lastDayOfPreviousMonth), end: lastDayOfPreviousMonth }
        }
    }
}

// Devolve a mensagem de erro pronta pra tela, ou null quando o período vale.
export function validatePeriod(period: ExportPeriod): string | null {
    if (!isValidIsoDate(period.start) || !isValidIsoDate(period.end)) {
        return 'Informe as datas de início e fim.'
    }
    if (period.start > period.end) {
        return 'A data de início precisa ser igual ou anterior à data de fim.'
    }

    const dayCount = diffInDays(period.start, period.end) + 1
    if (dayCount > MAX_PERIOD_DAYS) {
        return `Período longo demais (${dayCount} dias). O máximo é ${MAX_PERIOD_DAYS} dias.`
    }

    return null
}

export function listDatesInPeriod(period: ExportPeriod): IsoDate[] {
    const dayCount = diffInDays(period.start, period.end) + 1
    const dates: IsoDate[] = []
    for (let offset = 0; offset < dayCount; offset += 1) {
        dates.push(shiftIsoDate(period.start, offset))
    }

    return dates
}
