import type { PlanActivation } from '@/features/evolution/data/cycleHistory'
import { isoDateInTimezone, type IsoDate } from '@/lib/dateUtils'

export type PlanPeriod = {
    planId: string
    // Primeiro dia em que o plano vale dentro do ciclo.
    startDate: IsoDate
}

type DatedActivation = {
    planId: string
    localDate: IsoDate
}

// Mais antiga primeiro; no mesmo instante, a ordem recebida decide.
function datedActivations(activations: readonly PlanActivation[], timeZone: string): DatedActivation[] {
    const oldestFirst = [...activations].sort(
        (first, second) => Date.parse(first.activatedAt) - Date.parse(second.activatedAt),
    )
    const dated = oldestFirst.map((activation) => ({
        planId: activation.planId,
        localDate: isoDateInTimezone(activation.activatedAt, timeZone),
    }))

    return dated
}

function planOnDatedTimeline(dated: readonly DatedActivation[], date: IsoDate): string | null {
    const lastOnOrBefore = dated.filter((activation) => activation.localDate <= date).at(-1)
    const planId = lastOnOrBefore?.planId ?? null

    return planId
}

// Vale a última ativação cuja data no fuso do usuário não passa da data
// pedida; várias trocas no mesmo dia deixam o dia inteiro com a última.
// Converter as datas uma vez só serve quem consulta dia após dia.
export function planResolverFor(
    activations: readonly PlanActivation[],
    timeZone: string,
): (date: IsoDate) => string | null {
    const dated = datedActivations(activations, timeZone)
    const resolvePlan = (date: IsoDate) => planOnDatedTimeline(dated, date)

    return resolvePlan
}

export function planOnDate(activations: readonly PlanActivation[], date: IsoDate, timeZone: string): string | null {
    const planId = planResolverFor(activations, timeZone)(date)

    return planId
}

// Planos do ciclo na ordem em que passaram a valer. O primeiro período começa
// no início do ciclo só quando alguma ativação já cobria aquele dia; reativar
// o plano que já valia não abre período novo.
export function planChangesInCycle(
    activations: readonly PlanActivation[],
    cycle: { startDate: IsoDate; endDate: IsoDate | null },
    timeZone: string,
): PlanPeriod[] {
    const dated = datedActivations(activations, timeZone)
    const planAtStart = planOnDatedTimeline(dated, cycle.startDate)
    const periods: PlanPeriod[] = planAtStart ? [{ planId: planAtStart, startDate: cycle.startDate }] : []

    const changeDates = [
        ...new Set(
            dated
                .map((activation) => activation.localDate)
                .filter((date) => date > cycle.startDate && (cycle.endDate === null || date <= cycle.endDate)),
        ),
    ]
    changeDates.forEach((date) => {
        const planId = planOnDatedTimeline(dated, date)
        if (planId !== null && planId !== periods.at(-1)?.planId) {
            periods.push({ planId, startDate: date })
        }
    })

    return periods
}
