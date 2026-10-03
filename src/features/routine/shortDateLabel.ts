import { weekdayOfIsoDate, type IsoDate } from '@/lib/dateUtils'
import { WEEKDAY_LABELS } from '@/lib/weekdayLabels'

// "qui 8/10": dia da semana abreviado e dia/mês, sem ano.
export function shortDateLabel(isoDate: IsoDate): string {
    const [, month, day] = isoDate.split('-').map(Number)
    const weekdayLabel = WEEKDAY_LABELS[weekdayOfIsoDate(isoDate)].toLowerCase()

    return `${weekdayLabel} ${day}/${month}`
}
