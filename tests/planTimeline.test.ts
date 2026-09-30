import { describe, expect, it } from 'vitest'

import { planChangesInCycle, planOnDate } from '@/features/evolution/metrics/planTimeline'

const TIME_ZONE = 'America/Sao_Paulo'

describe('planOnDate', () => {
    it('devolve nulo antes da primeira ativação', () => {
        const activations = [{ planId: 'plan-a', activatedAt: '2026-07-06T12:00:00Z' }]

        expect(planOnDate(activations, '2026-07-05', TIME_ZONE)).toBeNull()
    })

    it('usa a última ativação até a data, em qualquer ordem de chegada', () => {
        const activations = [
            { planId: 'plan-b', activatedAt: '2026-07-10T12:00:00Z' },
            { planId: 'plan-a', activatedAt: '2026-07-01T12:00:00Z' },
        ]

        expect(planOnDate(activations, '2026-07-09', TIME_ZONE)).toBe('plan-a')
        expect(planOnDate(activations, '2026-07-10', TIME_ZONE)).toBe('plan-b')
        expect(planOnDate(activations, '2026-08-01', TIME_ZONE)).toBe('plan-b')
    })

    it('conta a ativação na data local do fuso, não na data UTC', () => {
        const activations = [{ planId: 'plan-a', activatedAt: '2026-07-11T01:30:00Z' }]

        expect(planOnDate(activations, '2026-07-10', TIME_ZONE)).toBe('plan-a')
        expect(planOnDate(activations, '2026-07-10', 'UTC')).toBeNull()
    })

    it('deixa o dia inteiro com a última de várias trocas no mesmo dia', () => {
        const activations = [
            { planId: 'plan-a', activatedAt: '2026-07-10T12:00:00Z' },
            { planId: 'plan-b', activatedAt: '2026-07-10T18:00:00Z' },
        ]

        expect(planOnDate(activations, '2026-07-10', TIME_ZONE)).toBe('plan-b')
    })
})

describe('planChangesInCycle', () => {
    const cycle = { startDate: '2026-07-06', endDate: '2026-07-19' }

    it('começa no início do ciclo com o plano que já valia', () => {
        const activations = [{ planId: 'plan-a', activatedAt: '2026-06-01T12:00:00Z' }]

        expect(planChangesInCycle(activations, cycle, TIME_ZONE)).toEqual([
            { planId: 'plan-a', startDate: '2026-07-06' },
        ])
    })

    it('lista as trocas dentro do ciclo e ignora as de depois do fim', () => {
        const activations = [
            { planId: 'plan-a', activatedAt: '2026-06-01T12:00:00Z' },
            { planId: 'plan-b', activatedAt: '2026-07-10T12:00:00Z' },
            { planId: 'plan-c', activatedAt: '2026-07-25T12:00:00Z' },
        ]

        expect(planChangesInCycle(activations, cycle, TIME_ZONE)).toEqual([
            { planId: 'plan-a', startDate: '2026-07-06' },
            { planId: 'plan-b', startDate: '2026-07-10' },
        ])
    })

    it('não abre período ao reativar o plano que já valia', () => {
        const activations = [
            { planId: 'plan-a', activatedAt: '2026-06-01T12:00:00Z' },
            { planId: 'plan-a', activatedAt: '2026-07-12T12:00:00Z' },
        ]

        expect(planChangesInCycle(activations, cycle, TIME_ZONE)).toEqual([
            { planId: 'plan-a', startDate: '2026-07-06' },
        ])
    })

    it('ignora a ida e volta no mesmo dia', () => {
        const activations = [
            { planId: 'plan-a', activatedAt: '2026-06-01T12:00:00Z' },
            { planId: 'plan-b', activatedAt: '2026-07-12T12:00:00Z' },
            { planId: 'plan-a', activatedAt: '2026-07-12T13:00:00Z' },
        ]

        expect(planChangesInCycle(activations, cycle, TIME_ZONE)).toEqual([
            { planId: 'plan-a', startDate: '2026-07-06' },
        ])
    })

    it('começa depois do início quando nenhuma ativação cobre o primeiro dia', () => {
        const activations = [{ planId: 'plan-a', activatedAt: '2026-07-08T12:00:00Z' }]

        expect(planChangesInCycle(activations, cycle, TIME_ZONE)).toEqual([
            { planId: 'plan-a', startDate: '2026-07-08' },
        ])
    })

    it('aceita ciclo em aberto sem limite de fim', () => {
        const activations = [
            { planId: 'plan-a', activatedAt: '2026-06-01T12:00:00Z' },
            { planId: 'plan-b', activatedAt: '2026-09-01T12:00:00Z' },
        ]

        expect(planChangesInCycle(activations, { startDate: '2026-07-06', endDate: null }, TIME_ZONE)).toEqual([
            { planId: 'plan-a', startDate: '2026-07-06' },
            { planId: 'plan-b', startDate: '2026-09-01' },
        ])
    })
})
