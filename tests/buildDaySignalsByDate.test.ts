import { describe, expect, it } from 'vitest'

import { buildDaySignalsByDate, type DaySignalsRangeSources } from '@/features/shared/buildDaySignalsByDate'

const EMPTY_SOURCES: DaySignalsRangeSources = {
    sessions: [],
    foodEntries: [],
    bodyWeightEntries: [],
    sleepEntries: [],
}

describe('buildDaySignalsByDate', () => {
    it('cria uma entrada vazia para toda data pedida, mesmo sem registro', () => {
        const signalsByDate = buildDaySignalsByDate(['2026-09-28', '2026-09-29'], EMPTY_SOURCES)

        expect([...signalsByDate.keys()]).toEqual(['2026-09-28', '2026-09-29'])
        expect(signalsByDate.get('2026-09-28')).toEqual({
            workout: 'none',
            mealsLogged: new Set(),
            foodEntryCount: 0,
            bodyWeightLogged: false,
            sleepLogged: false,
            cardioCount: 0,
        })
    })

    it('separa os registros por data', () => {
        const signalsByDate = buildDaySignalsByDate(['2026-09-28', '2026-09-29'], {
            sessions: [{ session_date: '2026-09-28', finished_at: '2026-09-28T20:00:00.000Z' }],
            foodEntries: [
                { entry_date: '2026-09-28', meal_category: 'almoco' },
                { entry_date: '2026-09-28', meal_category: 'almoco' },
                { entry_date: '2026-09-29', meal_category: 'jantar' },
            ],
            bodyWeightEntries: [{ entry_date: '2026-09-29' }],
            sleepEntries: [{ entry_date: '2026-09-28' }],
        })

        const monday = signalsByDate.get('2026-09-28')
        const tuesday = signalsByDate.get('2026-09-29')
        expect(monday?.workout).toBe('finished')
        expect(monday?.mealsLogged).toEqual(new Set(['almoco']))
        expect(monday?.foodEntryCount).toBe(2)
        expect(monday?.sleepLogged).toBe(true)
        expect(monday?.bodyWeightLogged).toBe(false)
        expect(tuesday?.workout).toBe('none')
        expect(tuesday?.mealsLogged).toEqual(new Set(['jantar']))
        expect(tuesday?.bodyWeightLogged).toBe(true)
        expect(tuesday?.sleepLogged).toBe(false)
    })

    it('marca treino sem término como em andamento', () => {
        const signalsByDate = buildDaySignalsByDate(['2026-09-28'], {
            ...EMPTY_SOURCES,
            sessions: [{ session_date: '2026-09-28', finished_at: null }],
        })

        expect(signalsByDate.get('2026-09-28')?.workout).toBe('in_progress')
    })

    it('ignora registros de datas fora do pedido', () => {
        const signalsByDate = buildDaySignalsByDate(['2026-09-28'], {
            ...EMPTY_SOURCES,
            foodEntries: [{ entry_date: '2026-10-05', meal_category: 'lanche' }],
        })

        expect(signalsByDate.size).toBe(1)
        expect(signalsByDate.get('2026-09-28')?.foodEntryCount).toBe(0)
    })
})
