import { describe, expect, it } from 'vitest'

import { isValidIsoDate, shiftIsoDate, weekdayOfIsoDate } from '@/lib/dateUtils'

describe('weekdayOfIsoDate', () => {
    it('identifica segunda-feira corretamente', () => {
        expect(weekdayOfIsoDate('2026-09-28')).toBe('segunda')
    })

    it('identifica domingo corretamente', () => {
        expect(weekdayOfIsoDate('2026-09-27')).toBe('domingo')
    })
})

describe('shiftIsoDate', () => {
    it('avança um dia sem deslocar por fuso', () => {
        expect(shiftIsoDate('2026-09-27', 1)).toBe('2026-09-28')
    })

    it('atravessa a virada de mês corretamente', () => {
        expect(shiftIsoDate('2026-09-30', 1)).toBe('2026-10-01')
    })

    it('volta um dia corretamente', () => {
        expect(shiftIsoDate('2026-10-01', -1)).toBe('2026-09-30')
    })
})

describe('isValidIsoDate', () => {
    it('aceita data válida', () => {
        expect(isValidIsoDate('2026-02-28')).toBe(true)
    })

    it('rejeita data inexistente', () => {
        expect(isValidIsoDate('2026-02-30')).toBe(false)
    })

    it('rejeita formato fora do padrão', () => {
        expect(isValidIsoDate('27/09/2026')).toBe(false)
    })
})
