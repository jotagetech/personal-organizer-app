import { cycleForDate } from '@/features/cycle/cycleTimeline'
import type { CycleHistory, HistorySession } from '@/features/evolution/data/cycleHistory'
import { describeStoredPlans, storedPlanDisplayName } from '@/features/workout/storedPlans'
import { diffInDays, type IsoDate } from '@/lib/dateUtils'

const REMOVED_PLAN_NAME = 'Plano removido'

export type CycleBlockWeek = {
    semana: number
    totalSemanas: number
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
    plans: string[]
    lastBlockWeek: CycleBlockWeek | null
}

function resolveDurationDays(startDate: IsoDate, endDate: IsoDate | null, today: IsoDate): number {
    if (startDate > today) {
        return 0
    }

    const lastElapsedDay = endDate ?? today
    const lastDay = lastElapsedDay < today ? lastElapsedDay : today
    const durationDays = diffInDays(startDate, lastDay) + 1

    return durationDays
}

function resolvePlanNames(sessions: readonly HistorySession[], history: CycleHistory): string[] {
    const displayNameById = new Map(
        describeStoredPlans({ plans: history.plans, activePlanId: null }).map((entry) => [
            entry.id,
            storedPlanDisplayName(entry),
        ]),
    )
    const usedPlanIds = [...new Set(sessions.map((session) => session.planId))]
    const names = usedPlanIds.map((planId) => displayNameById.get(planId) ?? REMOVED_PLAN_NAME)
    const uniqueNames = [...new Set(names)]

    return uniqueNames
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

// Um item por ciclo, do mais recente ao mais antigo. Ciclos com o mesmo início
// contam uma vez só: vale o criado por último, como na linha do tempo.
export function summarizeCycles(history: CycleHistory, today: IsoDate): CycleSummary[] {
    const sessionsByCycle = sessionsByCycleId(history)
    const startDates = [...new Set(history.cycles.map((cycle) => cycle.start_date))]

    const summaries = startDates.map((startDate) => {
        const timeline = cycleForDate(history.cycles, startDate)
        if (!timeline) {
            throw new Error(`Ciclo sem linha do tempo em ${startDate}`)
        }

        const cycleSessions = sessionsByCycle.get(timeline.cycle.id) ?? []
        const summary: CycleSummary = {
            cycleId: timeline.cycle.id,
            number: timeline.number,
            startDate,
            endDate: timeline.endDate,
            isOpen: timeline.endDate === null,
            durationDays: resolveDurationDays(startDate, timeline.endDate, today),
            finishedWorkouts: cycleSessions.filter((session) => session.finishedAt !== null).length,
            startedNotFinished: cycleSessions.filter(
                (session) => session.finishedAt === null && session.sessionDate < today,
            ).length,
            plans: resolvePlanNames(cycleSessions, history),
            lastBlockWeek: resolveLastBlockWeek(cycleSessions),
        }
        return summary
    })

    const newestFirst = summaries.reverse()
    return newestFirst
}
