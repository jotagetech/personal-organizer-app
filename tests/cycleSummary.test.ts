import { describe, expect, it } from 'vitest'

import type { WorkoutCycleRow } from '@/features/cycle/types'
import type { CycleHistory, HistorySession } from '@/features/evolution/data/cycleHistory'
import { summarizeCycles } from '@/features/evolution/metrics/cycleSummary'

function cycleRow(id: string, startDate: string): WorkoutCycleRow {
    return { id, user_id: 'user-1', start_date: startDate, created_at: '2026-01-01T00:00:00Z' }
}

function session(sessionDate: string, overrides: Partial<HistorySession> = {}): HistorySession {
    return {
        sessionDate,
        finishedAt: `${sessionDate}T20:00:00Z`,
        planId: 'plan-a',
        blockWeek: null,
        blockWeeks: null,
        ...overrides,
    }
}

const PLANS = [{ id: 'plan-a', name: 'Treino ABC', importedAt: '2026-05-01T10:00:00Z' }]
const TODAY = '2026-07-20'

function historyOf(cycles: WorkoutCycleRow[], sessions: HistorySession[], plans = PLANS): CycleHistory {
    return { cycles, sessions, plans }
}

describe('summarizeCycles', () => {
    it('devolve lista vazia sem ciclos', () => {
        expect(summarizeCycles(historyOf([], []), TODAY)).toEqual([])
    })

    it('resume ciclo sem sessões', () => {
        const [summary] = summarizeCycles(historyOf([cycleRow('c1', '2026-07-06')], []), TODAY)

        expect(summary).toEqual({
            cycleId: 'c1',
            number: 1,
            startDate: '2026-07-06',
            endDate: null,
            isOpen: true,
            durationDays: 15,
            finishedWorkouts: 0,
            startedNotFinished: 0,
            plans: [],
            lastBlockWeek: null,
        })
    })

    it('ordena do mais recente ao mais antigo e fecha o ciclo no dia anterior ao seguinte', () => {
        const cycles = [cycleRow('c1', '2026-06-01'), cycleRow('c2', '2026-07-06')]
        const summaries = summarizeCycles(historyOf(cycles, []), TODAY)

        expect(summaries.map((item) => item.number)).toEqual([2, 1])
        expect(summaries[1]).toMatchObject({ endDate: '2026-07-05', isOpen: false, durationDays: 35 })
        expect(summaries[0]).toMatchObject({ endDate: null, isOpen: true })
    })

    it('conta só os dias decorridos do ciclo atual que já tem um próximo marcado no futuro', () => {
        const cycles = [cycleRow('c1', '2026-07-06'), cycleRow('c2', '2026-07-25')]
        const summaries = summarizeCycles(historyOf(cycles, []), TODAY)

        expect(summaries[1]).toMatchObject({ endDate: '2026-07-24', durationDays: 15 })
        expect(summaries[0].durationDays).toBe(0)
    })

    it('zera a duração de ciclo que ainda não começou', () => {
        const [summary] = summarizeCycles(historyOf([cycleRow('c1', '2026-07-25')], []), TODAY)

        expect(summary.durationDays).toBe(0)
    })

    it('conta a sessão do último dia no ciclo que termina ali', () => {
        const cycles = [cycleRow('c1', '2026-06-01'), cycleRow('c2', '2026-07-06')]
        const sessions = [session('2026-07-05'), session('2026-07-06')]
        const summaries = summarizeCycles(historyOf(cycles, sessions), TODAY)

        expect(summaries[1].finishedWorkouts).toBe(1)
        expect(summaries[0].finishedWorkouts).toBe(1)
    })

    it('conta treino iniciado e não finalizado só em data anterior a hoje', () => {
        const sessions = [
            session('2026-07-10', { finishedAt: null }),
            session(TODAY, { finishedAt: null }),
            session('2026-07-12'),
        ]
        const [summary] = summarizeCycles(historyOf([cycleRow('c1', '2026-07-06')], sessions), TODAY)

        expect(summary).toMatchObject({ finishedWorkouts: 1, startedNotFinished: 1 })
    })

    it('ignora sessões anteriores ao primeiro ciclo', () => {
        const [summary] = summarizeCycles(historyOf([cycleRow('c1', '2026-07-06')], [session('2026-07-01')]), TODAY)

        expect(summary.finishedWorkouts).toBe(0)
    })

    it('lista dois planos do mesmo ciclo na ordem do primeiro uso, com versão quando o nome repete', () => {
        const plans = [
            { id: 'plan-a', name: 'Treino ABC', importedAt: '2026-05-01T10:00:00Z' },
            { id: 'plan-b', name: 'Treino ABC', importedAt: '2026-07-08T10:00:00Z' },
        ]
        const sessions = [
            session('2026-07-07', { planId: 'plan-a' }),
            session('2026-07-09', { planId: 'plan-b' }),
            session('2026-07-10', { planId: 'plan-a' }),
        ]
        const [summary] = summarizeCycles(historyOf([cycleRow('c1', '2026-07-06')], sessions, plans), TODAY)

        expect(summary.plans).toEqual(['Treino ABC (versão 1 de 2)', 'Treino ABC (versão 2 de 2)'])
    })

    it('usa o nome simples quando os planos têm nomes diferentes', () => {
        const plans = [
            { id: 'plan-a', name: 'Treino ABC', importedAt: '2026-05-01T10:00:00Z' },
            { id: 'plan-b', name: 'Full body', importedAt: '2026-07-08T10:00:00Z' },
        ]
        const sessions = [session('2026-07-09', { planId: 'plan-b' }), session('2026-07-10', { planId: 'plan-a' })]
        const [summary] = summarizeCycles(historyOf([cycleRow('c1', '2026-07-06')], sessions, plans), TODAY)

        expect(summary.plans).toEqual(['Full body', 'Treino ABC'])
    })

    it('chama de Plano removido o plano que não está na lista', () => {
        const sessions = [session('2026-07-09', { planId: 'sumiu' })]
        const [summary] = summarizeCycles(historyOf([cycleRow('c1', '2026-07-06')], sessions), TODAY)

        expect(summary.plans).toEqual(['Plano removido'])
    })

    it('usa a semana de bloco da última sessão que tem bloco', () => {
        const sessions = [
            session('2026-07-07', { blockWeek: 1, blockWeeks: 4 }),
            session('2026-07-14', { blockWeek: 2, blockWeeks: 4 }),
            session('2026-07-16'),
        ]
        const [summary] = summarizeCycles(historyOf([cycleRow('c1', '2026-07-06')], sessions), TODAY)

        expect(summary.lastBlockWeek).toEqual({ semana: 2, totalSemanas: 4 })
    })
})
