import { cycleStatusOn } from '@/features/cycle/cycleProgress'
import { cycleForDate, nextCycleAfter } from '@/features/cycle/cycleTimeline'
import type { WorkoutCycleRow } from '@/features/cycle/types'
import { formatPlanWeekLabel, type PlanWeek } from '@/features/workout/planWeek'
import { diffInDays, type IsoDate } from '@/lib/dateUtils'

function formatDays(days: number): string {
    const label = `${days} dia${days === 1 ? '' : 's'}`

    return label
}

// O aviso de ciclo futuro só faz sentido olhando pra frente: numa data
// passada o ciclo seguinte já começou (ou não interessa mais).
export function buildCycleBadgeText(
    cycles: readonly WorkoutCycleRow[],
    date: IsoDate,
    today: IsoDate,
): string | null {
    const isTodayOrFuture = date >= today
    const nextCycle = nextCycleAfter(cycles, date)
    const daysUntilNext = nextCycle ? diffInDays(date, nextCycle.start_date) : null
    const current = cycleForDate(cycles, date)

    const showsNext = isTodayOrFuture && daysUntilNext !== null
    if (!current) {
        const upcomingText = showsNext ? `Ciclo começa em ${formatDays(daysUntilNext)}` : null

        return upcomingText
    }

    const status = cycleStatusOn(current.cycle.start_date, date)
    const dayNumber = status.kind === 'in_progress' ? status.dayNumber : 1
    const currentText = `Ciclo ${current.number} · Dia ${dayNumber}`
    const text = showsNext ? `${currentText} · próximo em ${formatDays(daysUntilNext)}` : currentText

    return text
}

export function buildPlanWeekText(planWeek: PlanWeek): string {
    const parts = [
        formatPlanWeekLabel(planWeek.semana, planWeek.totalSemanas),
        planWeek.volta >= 2 ? `volta ${planWeek.volta}` : null,
        planWeek.descricao,
    ].filter((part): part is string => part !== null)
    const text = parts.join(' · ')

    return text
}
