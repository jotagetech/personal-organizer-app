import { describe, expect, it } from 'vitest'

import type { CycleSummary } from '@/features/evolution/metrics/cycleSummary'
import {
    buildDeleteCycleQuestion,
    cycleFocusDate,
    formatCycleBlockWeek,
    formatCycleCounts,
    formatCycleRange,
} from '@/features/evolution/metrics/cycleText'

function summaryOf(overrides: Partial<CycleSummary> = {}): CycleSummary {
    return {
        cycleId: 'c2',
        number: 2,
        startDate: '2026-07-06',
        endDate: null,
        isOpen: true,
        durationDays: 15,
        finishedWorkouts: 8,
        startedNotFinished: 0,
        plans: [],
        lastBlockWeek: null,
        ...overrides,
    }
}

describe('formatCycleRange', () => {
    it('mostra início e fim do ciclo fechado', () => {
        expect(formatCycleRange(summaryOf({ endDate: '2026-07-19', isOpen: false }))).toBe('06/07 até 19/07')
    })

    it('marca o ciclo em aberto como em andamento', () => {
        expect(formatCycleRange(summaryOf())).toBe('desde 06/07 · em andamento')
    })
})

describe('formatCycleCounts', () => {
    it('junta dias e treinos', () => {
        expect(formatCycleCounts(summaryOf())).toBe('15 dias · 8 treinos')
    })

    it('usa o singular e acrescenta os sem finalizar', () => {
        expect(formatCycleCounts(summaryOf({ durationDays: 1, finishedWorkouts: 1, startedNotFinished: 2 }))).toBe(
            '1 dia · 1 treino · 2 sem finalizar',
        )
    })
})

describe('formatCycleBlockWeek', () => {
    it('é nulo sem bloco', () => {
        expect(formatCycleBlockWeek(summaryOf())).toBeNull()
    })

    it('descreve a semana do bloco', () => {
        expect(formatCycleBlockWeek(summaryOf({ lastBlockWeek: { semana: 2, totalSemanas: 4 } }))).toBe(
            'Semana 2 de 4 do bloco',
        )
    })
})

describe('cycleFocusDate', () => {
    it('vai ao último dia do ciclo fechado', () => {
        expect(cycleFocusDate(summaryOf({ endDate: '2026-07-19' }), '2026-07-20')).toBe('2026-07-19')
    })

    it('vai a hoje no ciclo em aberto', () => {
        expect(cycleFocusDate(summaryOf(), '2026-07-20')).toBe('2026-07-20')
    })
})

describe('cycleFocusDate em ciclo futuro', () => {
    it('vai ao início do ciclo em aberto que ainda não começou', () => {
        expect(cycleFocusDate(summaryOf({ startDate: '2026-07-25' }), '2026-07-20')).toBe('2026-07-25')
    })
})

describe('buildDeleteCycleQuestion', () => {
    it('diz que os dias passam ao ciclo anterior', () => {
        expect(buildDeleteCycleQuestion(summaryOf({ number: 2 }))).toBe(
            'Excluir o Ciclo 2? Os treinos continuam registrados; os dias dele passam a contar no ciclo anterior.',
        )
    })

    it('diz que os dias ficam sem ciclo quando não há anterior', () => {
        expect(buildDeleteCycleQuestion(summaryOf({ number: 1 }))).toBe(
            'Excluir o Ciclo 1? Os treinos continuam registrados; os dias dele passam a ficar sem ciclo.',
        )
    })
})
