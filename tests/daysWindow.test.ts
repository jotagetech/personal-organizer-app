import { describe, expect, it } from 'vitest'

import type { WorkoutCycleRow } from '@/features/cycle/types'
import {
    formatDaysGridTitle,
    formatExpandGridLabel,
    resolveCycleNavigation,
    resolveDaysRangeEnd,
    resolveDaysWindow,
} from '@/features/evolution/sections/daysWindow'

function cycleRow(id: string, startDate: string): WorkoutCycleRow {
    return { id, user_id: 'user-1', start_date: startDate, created_at: '2026-01-01T00:00:00Z' }
}

const CYCLES = [cycleRow('c1', '2026-06-01'), cycleRow('c2', '2026-07-06')]
const TODAY = '2026-07-20'

describe('resolveDaysWindow', () => {
    it('usa o ciclo fechado da data selecionada', () => {
        expect(resolveDaysWindow(CYCLES, '2026-06-15', TODAY)).toEqual({
            rangeStart: '2026-06-01',
            cycleNumber: 1,
            cycleStart: '2026-06-01',
            cycleEnd: '2026-07-05',
        })
    })

    it('usa o ciclo em aberto sem data de fim', () => {
        expect(resolveDaysWindow(CYCLES, TODAY, TODAY)).toMatchObject({ cycleNumber: 2, cycleEnd: null })
    })

    it('cai nos últimos dias sem ciclo na data', () => {
        expect(resolveDaysWindow(CYCLES, '2026-05-10', TODAY)).toEqual({
            rangeStart: '2026-06-23',
            cycleNumber: null,
            cycleStart: null,
            cycleEnd: null,
        })
    })

    it('não deixa a janela começar depois de hoje', () => {
        expect(resolveDaysWindow(CYCLES, '2026-07-25', '2026-07-01')).toMatchObject({ rangeStart: '2026-07-01' })
    })
})

describe('resolveDaysRangeEnd', () => {
    it('termina no último dia do ciclo fechado', () => {
        const window = resolveDaysWindow(CYCLES, '2026-06-15', TODAY)

        expect(resolveDaysRangeEnd(window, ['2026-06-10'], TODAY)).toBe('2026-07-05')
    })

    it('vai até hoje no ciclo em aberto e se estende ao último treino concluído', () => {
        const window = resolveDaysWindow(CYCLES, TODAY, TODAY)

        expect(resolveDaysRangeEnd(window, ['2026-07-10'], TODAY)).toBe(TODAY)
        expect(resolveDaysRangeEnd(window, ['2026-07-10', '2026-07-22'], TODAY)).toBe('2026-07-22')
    })
})

describe('textos da grade', () => {
    it('monta o título com o número do ciclo e o intervalo', () => {
        expect(formatDaysGridTitle(resolveDaysWindow(CYCLES, TODAY, TODAY))).toBe(
            'Dias de treino concluídos · Ciclo 2 · desde 06/07',
        )
        expect(formatDaysGridTitle(resolveDaysWindow(CYCLES, '2026-06-15', TODAY))).toBe(
            'Dias de treino concluídos · Ciclo 1 · desde 01/06 até 05/07',
        )
        expect(formatDaysGridTitle(resolveDaysWindow(CYCLES, '2026-05-10', TODAY))).toBe('Dias de treino concluídos')
    })

    it('monta o rótulo de expandir', () => {
        expect(formatExpandGridLabel(resolveDaysWindow(CYCLES, TODAY, TODAY), 8)).toBe('Ver ciclo inteiro (8 semanas)')
        expect(formatExpandGridLabel(resolveDaysWindow(CYCLES, '2026-05-10', TODAY), 8)).toBe(
            'Ver todas as semanas (8 semanas)',
        )
    })
})

describe('resolveCycleNavigation', () => {
    it('vai ao último dia do anterior e ao primeiro dia do seguinte', () => {
        const cycles = [...CYCLES, cycleRow('c3', '2026-08-10')]

        expect(resolveCycleNavigation(cycles, '2026-07-20')).toEqual({
            previousDate: '2026-07-05',
            nextDate: '2026-08-10',
        })
    })

    it('não tem anterior no primeiro ciclo', () => {
        expect(resolveCycleNavigation(CYCLES, '2026-06-15')).toEqual({
            previousDate: null,
            nextDate: '2026-07-06',
        })
    })

    it('não tem próximo no ciclo em aberto', () => {
        expect(resolveCycleNavigation(CYCLES, TODAY)).toEqual({
            previousDate: '2026-07-05',
            nextDate: null,
        })
    })

    it('antes do primeiro ciclo só oferece o próximo', () => {
        expect(resolveCycleNavigation(CYCLES, '2026-05-01')).toEqual({
            previousDate: null,
            nextDate: '2026-06-01',
        })
    })

    it('não oferece nada sem ciclos', () => {
        expect(resolveCycleNavigation([], TODAY)).toEqual({ previousDate: null, nextDate: null })
    })
})
