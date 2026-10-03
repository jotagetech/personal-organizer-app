import { describe, expect, it } from 'vitest'

import { buildMonthGrid, formatMonthTitle, parseTypedDate } from '@/features/shared/monthCalendar'

function leadingBlanks(grid: (string | null)[]): number {
    const firstDayIndex = grid.findIndex((cell) => cell !== null)

    return firstDayIndex
}

describe('buildMonthGrid', () => {
    it('começa no domingo sem células vazias', () => {
        const grid = buildMonthGrid(2026, 2)

        expect(leadingBlanks(grid)).toBe(0)
        expect(grid[0]).toBe('2026-02-01')
        expect(grid).toHaveLength(28)
    })

    it('desloca o dia 1 conforme o dia da semana', () => {
        expect(leadingBlanks(buildMonthGrid(2026, 10))).toBe(4)
        expect(leadingBlanks(buildMonthGrid(2026, 8))).toBe(6)
        expect(leadingBlanks(buildMonthGrid(2026, 6))).toBe(1)
    })

    it('inclui 29 dias em fevereiro de ano bissexto', () => {
        const grid = buildMonthGrid(2028, 2)
        const days = grid.filter((cell) => cell !== null)

        expect(days).toHaveLength(29)
        expect(days[28]).toBe('2028-02-29')
    })

    it('termina no último dia do mês', () => {
        const grid = buildMonthGrid(2026, 12)

        expect(grid[grid.length - 1]).toBe('2026-12-31')
    })
})

describe('formatMonthTitle', () => {
    it('escreve mês em minúsculas e ano', () => {
        expect(formatMonthTitle(2026, 10)).toBe('outubro 2026')
        expect(formatMonthTitle(2027, 3)).toBe('março 2027')
    })
})

describe('parseTypedDate', () => {
    const today = '2026-10-03'

    it('aceita dd/mm/aaaa', () => {
        expect(parseTypedDate('15/11/2026', today)).toBe('2026-11-15')
    })

    it('aceita dd/mm/aa', () => {
        expect(parseTypedDate('05/01/27', today)).toBe('2027-01-05')
    })

    it('aceita dd/mm usando o ano de hoje', () => {
        expect(parseTypedDate('20/12', today)).toBe('2026-12-20')
        expect(parseTypedDate('3/10', today)).toBe('2026-10-03')
    })

    it('usa o próximo ano quando dd/mm já passou', () => {
        expect(parseTypedDate('02/10', today)).toBe('2027-10-02')
        expect(parseTypedDate('01/01', today)).toBe('2027-01-01')
    })

    it('acha o próximo 29/02 bissexto sem ano', () => {
        expect(parseTypedDate('29/02', today)).toBe('2028-02-29')
    })

    it('ignora espaços nas pontas', () => {
        expect(parseTypedDate('  15/11/2026 ', today)).toBe('2026-11-15')
    })

    it('rejeita datas inexistentes e texto', () => {
        expect(parseTypedDate('31/02', today)).toBeNull()
        expect(parseTypedDate('31/02/2026', today)).toBeNull()
        expect(parseTypedDate('29/02/2027', today)).toBeNull()
        expect(parseTypedDate('00/10', today)).toBeNull()
        expect(parseTypedDate('10/00/2026', today)).toBeNull()
        expect(parseTypedDate('10/13/2026', today)).toBeNull()
        expect(parseTypedDate('amanhã', today)).toBeNull()
        expect(parseTypedDate('', today)).toBeNull()
        expect(parseTypedDate('10/10/202', today)).toBeNull()
    })
})
