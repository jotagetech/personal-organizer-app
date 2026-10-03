import type { RoutineItemRow } from '@/features/routine/types'
import { WEEKDAY_LABELS } from '@/lib/weekdayLabels'
import { WEEKDAYS, type Weekday } from '@/lib/workoutPlanSchema'

type ScheduleFields = Pick<RoutineItemRow, 'repeat_kind' | 'weekdays' | 'interval_days'>

// Agenda do item em texto curto: "Seg, Qua, Sex" ou "A cada 3 dias".
export function formatRoutineSchedule(item: ScheduleFields): string {
    if (item.repeat_kind === 'interval') {
        return formatInterval(item.interval_days ?? 0)
    }

    return formatWeekdays((item.weekdays ?? []) as Weekday[])
}

function formatInterval(intervalDays: number): string {
    const unit = intervalDays === 1 ? 'dia' : 'dias'
    return `A cada ${intervalDays} ${unit}`
}

function formatWeekdays(weekdays: Weekday[]): string {
    const orderedLabels = WEEKDAYS.filter((weekday) => weekdays.includes(weekday)).map(
        (weekday) => WEEKDAY_LABELS[weekday],
    )
    return orderedLabels.join(', ')
}
