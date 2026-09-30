export const DEFAULT_TIMEZONE = 'America/Sao_Paulo'

const WEEKDAY_BY_INDEX = [
    'domingo',
    'segunda',
    'terca',
    'quarta',
    'quinta',
    'sexta',
    'sabado',
] as const

export type IsoDate = string

const dateFormatterByTimezone = new Map<string, Intl.DateTimeFormat>()

// Montar o formatador custa bem mais que usá-lo, e a conversão roda uma vez
// por dia de cada ciclo; um por fuso basta.
function dateFormatterFor(timezone: string): Intl.DateTimeFormat {
    const cached = dateFormatterByTimezone.get(timezone)
    if (cached) {
        return cached
    }

    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    })
    dateFormatterByTimezone.set(timezone, formatter)
    return formatter
}

export function isoDateInTimezone(instant: Date | string, timezone: string = DEFAULT_TIMEZONE): IsoDate {
    const isoDate = dateFormatterFor(timezone).format(new Date(instant))

    return isoDate
}

export function todayInTimezone(timezone: string = DEFAULT_TIMEZONE): IsoDate {
    const isoDate = isoDateInTimezone(new Date(), timezone)

    return isoDate
}

export function weekdayOfIsoDate(isoDate: IsoDate): (typeof WEEKDAY_BY_INDEX)[number] {
    const [year, month, day] = isoDate.split('-').map(Number)
    const dateAtNoonUtc = new Date(Date.UTC(year, month - 1, day, 12))
    const weekday = WEEKDAY_BY_INDEX[dateAtNoonUtc.getUTCDay()]

    return weekday
}

export function shiftIsoDate(isoDate: IsoDate, days: number): IsoDate {
    const [year, month, day] = isoDate.split('-').map(Number)
    const shiftedDate = new Date(Date.UTC(year, month - 1, day + days, 12))
    const shiftedIsoDate = shiftedDate.toISOString().slice(0, 10)

    return shiftedIsoDate
}

export function diffInDays(fromIsoDate: IsoDate, toIsoDate: IsoDate): number {
    const MILLISECONDS_PER_DAY = 86_400_000
    const [fromYear, fromMonth, fromDay] = fromIsoDate.split('-').map(Number)
    const [toYear, toMonth, toDay] = toIsoDate.split('-').map(Number)
    const fromDateUtc = Date.UTC(fromYear, fromMonth - 1, fromDay)
    const toDateUtc = Date.UTC(toYear, toMonth - 1, toDay)
    const dayDifference = Math.round((toDateUtc - fromDateUtc) / MILLISECONDS_PER_DAY)

    return dayDifference
}

export function isValidIsoDate(candidate: string): candidate is IsoDate {
    const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
    if (!isoDatePattern.test(candidate)) {
        return false
    }

    const [year, month, day] = candidate.split('-').map(Number)
    const parsedDate = new Date(Date.UTC(year, month - 1, day))
    const roundTripsCleanly =
        parsedDate.getUTCFullYear() === year &&
        parsedDate.getUTCMonth() === month - 1 &&
        parsedDate.getUTCDate() === day

    return roundTripsCleanly
}
