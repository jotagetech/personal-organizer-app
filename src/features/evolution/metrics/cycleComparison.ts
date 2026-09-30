import type { PlanActivation } from '@/features/evolution/data/cycleHistory'
import { planResolverFor } from '@/features/evolution/metrics/planTimeline'
import { shiftIsoDate, weekdayOfIsoDate, type IsoDate } from '@/lib/dateUtils'
import type { WorkoutPlan } from '@/lib/workoutPlanSchema'

const DAYS_PER_WEEK = 7

// Só os dias da semana de cada treino: é tudo o que a aderência usa, e o
// payload inteiro do plano não precisa ficar em memória.
export type PlanSchedule = {
    planId: string
    workoutWeekdays: string[][]
}

export type CycleAdherenceInput = {
    firstDay: IsoDate
    lastDay: IsoDate
    finishedSessionDates: readonly IsoDate[]
    activations: readonly PlanActivation[]
    planSchedules: readonly PlanSchedule[]
    timeZone: string
}

export type WeeklyRateChange = {
    previousNumber: number
    difference: number
}

export function planScheduleOf(planId: string, plan: WorkoutPlan): PlanSchedule {
    const schedule = { planId, workoutWeekdays: plan.treinos.map((workout) => workout.dias_semana ?? []) }

    return schedule
}

export function roundToOneDecimal(value: number): number {
    const rounded = Math.round(value * 10) / 10

    return rounded
}

export function workoutsPerWeek(finishedWorkouts: number, elapsedDays: number): number | null {
    if (elapsedDays <= 0) {
        return null
    }

    const rate = (finishedWorkouts / elapsedDays) * DAYS_PER_WEEK
    return rate
}

function isPlannedOn(schedule: PlanSchedule, date: IsoDate): boolean {
    const weekday = weekdayOfIsoDate(date)
    const isPlanned = schedule.workoutWeekdays.some((weekdays) => weekdays.includes(weekday))

    return isPlanned
}

function elapsedDates(firstDay: IsoDate, lastDay: IsoDate): IsoDate[] {
    const dates: IsoDate[] = []
    for (let date = firstDay; date <= lastDay; date = shiftIsoDate(date, 1)) {
        dates.push(date)
    }

    return dates
}

// Mede em dias, porque cada dia tem no máximo uma sessão: dias com algum
// treino previsto no plano vigente, e quantos deles têm sessão concluída.
// Treino feito em dia sem previsão fica de fora, então a razão nunca passa de
// 1. Nulo quando nenhum dia da janela tinha treino previsto.
export function cycleAdherence(input: CycleAdherenceInput): number | null {
    const resolvePlan = planResolverFor(input.activations, input.timeZone)
    const scheduleById = new Map(input.planSchedules.map((schedule) => [schedule.planId, schedule]))
    const plannedDates = elapsedDates(input.firstDay, input.lastDay).filter((date) => {
        const planId = resolvePlan(date)
        const schedule = planId === null ? undefined : scheduleById.get(planId)
        return schedule !== undefined && isPlannedOn(schedule, date)
    })

    if (plannedDates.length === 0) {
        return null
    }

    const finishedDates = new Set(input.finishedSessionDates)
    const finishedPlannedDays = plannedDates.filter((date) => finishedDates.has(date)).length
    const adherence = finishedPlannedDays / plannedDates.length
    return adherence
}

// A diferença sai dos valores já arredondados, para bater com os números que
// aparecem na tela.
export function weeklyRateChange(
    currentRate: number | null,
    previous: { number: number; rate: number | null } | null,
): WeeklyRateChange | null {
    if (currentRate === null || previous === null || previous.rate === null) {
        return null
    }

    const difference = roundToOneDecimal(roundToOneDecimal(currentRate) - roundToOneDecimal(previous.rate))
    const change = { previousNumber: previous.number, difference }
    return change
}
