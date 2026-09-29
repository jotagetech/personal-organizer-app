import { describe, expect, it } from 'vitest'

import {
    deriveDeadline,
    deriveRoutineEmptyState,
    isAdhocVisibleOnDate,
    resolveRoutineForDate,
} from '@/features/routine/resolveRoutine'
import type { RoutineDayEntryRow, RoutineItemRow } from '@/features/routine/types'
import type { DaySignals } from '@/features/shared/daySignals'

const REFERENCE_DATE = '2026-09-28' // segunda-feira

function buildItem(overrides: Partial<RoutineItemRow> = {}): RoutineItemRow {
    const baseItem: RoutineItemRow = {
        id: 'item-1',
        user_id: 'user-1',
        title: 'Academia',
        weekdays: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
        link_kind: null,
        sort_order: 0,
        active_from: '2026-01-01',
        archived_on: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
    }
    return { ...baseItem, ...overrides }
}

function buildEntry(overrides: Partial<RoutineDayEntryRow> = {}): RoutineDayEntryRow {
    const baseEntry: RoutineDayEntryRow = {
        id: 'entry-1',
        user_id: 'user-1',
        entry_date: REFERENCE_DATE,
        routine_item_id: null,
        title: null,
        completed_at: null,
        due_date: null,
        completed_on: null,
        sort_order: 0,
        created_at: '2026-09-28T00:00:00.000Z',
        updated_at: '2026-09-28T00:00:00.000Z',
    }
    return { ...baseEntry, ...overrides }
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

describe('resolveRoutineForDate', () => {
    it('não mostra um template fora do dia da semana configurado', () => {
        const item = buildItem({ weekdays: ['sabado', 'domingo'] })

        const rows = resolveRoutineForDate(REFERENCE_DATE, [item], [], buildSignals())

        expect(rows).toHaveLength(0)
    })

    it('não mostra um template com active_from no futuro', () => {
        const item = buildItem({ active_from: '2026-10-01' })

        const rows = resolveRoutineForDate(REFERENCE_DATE, [item], [], buildSignals())

        expect(rows).toHaveLength(0)
    })

    it('não mostra um template arquivado a partir da própria data de arquivamento', () => {
        const item = buildItem({ archived_on: REFERENCE_DATE })

        const rows = resolveRoutineForDate(REFERENCE_DATE, [item], [], buildSignals())

        expect(rows).toHaveLength(0)
    })

    it('ainda mostra um template no dia anterior ao de arquivamento', () => {
        const item = buildItem({ archived_on: '2026-09-29' })

        const rows = resolveRoutineForDate(REFERENCE_DATE, [item], [], buildSignals())

        expect(rows).toHaveLength(1)
    })

    it('marca um item vinculado como concluído só pelo sinal, sem marcação manual', () => {
        const item = buildItem({ link_kind: 'workout_finished' })
        const signals = buildSignals({ workout: 'finished' })

        const rows = resolveRoutineForDate(REFERENCE_DATE, [item], [], signals)

        expect(rows[0].state).toBe('done')
        expect(rows[0].dayEntryId).toBeNull()
    })

    it('marca um item vinculado ainda não satisfeito pelo sinal como done_manual_override quando há marcação manual', () => {
        const item = buildItem({ id: 'item-1', link_kind: 'meal:lanche' })
        const manualEntry = buildEntry({ id: 'entry-1', routine_item_id: 'item-1', completed_at: '2026-09-28T12:00:00.000Z' })
        const signals = buildSignals({ mealsLogged: new Set() })

        const rows = resolveRoutineForDate(REFERENCE_DATE, [item], [manualEntry], signals)

        expect(rows[0].state).toBe('done_manual_override')
        expect(rows[0].dayEntryId).toBe('entry-1')
    })

    it('mostra um item avulso do dia', () => {
        const adhocEntry = buildEntry({ id: 'adhoc-1', routine_item_id: null, title: 'Ligar pro dentista' })

        const rows = resolveRoutineForDate(REFERENCE_DATE, [], [adhocEntry], buildSignals())

        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ source: 'adhoc', title: 'Ligar pro dentista', state: 'pending' })
    })

    it('ordena templates por sort_order antes dos itens avulsos do dia', () => {
        const secondTemplate = buildItem({ id: 'item-2', title: 'Café da manhã', sort_order: 1 })
        const firstTemplate = buildItem({ id: 'item-1', title: 'Academia', sort_order: 0 })
        const adhocEntry = buildEntry({ id: 'adhoc-1', routine_item_id: null, title: 'Tarefa avulsa' })

        const rows = resolveRoutineForDate(
            REFERENCE_DATE,
            [secondTemplate, firstTemplate],
            [adhocEntry],
            buildSignals(),
        )

        expect(rows.map((row) => row.title)).toEqual(['Academia', 'Café da manhã', 'Tarefa avulsa'])
    })
})

describe('deriveRoutineEmptyState', () => {
    it('oferece a rotina sugerida quando não há nenhum item', () => {
        expect(deriveRoutineEmptyState([], [])).toBe('offer_suggested')
    })

    it('oferece a rotina sugerida quando todos os itens estão arquivados', () => {
        const items = [buildItem({ archived_on: REFERENCE_DATE })]

        expect(deriveRoutineEmptyState(items, [])).toBe('offer_suggested')
    })

    it('oferece a rotina sugerida mesmo com tarefa avulsa no dia, se não há item ativo', () => {
        const items = [buildItem({ archived_on: REFERENCE_DATE })]
        const adhocRow = { ...buildEntry({ id: 'adhoc-1' }) }
        const rows = resolveRoutineForDate(REFERENCE_DATE, items, [adhocRow], buildSignals())

        expect(deriveRoutineEmptyState(items, rows)).toBe('offer_suggested')
        expect(rows).toHaveLength(1)
    })

    it('mostra "nada pra este dia" quando há item ativo mas nenhum se aplica hoje (o bug original)', () => {
        const items = [buildItem({ active_from: '2026-10-01' })]

        expect(deriveRoutineEmptyState(items, [])).toBe('nothing_for_day')
    })

    it('mostra "nada pra este dia" quando o item ativo não cai no dia da semana', () => {
        const items = [buildItem({ weekdays: ['sabado', 'domingo'] })]

        expect(deriveRoutineEmptyState(items, [])).toBe('nothing_for_day')
    })

    it('não mostra nenhum estado vazio quando há linhas pra este dia', () => {
        const items = [buildItem()]
        const rows = resolveRoutineForDate(REFERENCE_DATE, items, [], buildSignals())

        expect(deriveRoutineEmptyState(items, rows)).toBe('none')
    })
})

describe('tarefa avulsa com prazo', () => {
    const ENTRY_DATE = '2026-09-20'
    const DUE_DATE = '2026-09-25'

    function buildAdhoc(overrides: Partial<RoutineDayEntryRow> = {}): RoutineDayEntryRow {
        return buildEntry({
            id: 'adhoc-1',
            title: 'Pagar boleto',
            entry_date: ENTRY_DATE,
            ...overrides,
        })
    }

    function resolveAdhocOn(date: string, entry: RoutineDayEntryRow) {
        return resolveRoutineForDate(date, [], [entry], buildSignals())
    }

    it('sem prazo aparece só no próprio entry_date', () => {
        const entry = buildAdhoc()

        expect(resolveAdhocOn(ENTRY_DATE, entry)).toHaveLength(1)
        expect(resolveAdhocOn('2026-09-21', entry)).toHaveLength(0)
        expect(resolveAdhocOn('2026-09-19', entry)).toHaveLength(0)
        expect(resolveAdhocOn(ENTRY_DATE, entry)[0]).toMatchObject({ deadline: null, dueDate: null })
    })

    it('com prazo e não concluída aparece do entry_date em diante, com o estado do prazo', () => {
        const entry = buildAdhoc({ due_date: DUE_DATE })

        const onEntryDate = resolveAdhocOn(ENTRY_DATE, entry)
        const inBetween = resolveAdhocOn('2026-09-22', entry)
        const onDueDate = resolveAdhocOn(DUE_DATE, entry)
        const afterDueDate = resolveAdhocOn('2026-10-10', entry)

        expect(onEntryDate[0]).toMatchObject({ state: 'pending', deadline: 'on_time', carriedFromDate: null })
        expect(inBetween[0]).toMatchObject({ state: 'pending', deadline: 'on_time', carriedFromDate: ENTRY_DATE })
        expect(onDueDate[0]).toMatchObject({ state: 'pending', deadline: 'due_today' })
        expect(afterDueDate[0]).toMatchObject({ state: 'pending', deadline: 'overdue', dueDate: DUE_DATE })
    })

    it('não aparece antes do entry_date, mesmo com prazo', () => {
        const entry = buildAdhoc({ due_date: DUE_DATE })

        expect(resolveAdhocOn('2026-09-19', entry)).toHaveLength(0)
        expect(isAdhocVisibleOnDate(entry, '2026-09-19')).toBe(false)
    })

    it('concluída num dia X: feita em X, pendente antes, ausente depois', () => {
        const entry = buildAdhoc({
            due_date: DUE_DATE,
            completed_at: '2026-09-27T12:00:00.000Z',
            completed_on: '2026-09-27',
        })

        expect(resolveAdhocOn(ENTRY_DATE, entry)[0].state).toBe('pending')
        expect(resolveAdhocOn('2026-09-26', entry)[0].state).toBe('pending')
        expect(resolveAdhocOn('2026-09-27', entry)[0]).toMatchObject({ state: 'done', deadline: 'overdue' })
        expect(resolveAdhocOn('2026-09-28', entry)).toHaveLength(0)
    })

    it('registro legado sem completed_on usa o entry_date como dia da conclusão', () => {
        const entry = buildAdhoc({ completed_at: '2026-09-20T12:00:00.000Z', completed_on: null })
        const entryWithDueDate = buildAdhoc({
            due_date: DUE_DATE,
            completed_at: '2026-09-20T12:00:00.000Z',
            completed_on: null,
        })

        expect(resolveAdhocOn(ENTRY_DATE, entry)[0].state).toBe('done')
        expect(resolveAdhocOn(ENTRY_DATE, entryWithDueDate)[0].state).toBe('done')
        expect(resolveAdhocOn('2026-09-21', entryWithDueDate)).toHaveLength(0)
    })

    it('ignora registros trazidos a mais pela consulta', () => {
        const staleEntry = buildAdhoc({ due_date: DUE_DATE, completed_on: '2026-09-21', completed_at: 'x' })

        expect(resolveAdhocOn('2026-09-24', staleEntry)).toHaveLength(0)
    })

    it('ordena templates, depois as carregadas por prazo, depois as avulsas do dia', () => {
        const template = buildItem({ id: 'item-1', title: 'Academia' })
        const laterDue = buildAdhoc({ id: 'carried-2', title: 'Prazo depois', due_date: '2026-09-30' })
        const earlierDue = buildAdhoc({
            id: 'carried-1',
            title: 'Prazo antes',
            entry_date: '2026-09-22',
            due_date: '2026-09-23',
        })
        const sameDay = buildEntry({ id: 'adhoc-today', title: 'Do dia', entry_date: REFERENCE_DATE, sort_order: 0 })

        const rows = resolveRoutineForDate(
            REFERENCE_DATE,
            [template],
            [sameDay, laterDue, earlierDue],
            buildSignals(),
        )

        expect(rows.map((row) => row.title)).toEqual(['Academia', 'Prazo antes', 'Prazo depois', 'Do dia'])
    })
})

describe('deriveDeadline', () => {
    it('sem prazo não tem estado de prazo', () => {
        expect(deriveDeadline(null, REFERENCE_DATE)).toBeNull()
    })

    it('distingue antes, no dia e depois do prazo', () => {
        expect(deriveDeadline('2026-09-29', REFERENCE_DATE)).toBe('on_time')
        expect(deriveDeadline(REFERENCE_DATE, REFERENCE_DATE)).toBe('due_today')
        expect(deriveDeadline('2026-09-27', REFERENCE_DATE)).toBe('overdue')
    })
})
