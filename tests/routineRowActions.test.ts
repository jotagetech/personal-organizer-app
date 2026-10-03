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
        taskId: null,
        categoryId: null,
        isImportant: false,
        carriedFromDate: null,
    }
    return { ...baseRow, ...overrides }
}

function buildTaskRow(overrides: Partial<RoutineRow> = {}): RoutineRow {
    return buildRow({ id: 'task-1', source: 'task', routineItemId: null, taskId: 'task-1', ...overrides })
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

    it('tarefa pendente: pede confirmação e pode ser removida por inteiro', () => {
        const row = buildTaskRow({ state: 'pending' })

        const actions = deriveRoutineRowActions(row, new Set())

        expect(actions).toEqual({ primary: 'confirm_done', canEdit: false, removal: 'delete_task' })
    })

    it('tarefa trazida de outro dia: também pode ser removida', () => {
        const row = buildTaskRow({ state: 'pending', carriedFromDate: '2026-09-18' })

        const actions = deriveRoutineRowActions(row, new Set())

        expect(actions.removal).toBe('delete_task')
    })

    it('manual concluído com item ativo: pode editar e remover', () => {
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

    it('tarefa concluída: não edita, remove desmarcando', () => {
        const row = buildTaskRow({ state: 'done' })

        const actions = deriveRoutineRowActions(row, new Set())

        expect(actions).toEqual({ primary: 'none', canEdit: false, removal: 'unmark_task' })
    })

    it('item arquivado depois da data exibida: não pode ser editado', () => {
        const row = buildRow({ source: 'manual', state: 'done', dayEntryId: 'entry-1', routineItemId: 'item-1' })

        const actions = deriveRoutineRowActions(row, new Set())

        expect(actions.canEdit).toBe(false)
    })
})
