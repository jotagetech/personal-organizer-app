import { diffInDays, shiftIsoDate, weekdayOfIsoDate, type IsoDate } from '@/lib/dateUtils'
import type { Weekday } from '@/lib/workoutPlanSchema'

const WEEK_ORDER: Weekday[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo']

export type DayCell = {
    date: IsoDate
    weekday: Weekday
    completed: boolean
    inRange: boolean
    selected: boolean
}

export type WeekRow = {
    weekStart: IsoDate
    days: DayCell[]
}

export type DateRange = {
    rangeStart: IsoDate
    rangeEnd: IsoDate
}

export function mondayOnOrBefore(date: IsoDate): IsoDate {
    const weekday = weekdayOfIsoDate(date)
    const offsetFromMonday = WEEK_ORDER.indexOf(weekday)
    const monday = shiftIsoDate(date, -offsetFromMonday)

    return monday
}

// A grade sempre precisa mostrar a data selecionada, mesmo quando ela cai
// fora da janela padrão (ciclo atual ou últimos N dias), pra tocar num dia
// fora da tela ainda ser possível a partir de outro ponto do app.
export function expandRangeToIncludeDate(range: DateRange, referenceDate: IsoDate): DateRange {
    const expandedStart = referenceDate < range.rangeStart ? referenceDate : range.rangeStart
    const expandedEnd = referenceDate > range.rangeEnd ? referenceDate : range.rangeEnd

    return { rangeStart: expandedStart, rangeEnd: expandedEnd }
}

// rangeStart/rangeEnd definem "dentro do intervalo" (ciclo atual ou janela
// padrão, critério que não muda aqui); a grade desenhada pode precisar ir
// além disso só pra caber a data selecionada em algum lugar, sem que esses
// dias extras passem a contar como dentro do intervalo.
export function buildWeeklyCompletionGrid(
    rangeStart: IsoDate,
    rangeEnd: IsoDate,
    completedDates: ReadonlySet<IsoDate>,
    selectedDate?: IsoDate,
): WeekRow[] {
    const gridBounds =
        selectedDate === undefined
            ? { rangeStart, rangeEnd }
            : expandRangeToIncludeDate({ rangeStart, rangeEnd }, selectedDate)

    const firstWeekStart = mondayOnOrBefore(gridBounds.rangeStart)
    const totalDays = diffInDays(firstWeekStart, gridBounds.rangeEnd) + 1
    const totalWeeks = Math.ceil(totalDays / 7)

    const weeks: WeekRow[] = []
    for (let weekIndex = 0; weekIndex < totalWeeks; weekIndex += 1) {
        const weekStart = shiftIsoDate(firstWeekStart, weekIndex * 7)
        const days: DayCell[] = WEEK_ORDER.map((weekday, dayIndex) => {
            const date = shiftIsoDate(weekStart, dayIndex)
            const inRange = date >= rangeStart && date <= rangeEnd
            const completed = completedDates.has(date)
            const selected = date === selectedDate

            return { date, weekday, completed, inRange, selected }
        })

        weeks.push({ weekStart, days })
    }

    return weeks
}
