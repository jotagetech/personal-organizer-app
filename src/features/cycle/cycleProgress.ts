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

const DAYS_PER_WEEK = 7

// Semana corrida do ciclo: dias 1 a 7 são a semana 1, dias 8 a 14 a semana
// 2 e assim por diante. Antes do início não há semana.
export function cycleWeekOn(startDate: IsoDate, date: IsoDate): number | null {
    const status = cycleStatusOn(startDate, date)
    if (status.kind !== 'in_progress') {
        return null
    }

    return Math.floor((status.dayNumber - 1) / DAYS_PER_WEEK) + 1
}
