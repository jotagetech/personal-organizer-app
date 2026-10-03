import { describe, expect, it } from 'vitest'

import {
    ROUTINE_DAY_CARD_MAX_PENDING,
    buildRoutineDayCardModel,
    pickRoutineDayCardPending,
} from '@/features/routine/routineDayCardRows'
import type { RoutineData, RoutineItemRow, RoutineRow } from '@/features/routine/types'
import type { DaySignals } from '@/features/shared/daySignals'

const REFERENCE_DATE = '2026-09-28'

function buildRow(overrides: Partial<RoutineRow> = {}): RoutineRow {
    const baseRow: RoutineRow = {
        id: 'row-1',
        title: 'Beber água',
        source: 'manual',
        state: 'pending',
        linkKind: null,
        routineItemId: 'item-1',
        dayEntryId: null,
        taskId: null,
        categoryId: null,
        isImportant: false,
        carriedFromDate: null,
        movedToDate: null,
    }
    return { ...baseRow, ...overrides }
}

function buildItem(overrides: Partial<RoutineItemRow> = {}): RoutineItemRow {
    const baseItem: RoutineItemRow = {
        id: 'item-1',
        user_id: 'user-1',
        title: 'Academia',
        link_kind: 'workout_finished',
        category_id: null,
        is_important: false,
        repeat_kind: 'weekdays',
        weekdays: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
        interval_days: null,
        interval_anchor: null,
        active_from: '2026-01-01',
        archived_on: null,
        sort_order: 0,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
    }
    return { ...baseItem, ...overrides }
}

function buildSignals(overrides: Partial<DaySignals> = {}): DaySignals {
    const baseSignals: DaySignals = {
        workout: 'none',
        mealsLogged: new Set(),
        foodEntryCount: 0,
        bodyWeightLogged: false,
        sleepLogged: false,
        cardioCount: 0,
    }
    return { ...baseSignals, ...overrides }
}

describe('pickRoutineDayCardPending', () => {
    it('põe os importantes antes, mantendo a ordem da rotina em cada grupo', () => {
        const rows = [
            buildRow({ id: 'a' }),
            buildRow({ id: 'b', isImportant: true }),
            buildRow({ id: 'c' }),
            buildRow({ id: 'd', isImportant: true }),
        ]

        expect(pickRoutineDayCardPending(rows).map((row) => row.id)).toEqual(['b', 'd', 'a', 'c'])
    })

    it('limita a lista ao máximo do card', () => {
        const rows = Array.from({ length: 8 }, (_, index) => buildRow({ id: `row-${index}` }))

        expect(pickRoutineDayCardPending(rows)).toHaveLength(ROUTINE_DAY_CARD_MAX_PENDING)
    })

    it('ignora o que já está feito ou foi levado para outro dia', () => {
        const rows = [
            buildRow({ id: 'done', state: 'done' }),
            buildRow({ id: 'override', state: 'done_manual_override' }),
            buildRow({ id: 'moved', state: 'moved' }),
            buildRow({ id: 'open' }),
        ]

        expect(pickRoutineDayCardPending(rows).map((row) => row.id)).toEqual(['open'])
    })
})

describe('buildRoutineDayCardModel', () => {
    const data: RoutineData = { items: [buildItem()], schedules: [], entries: [], tasks: [] }

    it('força o treino como finalizado mesmo que o banco ainda diga o contrário', () => {
        const model = buildRoutineDayCardModel(REFERENCE_DATE, data, buildSignals({ workout: 'in_progress' }))

        expect(model.hasWorkoutItem).toBe(true)
        expect(model.pending).toEqual([])
        expect(model.progress).toEqual({ done: 1, total: 1 })
    })

    it('mantém pendentes os itens que o treino não resolve', () => {
        const mealItem = buildItem({ id: 'item-2', title: 'Almoço', link_kind: 'meal:almoco', sort_order: 1 })
        const model = buildRoutineDayCardModel(
            REFERENCE_DATE,
            { ...data, items: [buildItem(), mealItem] },
            buildSignals(),
        )

        expect(model.pending.map((row) => row.title)).toEqual(['Almoço'])
        expect(model.progress).toEqual({ done: 1, total: 2 })
    })

    it('sem item da academia, não marca hasWorkoutItem', () => {
        const model = buildRoutineDayCardModel(
            REFERENCE_DATE,
            { ...data, items: [buildItem({ link_kind: null, title: 'Alongar' })] },
            buildSignals(),
        )

        expect(model.hasWorkoutItem).toBe(false)
        expect(model.pending).toHaveLength(1)
    })
})
