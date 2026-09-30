import { describe, expect, it } from 'vitest'

import type { CycleSummary } from '@/features/evolution/metrics/cycleSummary'
import {
    buildDeleteCycleQuestion,
    cycleFocusDate,
    formatCycleBlockWeek,
    formatCycleCounts,
    formatCyclePlans,
    formatCycleRange,
    formatCycleRateChange,
    formatCycleRhythm,
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
        planTimeline: null,
        lastBlockWeek: null,
        workoutsPerWeek: null,
        adherence: null,
        weeklyRateChange: null,
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

describe('formatCyclePlans', () => {
    it('mostra a troca de plano com a data em que ela passou a valer', () => {
        const planTimeline = [
            { name: 'Plano A', startDate: '2026-07-06' },
            { name: 'Plano B', startDate: '2026-07-10' },
        ]

        expect(formatCyclePlans(summaryOf({ planTimeline, plans: ['Outro'] }))).toBe(
            'Plano A · depois Plano B desde 10/07',
        )
    })

    it('mostra um plano só quando não houve troca', () => {
        const planTimeline = [{ name: 'Plano A', startDate: '2026-07-06' }]

        expect(formatCyclePlans(summaryOf({ planTimeline }))).toBe('Plano A')
    })

    it('cai nos planos das sessões sem linha do tempo', () => {
        expect(formatCyclePlans(summaryOf({ plans: ['Plano A', 'Plano B'] }))).toBe('Plano A, Plano B')
    })

    it('não mostra nada sem linha do tempo e sem sessões', () => {
        expect(formatCyclePlans(summaryOf())).toBeNull()
    })
})

describe('formatCycleRhythm', () => {
    it('não mostra nada em ciclo que ainda não começou', () => {
        expect(formatCycleRhythm(summaryOf())).toBeNull()
    })

    it('mostra o ritmo com uma casa decimal e vírgula', () => {
        expect(formatCycleRhythm(summaryOf({ workoutsPerWeek: 8 / 15 * 7 }))).toBe('3,7 treinos por semana')
    })

    it('usa o singular entre um e dois treinos por semana', () => {
        expect(formatCycleRhythm(summaryOf({ workoutsPerWeek: 1.5 }))).toBe('1,5 treino por semana')
    })

    it('acrescenta a aderência em porcentagem quando existe', () => {
        expect(formatCycleRhythm(summaryOf({ workoutsPerWeek: 3, adherence: 0.8333 }))).toBe(
            '3,0 treinos por semana · aderência 83%',
        )
    })
})

describe('formatCycleRateChange', () => {
    it('não mostra nada sem ciclo anterior para comparar', () => {
        expect(formatCycleRateChange(summaryOf())).toBeNull()
    })

    it('mostra o ganho com sinal de mais', () => {
        const weeklyRateChange = { previousNumber: 1, difference: 0.5 }

        expect(formatCycleRateChange(summaryOf({ weeklyRateChange }))).toBe('+0,5 por semana que o Ciclo 1')
    })

    it('mostra a queda com sinal de menos', () => {
        const weeklyRateChange = { previousNumber: 1, difference: -1.2 }

        expect(formatCycleRateChange(summaryOf({ weeklyRateChange }))).toBe('-1,2 por semana que o Ciclo 1')
    })

    it('fala em mesmo ritmo quando a diferença é zero', () => {
        const weeklyRateChange = { previousNumber: 3, difference: 0 }

        expect(formatCycleRateChange(summaryOf({ weeklyRateChange }))).toBe('mesmo ritmo do Ciclo 3')
    })
})
