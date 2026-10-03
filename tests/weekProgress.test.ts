import { describe, expect, it } from 'vitest'

import type {
    RoutineData,
    RoutineDayEntryRow,
    RoutineItemRow,
    RoutineItemScheduleRow,
    RoutineTaskRow,
} from '@/features/routine/types'
import { buildWeekProgress, weekDatesOf } from '@/features/routine/weekProgress'
import type { DaySignals } from '@/features/shared/deriveDaySignals'

// Semana de domingo 2026-09-27 a sábado 2026-10-03.
const WEEK = weekDatesOf('2026-09-30')
const ALL_DAYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']

function buildItem(overrides: Partial<RoutineItemRow> = {}): RoutineItemRow {
    const baseItem: RoutineItemRow = {
        id: 'item-1',
        user_id: 'user-1',
        title: 'Academia',
        link_kind: null,
        category_id: null,
        is_important: false,
        repeat_kind: 'weekdays',
        weekdays: ALL_DAYS,
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

function buildSchedule(overrides: Partial<RoutineItemScheduleRow> = {}): RoutineItemScheduleRow {
    const baseSchedule: RoutineItemScheduleRow = {
        id: 'schedule-1',
        user_id: 'user-1',
        routine_item_id: 'item-1',
        effective_from: '2026-01-01',
        repeat_kind: 'weekdays',
        weekdays: ALL_DAYS,
        interval_days: null,
        interval_anchor: null,
        created_at: '2026-01-01T00:00:00.000Z',
    }
    return { ...baseSchedule, ...overrides }
}

function buildEntry(entryDate: string, overrides: Partial<RoutineDayEntryRow> = {}): RoutineDayEntryRow {
    const baseEntry: RoutineDayEntryRow = {
        id: `entry-${entryDate}`,
        user_id: 'user-1',
        routine_item_id: 'item-1',
        entry_date: entryDate,
        completed_at: `${entryDate}T12:00:00.000Z`,
        created_at: `${entryDate}T12:00:00.000Z`,
    }
    return { ...baseEntry, ...overrides }
}

function buildTask(overrides: Partial<RoutineTaskRow> = {}): RoutineTaskRow {
    const baseTask: RoutineTaskRow = {
        id: 'task-1',
        user_id: 'user-1',
        title: 'Pagar boleto',
        scheduled_on: '2026-09-29',
        carried_from_on: null,
        category_id: null,
        is_important: false,
        completed_on: null,
        completed_at: null,
        sort_order: 0,
        created_at: '2026-09-28T08:00:00.000Z',
        updated_at: '2026-09-28T08:00:00.000Z',
    }
    return { ...baseTask, ...overrides }
}

function buildData(overrides: Partial<RoutineData> = {}): RoutineData {
    const baseData: RoutineData = { items: [buildItem()], schedules: [], entries: [], tasks: [] }
    return { ...baseData, ...overrides }
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

describe('weekDatesOf', () => {
    it('lista de domingo a sábado a partir de qualquer dia da semana', () => {
        expect(weekDatesOf('2026-09-30')).toEqual([
            '2026-09-27',
            '2026-09-28',
            '2026-09-29',
            '2026-09-30',
            '2026-10-01',
            '2026-10-02',
            '2026-10-03',
        ])
        expect(weekDatesOf('2026-09-27')[0]).toBe('2026-09-27')
        expect(weekDatesOf('2026-10-03')[0]).toBe('2026-09-27')
    })
})

describe('buildWeekProgress', () => {
    it('conta cada dia passado ou de hoje com a mesma regra do dia', () => {
        const data = buildData({ entries: [buildEntry('2026-09-28'), buildEntry('2026-09-29')] })

        const week = buildWeekProgress(WEEK, data, new Map(), '2026-09-30')

        expect(week[1]).toMatchObject({ date: '2026-09-28', status: 'counted', done: 1, total: 1 })
        expect(week[2]).toMatchObject({ status: 'counted', done: 1, total: 1 })
        expect(week[3]).toMatchObject({ date: '2026-09-30', status: 'counted', done: 0, total: 1 })
    })

    it('deixa dias futuros apagados e sem número', () => {
        const week = buildWeekProgress(WEEK, buildData(), new Map(), '2026-09-29')

        expect(week[3]).toEqual({ date: '2026-09-30', status: 'future', done: 0, total: 0 })
        expect(week[6].status).toBe('future')
    })

    it('deixa dias antes do primeiro início de item apagados', () => {
        const data = buildData({ items: [buildItem({ active_from: '2026-09-29' })] })

        const week = buildWeekProgress(WEEK, data, new Map(), '2026-10-03')

        expect(week[0].status).toBe('before_start')
        expect(week[1].status).toBe('before_start')
        expect(week[2]).toMatchObject({ status: 'counted', total: 1 })
    })

    it('usa o início do item mais antigo como limite', () => {
        const data = buildData({
            items: [
                buildItem({ id: 'item-1', active_from: '2026-09-30' }),
                buildItem({ id: 'item-2', active_from: '2026-09-28' }),
            ],
        })

        const week = buildWeekProgress(WEEK, data, new Map(), '2026-10-03')

        expect(week[0].status).toBe('before_start')
        expect(week[1]).toMatchObject({ status: 'counted', total: 1 })
    })

    it('deixa apagado o dia em que nada era esperado', () => {
        const data = buildData({ items: [buildItem({ weekdays: ['segunda'] })] })

        const week = buildWeekProgress(WEEK, data, new Map(), '2026-10-03')

        expect(week[1]).toMatchObject({ status: 'counted', total: 1 })
        expect(week[2]).toEqual({ date: '2026-09-29', status: 'empty', done: 0, total: 0 })
    })

    it('respeita a agenda que valia em cada dia quando ela mudou no meio da semana', () => {
        const data = buildData({
            items: [buildItem({ weekdays: ['quarta', 'quinta'] })],
            schedules: [
                buildSchedule({ id: 'schedule-1', effective_from: '2026-01-01', weekdays: ['segunda', 'terca'] }),
                buildSchedule({ id: 'schedule-2', effective_from: '2026-09-30', weekdays: ['quarta', 'quinta'] }),
            ],
        })

        const week = buildWeekProgress(WEEK, data, new Map(), '2026-10-03')

        expect(week.map((day) => day.total)).toEqual([0, 1, 1, 1, 1, 0, 0])
        expect(week[1].status).toBe('counted')
        expect(week[5].status).toBe('empty')
    })

    it('conta a tarefa concluída no dia dela', () => {
        const data = buildData({
            items: [],
            tasks: [
                buildTask({ id: 'task-1', completed_at: '2026-09-29T10:00:00.000Z' }),
                buildTask({ id: 'task-2' }),
            ],
        })

        const week = buildWeekProgress(WEEK, data, new Map(), '2026-10-03')

        expect(week[2]).toMatchObject({ status: 'counted', done: 1, total: 2 })
    })

    it('conta o item vinculado satisfeito pelo sinal do dia', () => {
        const data = buildData({ items: [buildItem({ link_kind: 'workout_finished' })] })
        const signalsByDate = new Map([['2026-09-28', buildSignals({ workout: 'finished' })]])

        const week = buildWeekProgress(WEEK, data, signalsByDate, '2026-09-29')

        expect(week[1]).toMatchObject({ status: 'counted', done: 1, total: 1 })
        expect(week[2]).toMatchObject({ status: 'counted', done: 0, total: 1 })
    })

    it('trata dia sem sinal calculado como sem registros', () => {
        const data = buildData({ items: [buildItem({ link_kind: 'sleep' })] })

        const week = buildWeekProgress(WEEK, data, new Map(), '2026-09-28')

        expect(week[1]).toMatchObject({ status: 'counted', done: 0, total: 1 })
    })

    it('um dia fraco não afeta os outros dias', () => {
        const data = buildData({ entries: [buildEntry('2026-09-28'), buildEntry('2026-09-30')] })

        const week = buildWeekProgress(WEEK, data, new Map(), '2026-09-30')

        expect(week.slice(1, 4).map((day) => day.done)).toEqual([1, 0, 1])
    })
})
