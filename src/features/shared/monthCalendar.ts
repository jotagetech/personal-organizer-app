import { isValidIsoDate, type IsoDate } from '@/lib/dateUtils'

export type MonthGridCell = IsoDate | null

const MONTH_NAMES = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
]

const TYPED_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/
const YEARS_TO_SEARCH_WITHOUT_YEAR = 5
const TWO_DIGIT_YEAR_BASE = 2000

function pad(value: number, width: number): string {
    const padded = String(value).padStart(width, '0')

    return padded
}

function toIsoDate(year: number, month: number, day: number): IsoDate {
    const isoDate = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`

    return isoDate
}

export function daysInMonth(year: number, month: number): number {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()

    return lastDay
}

// month é de 1 a 12. Células nulas ocupam os dias da semana anteriores ao dia 1,
// com a semana começando no domingo.
export function buildMonthGrid(year: number, month: number): MonthGridCell[] {
    const leadingBlanks = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
    const cells: MonthGridCell[] = Array.from({ length: leadingBlanks }, () => null)

    for (let day = 1; day <= daysInMonth(year, month); day += 1) {
        cells.push(toIsoDate(year, month, day))
    }

    return cells
}

export function formatMonthTitle(year: number, month: number): string {
    const title = `${MONTH_NAMES[month - 1]} ${year}`

    return title
}

function resolveYearlessDate(day: number, month: number, today: IsoDate): IsoDate | null {
    const currentYear = Number(today.slice(0, 4))

    // Procura alguns anos à frente porque 29/02 só existe em ano bissexto.
    for (let offset = 0; offset < YEARS_TO_SEARCH_WITHOUT_YEAR; offset += 1) {
        const candidate = toIsoDate(currentYear + offset, month, day)
        if (isValidIsoDate(candidate) && candidate >= today) {
            return candidate
        }
    }

    return null
}

export function parseTypedDate(text: string, today: IsoDate): IsoDate | null {
    const match = TYPED_DATE_PATTERN.exec(text.trim())
    if (!match) {
        return null
    }

    const day = Number(match[1])
    const month = Number(match[2])
    const typedYear = match[3]
    if (typedYear === undefined) {
        return resolveYearlessDate(day, month, today)
    }

    const year = typedYear.length === 2 ? TWO_DIGIT_YEAR_BASE + Number(typedYear) : Number(typedYear)
    const candidate = toIsoDate(year, month, day)
    const parsedDate = isValidIsoDate(candidate) ? candidate : null

    return parsedDate
}
