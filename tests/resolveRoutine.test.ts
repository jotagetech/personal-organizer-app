import { describe, expect, it } from 'vitest'

import { resolveRoutineForDate } from '@/features/routine/resolveRoutine'
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
