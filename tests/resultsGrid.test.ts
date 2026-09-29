import { describe, expect, it } from 'vitest'

import {
    buildWeeklyCompletionGrid,
    expandRangeToIncludeDate,
    mondayOnOrBefore,
    selectVisibleWeeks,
} from '@/features/results/resultsGrid'

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

    it('marca selected na célula que corresponde à data selecionada', () => {
        const weeks = buildWeeklyCompletionGrid('2026-09-28', '2026-09-30', new Set(), '2026-09-29')

        expect(weeks[0].days[0].selected).toBe(false)
        expect(weeks[0].days[1].selected).toBe(true)
        expect(weeks[0].days[2].selected).toBe(false)
    })

    it('nenhuma célula fica selected quando nenhuma data selecionada é passada', () => {
        const weeks = buildWeeklyCompletionGrid('2026-09-28', '2026-09-30', new Set())

        expect(weeks[0].days.some((day) => day.selected)).toBe(false)
    })

    it('expande a grade pra trás quando a data selecionada é anterior ao início calculado', () => {
        const weeks = buildWeeklyCompletionGrid('2026-09-28', '2026-09-30', new Set(), '2026-09-20')
        const allDays = weeks.flatMap((week) => week.days)
        const selectedCell = allDays.find((day) => day.date === '2026-09-20')

        expect(selectedCell).toBeDefined()
        expect(selectedCell?.selected).toBe(true)
        expect(selectedCell?.inRange).toBe(false)
    })

    it('expande a grade pra frente quando a data selecionada é posterior ao fim calculado', () => {
        const weeks = buildWeeklyCompletionGrid('2026-09-28', '2026-09-30', new Set(), '2026-10-10')
        const allDays = weeks.flatMap((week) => week.days)
        const selectedCell = allDays.find((day) => day.date === '2026-10-10')

        expect(selectedCell).toBeDefined()
        expect(selectedCell?.selected).toBe(true)
        expect(selectedCell?.inRange).toBe(false)
    })
})

describe('expandRangeToIncludeDate', () => {
    it('expande o início do intervalo quando a data selecionada é anterior a ele', () => {
        const range = expandRangeToIncludeDate({ rangeStart: '2026-09-10', rangeEnd: '2026-09-28' }, '2026-09-01')

        expect(range).toEqual({ rangeStart: '2026-09-01', rangeEnd: '2026-09-28' })
    })

    it('expande o fim do intervalo quando a data selecionada é posterior a ele', () => {
        const range = expandRangeToIncludeDate({ rangeStart: '2026-09-10', rangeEnd: '2026-09-28' }, '2026-10-05')

        expect(range).toEqual({ rangeStart: '2026-09-10', rangeEnd: '2026-10-05' })
    })

    it('mantém o intervalo original quando a data selecionada já está dentro dele', () => {
        const range = expandRangeToIncludeDate({ rangeStart: '2026-09-10', rangeEnd: '2026-09-28' }, '2026-09-20')

        expect(range).toEqual({ rangeStart: '2026-09-10', rangeEnd: '2026-09-28' })
    })
})

describe('selectVisibleWeeks', () => {
    // 10 semanas, de segunda 2026-07-27 até domingo 2026-10-04.
    const tenWeeks = buildWeeklyCompletionGrid('2026-07-27', '2026-10-04', new Set())

    it('mostra todas as semanas quando há menos que o teto', () => {
        const weeks = buildWeeklyCompletionGrid('2026-09-14', '2026-10-04', new Set())

        const result = selectVisibleWeeks(weeks, '2026-09-28', 6)

        expect(result.visible).toHaveLength(3)
        expect(result.hiddenCount).toBe(0)
    })

    it('mostra as últimas semanas quando a data selecionada já está dentro da janela', () => {
        const result = selectVisibleWeeks(tenWeeks, '2026-09-30', 6)

        expect(result.visible.map((week) => week.weekStart)).toEqual([
            '2026-08-24',
            '2026-08-31',
            '2026-09-07',
            '2026-09-14',
            '2026-09-21',
            '2026-09-28',
        ])
        expect(result.hiddenCount).toBe(4)
    })

    it('começa a janela na semana da data selecionada quando ela é antiga', () => {
        const result = selectVisibleWeeks(tenWeeks, '2026-08-05', 6)

        expect(result.visible).toHaveLength(6)
        expect(result.visible[0].weekStart).toBe('2026-08-03')
        expect(result.visible[5].weekStart).toBe('2026-09-07')
        expect(result.hiddenCount).toBe(4)
    })

    it('não passa do fim da grade quando a semana selecionada está perto do fim', () => {
        const result = selectVisibleWeeks(tenWeeks, '2026-08-26', 6)

        expect(result.visible[0].weekStart).toBe('2026-08-24')
        expect(result.visible[5].weekStart).toBe('2026-09-28')
    })

    it('conta como ocultas todas as semanas fora da janela', () => {
        const result = selectVisibleWeeks(tenWeeks, '2026-10-01', 3)

        expect(result.visible).toHaveLength(3)
        expect(result.hiddenCount).toBe(7)
    })
})
