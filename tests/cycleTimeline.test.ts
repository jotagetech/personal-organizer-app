import { describe, expect, it } from 'vitest'

import { buildCycleBadgeText, buildPlanWeekText } from '@/features/cycle/cycleStatusText'
import { cycleForDate, nextCycleAfter } from '@/features/cycle/cycleTimeline'
import type { WorkoutCycleRow } from '@/features/cycle/types'

function cycleRow(id: string, startDate: string, createdAt = '2026-01-01T00:00:00Z'): WorkoutCycleRow {
    return { id, user_id: 'user-1', start_date: startDate, created_at: createdAt }
}

const FIRST = cycleRow('c1', '2026-06-01')
const SECOND = cycleRow('c2', '2026-07-06')
const THIRD = cycleRow('c3', '2026-08-10')
const CYCLES = [FIRST, SECOND, THIRD]

describe('cycleForDate', () => {
    it('não tem ciclo sem nenhum ciclo cadastrado', () => {
        expect(cycleForDate([], '2026-07-10')).toBeNull()
    })

    it('não tem ciclo antes do primeiro', () => {
        expect(cycleForDate(CYCLES, '2026-05-31')).toBeNull()
    })

    it('acha o ciclo do meio com número e último dia', () => {
        expect(cycleForDate(CYCLES, '2026-07-20')).toEqual({ cycle: SECOND, number: 2, endDate: '2026-08-09' })
    })

    it('mantém o último dia dentro do ciclo', () => {
        expect(cycleForDate(CYCLES, '2026-07-05')).toEqual({ cycle: FIRST, number: 1, endDate: '2026-07-05' })
    })

    it('passa para o ciclo seguinte no primeiro dia dele', () => {
        expect(cycleForDate(CYCLES, '2026-07-06')).toMatchObject({ cycle: SECOND, number: 2 })
    })

    it('deixa o ciclo em aberto sem último dia', () => {
        expect(cycleForDate(CYCLES, '2026-12-31')).toEqual({ cycle: THIRD, number: 3, endDate: null })
    })

    it('usa o ciclo criado depois quando dois começam no mesmo dia', () => {
        const original = cycleRow('a', '2026-07-06', '2026-07-01T00:00:00Z')
        const replacement = cycleRow('b', '2026-07-06', '2026-07-02T00:00:00Z')
        const cycles = [FIRST, original, replacement, THIRD]

        expect(cycleForDate(cycles, '2026-07-06')).toEqual({ cycle: replacement, number: 2, endDate: '2026-08-09' })
        expect(cycleForDate(cycles, '2026-12-31')).toMatchObject({ cycle: THIRD, number: 3 })
        expect(cycleForDate(cycles, '2026-07-05')).toMatchObject({ cycle: FIRST, endDate: '2026-07-05' })
    })
})

describe('nextCycleAfter', () => {
    it('devolve o primeiro ciclo que começa depois da data', () => {
        expect(nextCycleAfter(CYCLES, '2026-05-01')).toBe(FIRST)
        expect(nextCycleAfter(CYCLES, '2026-07-06')).toBe(THIRD)
    })

    it('não tem próximo depois do último início nem sem ciclos', () => {
        expect(nextCycleAfter(CYCLES, '2026-08-10')).toBeNull()
        expect(nextCycleAfter([], '2026-08-10')).toBeNull()
    })
})

describe('buildCycleBadgeText', () => {
    const today = '2026-07-20'

    it('mostra ciclo e dia, com o aviso do próximo quando a data é hoje ou futura', () => {
        expect(buildCycleBadgeText(CYCLES, '2026-07-20', today)).toBe('Ciclo 2 · Dia 15 · próximo em 21 dias')
        expect(buildCycleBadgeText(CYCLES, '2026-08-09', today)).toBe('Ciclo 2 · Dia 35 · próximo em 1 dia')
    })

    it('não avisa o próximo ciclo numa data passada', () => {
        expect(buildCycleBadgeText(CYCLES, '2026-07-10', today)).toBe('Ciclo 2 · Dia 5')
    })

    it('não avisa próximo no ciclo em aberto', () => {
        expect(buildCycleBadgeText(CYCLES, '2026-08-12', '2026-08-12')).toBe('Ciclo 3 · Dia 3')
    })

    it('avisa que o ciclo começa quando a data ainda é anterior ao primeiro e é hoje ou futura', () => {
        expect(buildCycleBadgeText(CYCLES, '2026-05-30', '2026-05-30')).toBe('Ciclo começa em 2 dias')
        expect(buildCycleBadgeText([FIRST], '2026-05-31', '2026-05-30')).toBe('Ciclo começa em 1 dia')
    })

    it('fica sem selo numa data passada anterior ao primeiro ciclo e sem ciclos', () => {
        expect(buildCycleBadgeText(CYCLES, '2026-05-20', today)).toBeNull()
        expect(buildCycleBadgeText([], '2026-07-20', today)).toBeNull()
    })
})

describe('buildPlanWeekText', () => {
    it('mostra a semana e a descrição', () => {
        expect(buildPlanWeekText({ semana: 1, totalSemanas: 4, volta: 1, descricao: 'Calibração' })).toBe(
            'Semana 1 de 4 · Calibração',
        )
    })

    it('acrescenta a volta só a partir da segunda', () => {
        expect(buildPlanWeekText({ semana: 2, totalSemanas: 4, volta: 1, descricao: null })).toBe('Semana 2 de 4')
        expect(buildPlanWeekText({ semana: 1, totalSemanas: 4, volta: 2, descricao: 'Calibração' })).toBe(
            'Semana 1 de 4 · volta 2 · Calibração',
        )
    })
})
