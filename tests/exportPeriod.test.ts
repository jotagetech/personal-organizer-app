import { describe, expect, it } from 'vitest'

import { listDatesInPeriod, resolvePeriodShortcut, validatePeriod } from '@/features/export/period'

describe('resolvePeriodShortcut', () => {
    it('"esta semana" vai da segunda até hoje', () => {
        expect(resolvePeriodShortcut('this_week', '2026-09-30')).toEqual({ start: '2026-09-28', end: '2026-09-30' })
    })

    it('"esta semana" numa segunda é só o próprio dia', () => {
        expect(resolvePeriodShortcut('this_week', '2026-09-28')).toEqual({ start: '2026-09-28', end: '2026-09-28' })
    })

    it('"esta semana" num domingo pega a segunda anterior, não o próprio domingo', () => {
        expect(resolvePeriodShortcut('this_week', '2026-10-04')).toEqual({ start: '2026-09-28', end: '2026-10-04' })
    })

    it('"esta semana" atravessa a virada do ano', () => {
        expect(resolvePeriodShortcut('this_week', '2026-01-01')).toEqual({ start: '2025-12-29', end: '2026-01-01' })
    })

    it('"semana passada" vai de segunda a domingo da semana anterior', () => {
        expect(resolvePeriodShortcut('last_week', '2026-09-30')).toEqual({ start: '2026-09-21', end: '2026-09-27' })
        expect(resolvePeriodShortcut('last_week', '2026-10-04')).toEqual({ start: '2026-09-21', end: '2026-09-27' })
    })

    it('"semana passada" atravessa a virada do mês e do ano', () => {
        expect(resolvePeriodShortcut('last_week', '2026-10-01')).toEqual({ start: '2026-09-21', end: '2026-09-27' })
        expect(resolvePeriodShortcut('last_week', '2026-01-01')).toEqual({ start: '2025-12-22', end: '2025-12-28' })
    })

    it('"este mês" vai do dia 1 até hoje', () => {
        expect(resolvePeriodShortcut('this_month', '2026-09-28')).toEqual({ start: '2026-09-01', end: '2026-09-28' })
        expect(resolvePeriodShortcut('this_month', '2026-09-01')).toEqual({ start: '2026-09-01', end: '2026-09-01' })
    })

    it('"mês passado" cobre o mês anterior inteiro, inclusive fevereiro bissexto', () => {
        expect(resolvePeriodShortcut('last_month', '2026-03-15')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
        expect(resolvePeriodShortcut('last_month', '2024-03-31')).toEqual({ start: '2024-02-01', end: '2024-02-29' })
    })

    it('"mês passado" em janeiro volta pro dezembro do ano anterior', () => {
        expect(resolvePeriodShortcut('last_month', '2026-01-10')).toEqual({ start: '2025-12-01', end: '2025-12-31' })
    })
})

describe('validatePeriod', () => {
    it('aceita período de um dia só', () => {
        expect(validatePeriod({ start: '2026-09-28', end: '2026-09-28' })).toBeNull()
    })

    it('recusa início depois do fim', () => {
        expect(validatePeriod({ start: '2026-09-29', end: '2026-09-28' })).toMatch(/início/)
    })

    it('recusa data vazia ou inválida', () => {
        expect(validatePeriod({ start: '', end: '2026-09-28' })).not.toBeNull()
        expect(validatePeriod({ start: '2026-02-30', end: '2026-03-01' })).not.toBeNull()
    })

    it('aceita até 366 dias e recusa a partir de 367', () => {
        expect(validatePeriod({ start: '2025-01-01', end: '2026-01-01' })).toBeNull()
        expect(validatePeriod({ start: '2025-01-01', end: '2026-01-02' })).toMatch(/367 dias/)
    })
})

describe('listDatesInPeriod', () => {
    it('lista cada dia do período, inclusive as pontas', () => {
        expect(listDatesInPeriod({ start: '2026-09-29', end: '2026-10-02' })).toEqual([
            '2026-09-29',
            '2026-09-30',
            '2026-10-01',
            '2026-10-02',
        ])
    })
})
