import { describe, expect, it } from 'vitest'

import {
    cycleAdherence,
    planScheduleOf,
    weeklyRateChange,
    workoutsPerWeek,
    type CycleAdherenceInput,
} from '@/features/evolution/metrics/cycleComparison'
import type { WorkoutPlan } from '@/lib/workoutPlanSchema'

// 2026-07-06 é uma segunda-feira.
const MONDAY = '2026-07-06'
const SUNDAY = '2026-07-12'
const TIME_ZONE = 'America/Sao_Paulo'
const SINCE_MAY = '2026-05-01T12:00:00Z'

const SCHEDULED_PLAN = { planId: 'plan-a', workoutWeekdays: [['segunda'], ['quarta'], ['sexta']] }
const UNSCHEDULED_PLAN = { planId: 'plan-b', workoutWeekdays: [[], []] }

function adherenceInput(overrides: Partial<CycleAdherenceInput> = {}): CycleAdherenceInput {
    return {
        firstDay: MONDAY,
        lastDay: SUNDAY,
        finishedSessionDates: [],
        activations: [{ planId: 'plan-a', activatedAt: SINCE_MAY }],
        planSchedules: [SCHEDULED_PLAN, UNSCHEDULED_PLAN],
        timeZone: TIME_ZONE,
        ...overrides,
    }
}

describe('workoutsPerWeek', () => {
    it('divide os treinos pelos dias decorridos e leva para a semana', () => {
        expect(workoutsPerWeek(6, 14)).toBe(3)
    })

    it('fica nulo em ciclo que ainda não começou', () => {
        expect(workoutsPerWeek(0, 0)).toBeNull()
    })
})

describe('planScheduleOf', () => {
    it('guarda só os dias da semana de cada treino, vazio quando o treino não tem', () => {
        const plan = {
            treinos: [
                { id: 'a', nome: 'A', dias_semana: ['segunda', 'quinta'], exercicios: [] },
                { id: 'b', nome: 'B', exercicios: [] },
            ],
        } as unknown as WorkoutPlan

        expect(planScheduleOf('plan-a', plan)).toEqual({
            planId: 'plan-a',
            workoutWeekdays: [['segunda', 'quinta'], []],
        })
    })
})

describe('cycleAdherence', () => {
    it('divide os treinos concluídos pelos treinos previstos nos dias decorridos', () => {
        const input = adherenceInput({ finishedSessionDates: ['2026-07-06', '2026-07-08'] })

        expect(cycleAdherence(input)).toBeCloseTo(2 / 3)
    })

    it('ignora treino feito em dia sem previsão', () => {
        const input = adherenceInput({ finishedSessionDates: ['2026-07-07', '2026-07-09', '2026-07-11'] })

        expect(cycleAdherence(input)).toBe(0)
    })

    it('não deixa treinos sem dias da semana, feitos em outros dias, passarem de 100%', () => {
        const input = adherenceInput({
            planSchedules: [{ planId: 'plan-a', workoutWeekdays: [['segunda'], []] }],
            finishedSessionDates: ['2026-07-06', '2026-07-07', '2026-07-09'],
        })

        expect(cycleAdherence(input)).toBe(1)
    })

    it('conta uma vez o dia com dois treinos previstos', () => {
        const input = adherenceInput({
            planSchedules: [{ planId: 'plan-a', workoutWeekdays: [['segunda'], ['segunda', 'quarta']] }],
            finishedSessionDates: ['2026-07-06'],
        })

        expect(cycleAdherence(input)).toBe(1 / 2)
    })

    it('fica nulo quando o plano vigente não tem dias da semana', () => {
        const input = adherenceInput({
            activations: [{ planId: 'plan-b', activatedAt: SINCE_MAY }],
            finishedSessionDates: ['2026-07-06'],
        })

        expect(cycleAdherence(input)).toBeNull()
    })

    it('ignora os dias sem plano vigente', () => {
        const input = adherenceInput({
            activations: [{ planId: 'plan-a', activatedAt: '2026-07-08T12:00:00Z' }],
            finishedSessionDates: ['2026-07-06', '2026-07-08', '2026-07-10'],
        })

        expect(cycleAdherence(input)).toBe(1)
    })

    it('fica nulo quando nenhum dia tem plano vigente', () => {
        expect(cycleAdherence(adherenceInput({ activations: [] }))).toBeNull()
    })

    it('segue o plano vigente em cada dia quando a troca cai no meio do ciclo', () => {
        const input = adherenceInput({
            activations: [
                { planId: 'plan-a', activatedAt: SINCE_MAY },
                { planId: 'plan-c', activatedAt: '2026-07-09T12:00:00Z' },
            ],
            planSchedules: [SCHEDULED_PLAN, { planId: 'plan-c', workoutWeekdays: [['sabado', 'domingo']] }],
            finishedSessionDates: ['2026-07-06', '2026-07-11'],
        })

        expect(cycleAdherence(input)).toBe(2 / 4)
    })

    it('conta só o período com agenda quando a troca vai para um plano sem dias da semana', () => {
        const input = adherenceInput({
            activations: [
                { planId: 'plan-a', activatedAt: SINCE_MAY },
                { planId: 'plan-b', activatedAt: '2026-07-09T12:00:00Z' },
            ],
            finishedSessionDates: ['2026-07-06', '2026-07-10', '2026-07-11'],
        })

        expect(cycleAdherence(input)).toBe(1 / 2)
    })

    it('fica nulo quando o plano não tem treino previsto nos dias decorridos', () => {
        const input = adherenceInput({ firstDay: '2026-07-07', lastDay: '2026-07-07' })

        expect(cycleAdherence(input)).toBeNull()
    })
})

describe('weeklyRateChange', () => {
    it('compara com o ciclo anterior pelos valores arredondados', () => {
        expect(weeklyRateChange(2.76, { number: 1, rate: 2.24 })).toEqual({ previousNumber: 1, difference: 0.6 })
    })

    it('fica nulo sem ciclo anterior', () => {
        expect(weeklyRateChange(3, null)).toBeNull()
    })

    it('fica nulo quando algum dos dois ciclos ainda não começou', () => {
        expect(weeklyRateChange(null, { number: 1, rate: 3 })).toBeNull()
        expect(weeklyRateChange(3, { number: 1, rate: null })).toBeNull()
    })
})
