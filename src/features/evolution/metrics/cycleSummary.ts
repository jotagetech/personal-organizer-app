import { cycleForDate } from '@/features/cycle/cycleTimeline'
import type { CycleHistory, HistorySession } from '@/features/evolution/data/cycleHistory'
import {
    cycleAdherence,
    weeklyRateChange,
    workoutsPerWeek,
    type WeeklyRateChange,
} from '@/features/evolution/metrics/cycleComparison'
import { planChangesInCycle } from '@/features/evolution/metrics/planTimeline'
import { describeStoredPlans, storedPlanDisplayName } from '@/features/workout/storedPlans'
import { diffInDays, shiftIsoDate, type IsoDate } from '@/lib/dateUtils'

const REMOVED_PLAN_NAME = 'Plano removido'

export type CycleBlockWeek = {
    semana: number
    totalSemanas: number
}

export type CyclePlanPeriod = {
    name: string
    startDate: IsoDate
}

export type CycleSummary = {
    cycleId: string
    number: number
    startDate: IsoDate
    // Último dia do ciclo; nulo no ciclo em aberto.
    endDate: IsoDate | null
    isOpen: boolean
    durationDays: number
    finishedWorkouts: number
    startedNotFinished: number
    // Planos das sessões do ciclo; é o que aparece quando não há ativação
    // cobrindo o início dele.
    plans: string[]
    // Planos pela linha do tempo de ativação, do primeiro ao último.
    planTimeline: CyclePlanPeriod[] | null
    lastBlockWeek: CycleBlockWeek | null
    // Nulos enquanto o ciclo não começou.
    workoutsPerWeek: number | null
    adherence: number | null
    weeklyRateChange: WeeklyRateChange | null
}

type CycleSummaryDraft = Omit<CycleSummary, 'weeklyRateChange'>

function resolveDurationDays(startDate: IsoDate, endDate: IsoDate | null, today: IsoDate): number {
    if (startDate > today) {
        return 0
    }

    const lastElapsedDay = endDate ?? today
    const lastDay = lastElapsedDay < today ? lastElapsedDay : today
    const durationDays = diffInDays(startDate, lastDay) + 1

    return durationDays
}

function planDisplayNames(history: CycleHistory): Map<string, string> {
    const displayNameById = new Map(
        describeStoredPlans({ plans: history.plans, activePlanId: null }).map((entry) => [
            entry.id,
            storedPlanDisplayName(entry),
        ]),
    )

    return displayNameById
}

function resolvePlanNames(sessions: readonly HistorySession[], displayNameById: Map<string, string>): string[] {
    const usedPlanIds = [...new Set(sessions.map((session) => session.planId))]
    const names = usedPlanIds.map((planId) => displayNameById.get(planId) ?? REMOVED_PLAN_NAME)
    const uniqueNames = [...new Set(names)]

    return uniqueNames
}

function resolvePlanTimeline(
    history: CycleHistory,
    cycle: { startDate: IsoDate; endDate: IsoDate | null },
    displayNameById: Map<string, string>,
): CyclePlanPeriod[] | null {
    const periods = planChangesInCycle(history.activations, cycle, history.timeZone)
    if (periods.length === 0 || periods[0].startDate !== cycle.startDate) {
        return null
    }

    const timeline = periods.map((period) => ({
        name: displayNameById.get(period.planId) ?? REMOVED_PLAN_NAME,
        startDate: period.startDate,
    }))
    return timeline
}

// A janela vai até ontem: o dia de hoje ainda pode ter treino, e só entra na
// conta quando a sessão dele já foi concluída.
function resolveAdherence(
    history: CycleHistory,
    cycle: { startDate: IsoDate; durationDays: number },
    sessions: readonly HistorySession[],
    today: IsoDate,
): number | null {
    if (cycle.durationDays === 0) {
        return null
    }

    const finishedSessionDates = sessions
        .filter((session) => session.finishedAt !== null)
        .map((session) => session.sessionDate)
    const lastElapsedDay = shiftIsoDate(cycle.startDate, cycle.durationDays - 1)
    const countsLastDay = lastElapsedDay < today || finishedSessionDates.includes(lastElapsedDay)
    const lastDay = countsLastDay ? lastElapsedDay : shiftIsoDate(lastElapsedDay, -1)
    if (lastDay < cycle.startDate) {
        return null
    }

    const adherence = cycleAdherence({
        firstDay: cycle.startDate,
        lastDay,
        finishedSessionDates,
        activations: history.activations,
        planSchedules: history.planSchedules,
        timeZone: history.timeZone,
    })
    return adherence
}

function resolveLastBlockWeek(sessions: readonly HistorySession[]): CycleBlockWeek | null {
    const lastWithBlock = [...sessions]
        .reverse()
        .find((session) => session.blockWeek !== null && session.blockWeeks !== null)
    if (!lastWithBlock || lastWithBlock.blockWeek === null || lastWithBlock.blockWeeks === null) {
        return null
    }

    const lastBlockWeek = { semana: lastWithBlock.blockWeek, totalSemanas: lastWithBlock.blockWeeks }
    return lastBlockWeek
}

function sessionsByCycleId(history: CycleHistory): Map<string, HistorySession[]> {
    const grouped = new Map<string, HistorySession[]>()
    const sessionsOldestFirst = [...history.sessions].sort((first, second) =>
        first.sessionDate.localeCompare(second.sessionDate),
    )

    sessionsOldestFirst.forEach((session) => {
        const owner = cycleForDate(history.cycles, session.sessionDate)
        if (!owner) {
            return
        }

        grouped.set(owner.cycle.id, [...(grouped.get(owner.cycle.id) ?? []), session])
    })

    return grouped
}

// Cada ciclo se compara com o imediatamente anterior na linha do tempo.
function withRateChanges(draftsOldestFirst: readonly CycleSummaryDraft[]): CycleSummary[] {
    const summaries = draftsOldestFirst.map((draft, index) => {
        const previous = index > 0 ? draftsOldestFirst[index - 1] : null
        const change = weeklyRateChange(
            draft.workoutsPerWeek,
            previous ? { number: previous.number, rate: previous.workoutsPerWeek } : null,
        )
        const summary: CycleSummary = { ...draft, weeklyRateChange: change }
        return summary
    })

    return summaries
}

// Um item por ciclo, do mais recente ao mais antigo. Ciclos com o mesmo início
// contam uma vez só: vale o criado por último, como na linha do tempo.
export function summarizeCycles(history: CycleHistory, today: IsoDate): CycleSummary[] {
    const sessionsByCycle = sessionsByCycleId(history)
    const displayNameById = planDisplayNames(history)
    const startDates = [...new Set(history.cycles.map((cycle) => cycle.start_date))]

    const drafts = startDates.map((startDate) => {
        const timeline = cycleForDate(history.cycles, startDate)
        if (!timeline) {
            throw new Error(`Ciclo sem linha do tempo em ${startDate}`)
        }

        const cycleSessions = sessionsByCycle.get(timeline.cycle.id) ?? []
        const durationDays = resolveDurationDays(startDate, timeline.endDate, today)
        const finishedWorkouts = cycleSessions.filter((session) => session.finishedAt !== null).length
        const draft: CycleSummaryDraft = {
            cycleId: timeline.cycle.id,
            number: timeline.number,
            startDate,
            endDate: timeline.endDate,
            isOpen: timeline.endDate === null,
            durationDays,
            finishedWorkouts,
            startedNotFinished: cycleSessions.filter(
                (session) => session.finishedAt === null && session.sessionDate < today,
            ).length,
            plans: resolvePlanNames(cycleSessions, displayNameById),
            planTimeline: resolvePlanTimeline(history, { startDate, endDate: timeline.endDate }, displayNameById),
            lastBlockWeek: resolveLastBlockWeek(cycleSessions),
            workoutsPerWeek: workoutsPerWeek(finishedWorkouts, durationDays),
            adherence: resolveAdherence(history, { startDate, durationDays }, cycleSessions, today),
        }
        return draft
    })

    const newestFirst = withRateChanges(drafts).reverse()
    return newestFirst
}
