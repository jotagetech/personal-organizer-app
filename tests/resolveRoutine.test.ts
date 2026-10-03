import { describe, expect, it } from 'vitest'

import {
    countRoutineProgress,
    deriveRoutineEmptyState,
    shouldShowRoutineOnboarding,
    listUndatedTasks,
    resolveRoutineForDate,
} from '@/features/routine/resolveRoutine'
import type {
    RoutineData,
    RoutineDayEntryRow,
    RoutineItemRow,
    RoutineItemScheduleRow,
    RoutineTaskRow,
} from '@/features/routine/types'
import type { DaySignals } from '@/features/shared/daySignals'

const REFERENCE_DATE = '2026-09-28' // segunda-feira

function buildItem(overrides: Partial<RoutineItemRow> = {}): RoutineItemRow {
    const baseItem: RoutineItemRow = {
        id: 'item-1',
        user_id: 'user-1',
        title: 'Academia',
        link_kind: null,
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

function buildSchedule(overrides: Partial<RoutineItemScheduleRow> = {}): RoutineItemScheduleRow {
    const baseSchedule: RoutineItemScheduleRow = {
        id: 'schedule-1',
        user_id: 'user-1',
        routine_item_id: 'item-1',
        effective_from: '2026-01-01',
        repeat_kind: 'weekdays',
        weekdays: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
        interval_days: null,
        interval_anchor: null,
        created_at: '2026-01-01T00:00:00.000Z',
    }
    return { ...baseSchedule, ...overrides }
}

function buildEntry(overrides: Partial<RoutineDayEntryRow> = {}): RoutineDayEntryRow {
    const baseEntry: RoutineDayEntryRow = {
        id: 'entry-1',
        user_id: 'user-1',
        routine_item_id: 'item-1',
        entry_date: REFERENCE_DATE,
        completed_at: '2026-09-28T12:00:00.000Z',
        created_at: '2026-09-28T12:00:00.000Z',
    }
    return { ...baseEntry, ...overrides }
}

function buildTask(overrides: Partial<RoutineTaskRow> = {}): RoutineTaskRow {
    const baseTask: RoutineTaskRow = {
        id: 'task-1',
        user_id: 'user-1',
        title: 'Pagar boleto',
        scheduled_on: REFERENCE_DATE,
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
    const baseData: RoutineData = { items: [], schedules: [], entries: [], tasks: [] }
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

function resolveTitlesOn(date: string, data: RoutineData): string[] {
    return resolveRoutineForDate(date, data, buildSignals()).map((row) => row.title)
}

describe('resolveRoutineForDate: itens que repetem', () => {
    it('não mostra um item fora do dia da semana configurado', () => {
        const item = buildItem({ weekdays: ['sabado', 'domingo'] })

        const rows = resolveRoutineForDate(REFERENCE_DATE, buildData({ items: [item] }), buildSignals())

        expect(rows).toHaveLength(0)
    })

    it('não mostra um item com active_from no futuro', () => {
        const item = buildItem({ active_from: '2026-10-01' })

        const rows = resolveRoutineForDate(REFERENCE_DATE, buildData({ items: [item] }), buildSignals())

        expect(rows).toHaveLength(0)
    })

    it('não mostra um item arquivado a partir da própria data de arquivamento', () => {
        const item = buildItem({ archived_on: REFERENCE_DATE })

        const rows = resolveRoutineForDate(REFERENCE_DATE, buildData({ items: [item] }), buildSignals())

        expect(rows).toHaveLength(0)
    })

    it('ainda mostra um item no dia anterior ao de arquivamento', () => {
        const item = buildItem({ archived_on: '2026-09-29' })

        const rows = resolveRoutineForDate(REFERENCE_DATE, buildData({ items: [item] }), buildSignals())

        expect(rows).toHaveLength(1)
    })

    it('leva categoria e importância do item para a linha', () => {
        const item = buildItem({ category_id: 'cat-1', is_important: true })

        const rows = resolveRoutineForDate(REFERENCE_DATE, buildData({ items: [item] }), buildSignals())

        expect(rows[0]).toMatchObject({ categoryId: 'cat-1', isImportant: true, taskId: null })
    })

    it('marca um item vinculado como concluído só pelo sinal, sem marcação manual', () => {
        const item = buildItem({ link_kind: 'workout_finished' })
        const signals = buildSignals({ workout: 'finished' })

        const rows = resolveRoutineForDate(REFERENCE_DATE, buildData({ items: [item] }), signals)

        expect(rows[0].state).toBe('done')
        expect(rows[0].dayEntryId).toBeNull()
    })

    it('marca um item vinculado ainda não satisfeito pelo sinal como done_manual_override quando há marcação', () => {
        const item = buildItem({ id: 'item-1', link_kind: 'meal:lanche' })
        const manualEntry = buildEntry({ id: 'entry-1', routine_item_id: 'item-1' })

        const rows = resolveRoutineForDate(
            REFERENCE_DATE,
            buildData({ items: [item], entries: [manualEntry] }),
            buildSignals(),
        )

        expect(rows[0].state).toBe('done_manual_override')
        expect(rows[0].dayEntryId).toBe('entry-1')
    })

    it('ignora marcação de outro dia', () => {
        const item = buildItem({ id: 'item-1' })
        const otherDayEntry = buildEntry({ routine_item_id: 'item-1', entry_date: '2026-09-27' })

        const rows = resolveRoutineForDate(
            REFERENCE_DATE,
            buildData({ items: [item], entries: [otherDayEntry] }),
            buildSignals(),
        )

        expect(rows[0]).toMatchObject({ source: 'manual', state: 'pending', dayEntryId: null })
    })

    it('ordena itens por sort_order antes das tarefas do dia', () => {
        const secondItem = buildItem({ id: 'item-2', title: 'Café da manhã', sort_order: 1 })
        const firstItem = buildItem({ id: 'item-1', title: 'Academia', sort_order: 0 })
        const task = buildTask({ title: 'Tarefa do dia' })

        const titles = resolveTitlesOn(REFERENCE_DATE, buildData({ items: [secondItem, firstItem], tasks: [task] }))

        expect(titles).toEqual(['Academia', 'Café da manhã', 'Tarefa do dia'])
    })
})

describe('resolveRoutineForDate: agenda versionada', () => {
    // A linha do item já traz a agenda nova (só terça); a versão antiga (só
    // segunda) valia até a véspera da nova vigência.
    const editedItem = buildItem({ weekdays: ['terca'] })
    const schedules = [
        buildSchedule({ id: 'v1', effective_from: '2026-01-01', weekdays: ['segunda'] }),
        buildSchedule({ id: 'v2', effective_from: '2026-09-29', weekdays: ['terca'] }),
    ]
    const data = buildData({ items: [editedItem], schedules })

    it('dias antes da nova vigência usam a agenda antiga', () => {
        expect(resolveTitlesOn('2026-09-21', data)).toEqual(['Academia'])
        expect(resolveTitlesOn('2026-09-28', data)).toEqual(['Academia'])
        expect(resolveTitlesOn('2026-09-22', data)).toEqual([])
    })

    it('a partir da nova vigência vale a agenda nova', () => {
        expect(resolveTitlesOn('2026-09-29', data)).toEqual(['Academia'])
        expect(resolveTitlesOn('2026-10-06', data)).toEqual(['Academia'])
        expect(resolveTitlesOn('2026-10-05', data)).toEqual([])
    })

    it('sem nenhuma versão até a data, usa a agenda da própria linha do item', () => {
        const itemWithoutSchedules = buildItem({ weekdays: ['segunda'] })

        expect(resolveTitlesOn(REFERENCE_DATE, buildData({ items: [itemWithoutSchedules] }))).toEqual(['Academia'])
    })

    it('versões de outro item não interferem', () => {
        const otherItemSchedule = buildSchedule({ routine_item_id: 'item-2', weekdays: ['domingo'] })
        const item = buildItem({ weekdays: ['segunda'] })

        expect(resolveTitlesOn(REFERENCE_DATE, buildData({ items: [item], schedules: [otherItemSchedule] }))).toEqual([
            'Academia',
        ])
    })
})

describe('resolveRoutineForDate: intervalo de N dias', () => {
    const intervalItem = buildItem({
        title: 'Regar plantas',
        repeat_kind: 'interval',
        weekdays: null,
        interval_days: 3,
        interval_anchor: '2026-09-28',
    })
    const data = buildData({ items: [intervalItem] })

    it('aplica na âncora e nos múltiplos do intervalo', () => {
        expect(resolveTitlesOn('2026-09-28', data)).toEqual(['Regar plantas'])
        expect(resolveTitlesOn('2026-10-01', data)).toEqual(['Regar plantas'])
        expect(resolveTitlesOn('2026-10-04', data)).toEqual(['Regar plantas'])
    })

    it('não aplica entre os múltiplos', () => {
        expect(resolveTitlesOn('2026-09-29', data)).toEqual([])
        expect(resolveTitlesOn('2026-09-30', data)).toEqual([])
    })

    it('não aplica antes da âncora, nem num múltiplo para trás', () => {
        expect(resolveTitlesOn('2026-09-25', data)).toEqual([])
        expect(resolveTitlesOn('2026-09-22', data)).toEqual([])
    })

    it('intervalo de 1 dia aplica todo dia a partir da âncora', () => {
        const dailyItem = buildItem({
            repeat_kind: 'interval',
            weekdays: null,
            interval_days: 1,
            interval_anchor: '2026-09-28',
        })

        expect(resolveTitlesOn('2026-09-29', buildData({ items: [dailyItem] }))).toEqual(['Academia'])
        expect(resolveTitlesOn('2026-09-27', buildData({ items: [dailyItem] }))).toEqual([])
    })
})

describe('resolveRoutineForDate: tarefas', () => {
    it('mostra a tarefa só no scheduled_on', () => {
        const task = buildTask()

        expect(resolveTitlesOn(REFERENCE_DATE, buildData({ tasks: [task] }))).toEqual(['Pagar boleto'])
        expect(resolveTitlesOn('2026-09-29', buildData({ tasks: [task] }))).toEqual([])
        expect(resolveTitlesOn('2026-09-27', buildData({ tasks: [task] }))).toEqual([])
    })

    it('deixa a tarefa sem data fora da lista do dia', () => {
        const undatedTask = buildTask({ id: 'task-undated', title: 'Algum dia', scheduled_on: null })

        expect(resolveTitlesOn(REFERENCE_DATE, buildData({ tasks: [undatedTask] }))).toEqual([])
    })

    it('tarefa concluída conta como feita', () => {
        const doneTask = buildTask({ completed_on: REFERENCE_DATE, completed_at: '2026-09-28T15:00:00.000Z' })

        const rows = resolveRoutineForDate(REFERENCE_DATE, buildData({ tasks: [doneTask] }), buildSignals())

        expect(rows[0]).toMatchObject({ source: 'task', state: 'done', taskId: 'task-1', routineItemId: null })
    })

    it('tarefa trazida de outro dia leva o dia de origem', () => {
        const carriedTask = buildTask({ carried_from_on: '2026-09-25' })

        const rows = resolveRoutineForDate(REFERENCE_DATE, buildData({ tasks: [carriedTask] }), buildSignals())

        expect(rows[0].carriedFromDate).toBe('2026-09-25')
    })

    it('tarefa levada para outro dia aparece apagada no dia de origem e não conta', () => {
        const movedTask = buildTask({ scheduled_on: '2026-09-30', carried_from_on: REFERENCE_DATE })
        const data = buildData({ tasks: [movedTask, buildTask({ id: 'task-2', title: 'Outra', sort_order: 1 })] })

        const rows = resolveRoutineForDate(REFERENCE_DATE, data, buildSignals())

        expect(rows.map((row) => [row.title, row.state])).toEqual([
            ['Outra', 'pending'],
            ['Pagar boleto', 'moved'],
        ])
        expect(rows[1]).toMatchObject({ movedToDate: '2026-09-30', carriedFromDate: null })
        expect(countRoutineProgress(rows)).toEqual({ done: 0, total: 1 })
    })

    it('tarefa levada conta no dia para onde foi, com a origem na linha', () => {
        const movedTask = buildTask({ scheduled_on: '2026-09-30', carried_from_on: REFERENCE_DATE })

        const rows = resolveRoutineForDate('2026-09-30', buildData({ tasks: [movedTask] }), buildSignals())

        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ state: 'pending', carriedFromDate: REFERENCE_DATE, movedToDate: null })
        expect(countRoutineProgress(rows)).toEqual({ done: 0, total: 1 })
    })

    it('tarefa levada duas vezes não aparece no primeiro dia de origem', () => {
        const movedTwice = buildTask({ scheduled_on: '2026-10-01', carried_from_on: '2026-09-30' })

        expect(resolveTitlesOn(REFERENCE_DATE, buildData({ tasks: [movedTwice] }))).toEqual([])
        expect(resolveTitlesOn('2026-09-30', buildData({ tasks: [movedTwice] }))).toEqual(['Pagar boleto'])
    })

    it('ordena tarefas por sort_order e depois pela criação', () => {
        const later = buildTask({ id: 't-2', title: 'Segunda', sort_order: 1 })
        const earlier = buildTask({ id: 't-1', title: 'Primeira', sort_order: 0 })

        expect(resolveTitlesOn(REFERENCE_DATE, buildData({ tasks: [later, earlier] }))).toEqual(['Primeira', 'Segunda'])
    })
})

describe('listUndatedTasks', () => {
    it('lista só as tarefas sem data, em ordem', () => {
        const datedTask = buildTask({ id: 'dated' })
        const secondUndated = buildTask({ id: 'u-2', title: 'Depois', scheduled_on: null, sort_order: 1 })
        const firstUndated = buildTask({ id: 'u-1', title: 'Antes', scheduled_on: null, sort_order: 0 })

        const undatedTasks = listUndatedTasks([datedTask, secondUndated, firstUndated])

        expect(undatedTasks.map((task) => task.id)).toEqual(['u-1', 'u-2'])
    })
})

describe('countRoutineProgress', () => {
    it('conta vínculos satisfeitos, marcações e tarefas concluídas', () => {
        const linkedBySignal = buildItem({ id: 'linked', link_kind: 'workout_finished', sort_order: 0 })
        const linkedPending = buildItem({ id: 'linked-pending', link_kind: 'sleep', sort_order: 1 })
        const manualMarked = buildItem({ id: 'manual-marked', sort_order: 2 })
        const manualPending = buildItem({ id: 'manual-pending', sort_order: 3 })
        const data = buildData({
            items: [linkedBySignal, linkedPending, manualMarked, manualPending],
            entries: [buildEntry({ id: 'e-1', routine_item_id: 'manual-marked' })],
            tasks: [
                buildTask({ id: 'task-done', completed_on: REFERENCE_DATE, completed_at: '2026-09-28T15:00:00.000Z' }),
                buildTask({ id: 'task-pending' }),
                buildTask({ id: 'task-undated', scheduled_on: null }),
            ],
        })

        const rows = resolveRoutineForDate(REFERENCE_DATE, data, buildSignals({ workout: 'finished' }))

        expect(countRoutineProgress(rows)).toEqual({ done: 3, total: 6 })
    })

    it('marcação manual sobre vínculo pendente conta como feita', () => {
        const linkedItem = buildItem({ id: 'item-1', link_kind: 'meal:almoco' })
        const data = buildData({ items: [linkedItem], entries: [buildEntry({ routine_item_id: 'item-1' })] })

        const rows = resolveRoutineForDate(REFERENCE_DATE, data, buildSignals())

        expect(countRoutineProgress(rows)).toEqual({ done: 1, total: 1 })
    })

    it('dia vazio é zero de zero', () => {
        expect(countRoutineProgress([])).toEqual({ done: 0, total: 0 })
    })
})

describe('deriveRoutineEmptyState', () => {
    it('indica que não há itens quando a lista está vazia', () => {
        expect(deriveRoutineEmptyState([], [])).toBe('no_items')
    })

    it('indica que não há itens quando todos estão arquivados', () => {
        const items = [buildItem({ archived_on: REFERENCE_DATE })]

        expect(deriveRoutineEmptyState(items, [])).toBe('no_items')
    })

    it('indica que não há itens mesmo com tarefa no dia, se não há item ativo', () => {
        const items = [buildItem({ archived_on: REFERENCE_DATE })]
        const rows = resolveRoutineForDate(REFERENCE_DATE, buildData({ items, tasks: [buildTask()] }), buildSignals())

        expect(deriveRoutineEmptyState(items, rows)).toBe('no_items')
        expect(rows).toHaveLength(1)
    })

    it('mostra "nada pra este dia" quando há item ativo mas nenhum se aplica hoje', () => {
        const items = [buildItem({ active_from: '2026-10-01' })]

        expect(deriveRoutineEmptyState(items, [])).toBe('nothing_for_day')
    })

    it('não mostra nenhum estado vazio quando há linhas pra este dia', () => {
        const items = [buildItem()]
        const rows = resolveRoutineForDate(REFERENCE_DATE, buildData({ items }), buildSignals())

        expect(deriveRoutineEmptyState(items, rows)).toBe('none')
    })
})

describe('shouldShowRoutineOnboarding', () => {
    it('mostra a primeira vez sem nenhum item ativo', () => {
        expect(shouldShowRoutineOnboarding([], false)).toBe(true)
        expect(shouldShowRoutineOnboarding([buildItem({ archived_on: '2026-10-01' })], false)).toBe(true)
    })

    it('esconde com algum item ativo', () => {
        expect(shouldShowRoutineOnboarding([buildItem()], false)).toBe(false)
    })

    it('esconde depois de pular nesta sessão', () => {
        expect(shouldShowRoutineOnboarding([], true)).toBe(false)
    })
})
