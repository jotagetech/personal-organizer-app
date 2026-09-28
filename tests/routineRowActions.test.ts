import { describe, expect, it } from 'vitest'

import { deriveRoutineRowActions } from '@/features/routine/routineRowActions'
import type { RoutineRow } from '@/features/routine/types'

function buildRow(overrides: Partial<RoutineRow> = {}): RoutineRow {
    const baseRow: RoutineRow = {
        id: 'row-1',
        title: 'Academia',
        source: 'manual',
        state: 'pending',
        linkKind: null,
        routineItemId: 'item-1',
        dayEntryId: null,
    }
    return { ...baseRow, ...overrides }
}

describe('deriveRoutineRowActions', () => {
    it('vinculado pendente: leva a registrar, sem editar/remover', () => {
        const row = buildRow({ source: 'linked', state: 'pending', linkKind: 'workout_finished' })

        const actions = deriveRoutineRowActions(row, new Set(['item-1']))

        expect(actions).toEqual({ primary: 'linked_register', canEdit: false, removal: null })
    })

    it('manual pendente: pede confirmação, sem editar/remover', () => {
        const row = buildRow({ source: 'manual', state: 'pending' })

        const actions = deriveRoutineRowActions(row, new Set(['item-1']))

        expect(actions).toEqual({ primary: 'confirm_done', canEdit: false, removal: null })
    })

    it('avulso pendente: pede confirmação, sem editar/remover', () => {
        const row = buildRow({ source: 'adhoc', state: 'pending', routineItemId: null, dayEntryId: 'entry-1' })

        const actions = deriveRoutineRowActions(row, new Set())

        expect(actions).toEqual({ primary: 'confirm_done', canEdit: false, removal: null })
    })

    it('manual concluído com template ativo: pode editar e remover', () => {
        const row = buildRow({ source: 'manual', state: 'done', dayEntryId: 'entry-1' })

        const actions = deriveRoutineRowActions(row, new Set(['item-1']))

        expect(actions).toEqual({ primary: 'none', canEdit: true, removal: 'delete_day_entry' })
    })

    it('vinculado concluído só pelo sinal (sem dayEntryId): pode editar, sem remoção', () => {
        const row = buildRow({ source: 'linked', state: 'done', linkKind: 'workout_finished', dayEntryId: null })

        const actions = deriveRoutineRowActions(row, new Set(['item-1']))

        expect(actions).toEqual({ primary: 'none', canEdit: true, removal: null })
    })

    it('vinculado done_manual_override: pode editar e remover a marcação manual', () => {
        const row = buildRow({
            source: 'linked',
            state: 'done_manual_override',
            linkKind: 'meal:lanche',
            dayEntryId: 'entry-1',
        })

        const actions = deriveRoutineRowActions(row, new Set(['item-1']))

        expect(actions).toEqual({ primary: 'none', canEdit: true, removal: 'delete_day_entry' })
    })

    it('avulso concluído: não edita, remove desmarcando', () => {
        const row = buildRow({ source: 'adhoc', state: 'done', routineItemId: null, dayEntryId: 'entry-1' })

        const actions = deriveRoutineRowActions(row, new Set())

        expect(actions).toEqual({ primary: 'none', canEdit: false, removal: 'unmark_adhoc' })
    })

    it('template arquivado depois da data exibida: não pode ser editado', () => {
        const row = buildRow({ source: 'manual', state: 'done', dayEntryId: 'entry-1', routineItemId: 'item-1' })

        const actions = deriveRoutineRowActions(row, new Set())

        expect(actions.canEdit).toBe(false)
    })
})
