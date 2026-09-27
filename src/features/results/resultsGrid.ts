import { diffInDays, shiftIsoDate, weekdayOfIsoDate, type IsoDate } from '@/lib/dateUtils'
import type { Weekday } from '@/lib/workoutPlanSchema'

const WEEK_ORDER: Weekday[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo']

export type DayCell = {
    date: IsoDate
    weekday: Weekday
    completed: boolean
    inRange: boolean
}

export type WeekRow = {
    weekStart: IsoDate
    days: DayCell[]
}

export function mondayOnOrBefore(date: IsoDate): IsoDate {
    const weekday = weekdayOfIsoDate(date)
    const offsetFromMonday = WEEK_ORDER.indexOf(weekday)
    const monday = shiftIsoDate(date, -offsetFromMonday)

    return monday
}

export function buildWeeklyCompletionGrid(
    rangeStart: IsoDate,
    rangeEnd: IsoDate,
    completedDates: ReadonlySet<IsoDate>,
): WeekRow[] {
    const firstWeekStart = mondayOnOrBefore(rangeStart)
    const totalDays = diffInDays(firstWeekStart, rangeEnd) + 1
    const totalWeeks = Math.ceil(totalDays / 7)

    const weeks: WeekRow[] = []
    for (let weekIndex = 0; weekIndex < totalWeeks; weekIndex += 1) {
        const weekStart = shiftIsoDate(firstWeekStart, weekIndex * 7)
        const days: DayCell[] = WEEK_ORDER.map((weekday, dayIndex) => {
            const date = shiftIsoDate(weekStart, dayIndex)
            const inRange = date >= rangeStart && date <= rangeEnd
            const completed = completedDates.has(date)

            return { date, weekday, completed, inRange }
        })

        weeks.push({ weekStart, days })
    }

    return weeks
}
