import { diffInDays, type IsoDate } from '@/lib/dateUtils'

export type CycleStatus =
    | { kind: 'not_started'; daysUntilStart: number }
    | { kind: 'in_progress'; dayNumber: number }

export function cycleStatusOn(startDate: IsoDate, today: IsoDate): CycleStatus {
    const elapsedDays = diffInDays(startDate, today)

    if (elapsedDays < 0) {
        return { kind: 'not_started', daysUntilStart: -elapsedDays }
    }

    return { kind: 'in_progress', dayNumber: elapsedDays + 1 }
}
