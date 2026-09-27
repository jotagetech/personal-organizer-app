import { describe, expect, it } from 'vitest'

import { buildWeeklyCompletionGrid, mondayOnOrBefore } from '@/features/results/resultsGrid'

describe('mondayOnOrBefore', () => {
    it('retorna a mesma data quando já é segunda-feira', () => {
        expect(mondayOnOrBefore('2026-09-28')).toBe('2026-09-28')
    })

    it('volta até a segunda-feira anterior quando a data é um domingo', () => {
        expect(mondayOnOrBefore('2026-09-27')).toBe('2026-09-21')
    })
})

describe('buildWeeklyCompletionGrid', () => {
    it('gera uma semana só quando o intervalo cabe em 7 dias', () => {
        const weeks = buildWeeklyCompletionGrid('2026-09-28', '2026-09-30', new Set(['2026-09-29']))

        expect(weeks).toHaveLength(1)
        expect(weeks[0].weekStart).toBe('2026-09-28')
        expect(weeks[0].days.map((day) => day.inRange)).toEqual([true, true, true, false, false, false, false])
        expect(weeks[0].days[1].completed).toBe(true)
        expect(weeks[0].days[0].completed).toBe(false)
    })

    it('marca fora do intervalo os dias antes do início do ciclo', () => {
        const weeks = buildWeeklyCompletionGrid('2026-09-30', '2026-10-02', new Set())

        expect(weeks[0].days[0].inRange).toBe(false)
        expect(weeks[0].days[0].date).toBe('2026-09-28')
        expect(weeks[0].days[2].inRange).toBe(true)
        expect(weeks[0].days[2].date).toBe('2026-09-30')
    })

    it('cria semanas suficientes para cobrir todo o intervalo', () => {
        const weeks = buildWeeklyCompletionGrid('2026-09-21', '2026-10-04', new Set())
        expect(weeks).toHaveLength(2)
    })
})
