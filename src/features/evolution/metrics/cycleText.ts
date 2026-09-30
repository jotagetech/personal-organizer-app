import type { CycleSummary } from '@/features/evolution/metrics/cycleSummary'
import { formatDayMonth } from '@/features/evolution/sections/daysWindow'
import { formatPlanWeekLabel } from '@/features/workout/planWeek'
import type { IsoDate } from '@/lib/dateUtils'

export function formatCycleTitle(summary: CycleSummary): string {
    const title = `Ciclo ${summary.number}`

    return title
}

export function formatCycleRange(summary: CycleSummary): string {
    const start = formatDayMonth(summary.startDate)
    const range = summary.endDate === null ? `desde ${start} · em andamento` : `${start} até ${formatDayMonth(summary.endDate)}`

    return range
}

export function formatCycleCounts(summary: CycleSummary): string {
    const dayWord = summary.durationDays === 1 ? 'dia' : 'dias'
    const workoutWord = summary.finishedWorkouts === 1 ? 'treino' : 'treinos'
    const parts = [`${summary.durationDays} ${dayWord}`, `${summary.finishedWorkouts} ${workoutWord}`]
    if (summary.startedNotFinished > 0) {
        parts.push(`${summary.startedNotFinished} sem finalizar`)
    }

    const counts = parts.join(' · ')
    return counts
}

export function formatCycleBlockWeek(summary: CycleSummary): string | null {
    if (summary.lastBlockWeek === null) {
        return null
    }

    const { semana, totalSemanas } = summary.lastBlockWeek
    const label = `${formatPlanWeekLabel(semana, totalSemanas)} do bloco`

    return label
}

// Tocar no ciclo leva ao último dia dele; no ciclo em aberto, a hoje.
export function cycleFocusDate(summary: CycleSummary, today: IsoDate): IsoDate {
    const focusDate = summary.endDate ?? (summary.startDate > today ? summary.startDate : today)

    return focusDate
}

export function buildDeleteCycleQuestion(summary: CycleSummary): string {
    const destination = summary.number > 1 ? 'contar no ciclo anterior' : 'ficar sem ciclo'
    const question = `Excluir o Ciclo ${summary.number}? Os treinos continuam registrados; os dias dele passam a ${destination}.`

    return question
}
