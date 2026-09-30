import { roundToOneDecimal } from '@/features/evolution/metrics/cycleComparison'
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

// Pela linha do tempo de ativação quando ela cobre o início do ciclo; sem
// isso, os planos usados nas sessões.
export function formatCyclePlans(summary: CycleSummary): string | null {
    if (summary.planTimeline !== null) {
        const [firstPeriod, ...laterPeriods] = summary.planTimeline
        const changes = laterPeriods.map((period) => `depois ${period.name} desde ${formatDayMonth(period.startDate)}`)
        const timelineText = [firstPeriod.name, ...changes].join(' · ')
        return timelineText
    }

    const sessionPlans = summary.plans.length > 0 ? summary.plans.join(', ') : null
    return sessionPlans
}

function formatDecimal(value: number): string {
    const formatted = value.toFixed(1).replace('.', ',')

    return formatted
}

function formatWeeklyRate(rate: number): string {
    const rounded = roundToOneDecimal(rate)
    const workoutWord = rounded >= 1 && rounded < 2 ? 'treino' : 'treinos'
    const text = `${formatDecimal(rounded)} ${workoutWord} por semana`

    return text
}

export function formatCycleRhythm(summary: CycleSummary): string | null {
    if (summary.workoutsPerWeek === null) {
        return null
    }

    const parts = [formatWeeklyRate(summary.workoutsPerWeek)]
    if (summary.adherence !== null) {
        parts.push(`aderência ${Math.round(summary.adherence * 100)}%`)
    }

    const rhythm = parts.join(' · ')
    return rhythm
}

export function formatCycleRateChange(summary: CycleSummary): string | null {
    const change = summary.weeklyRateChange
    if (change === null) {
        return null
    }

    const previousTitle = `Ciclo ${change.previousNumber}`
    if (change.difference === 0) {
        return `mesmo ritmo do ${previousTitle}`
    }

    const sign = change.difference > 0 ? '+' : '-'
    const text = `${sign}${formatDecimal(Math.abs(change.difference))} por semana que o ${previousTitle}`
    return text
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
