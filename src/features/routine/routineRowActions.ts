import type { RoutineRow } from '@/features/routine/types'

export type RoutineRowPrimaryAction = 'linked_register' | 'confirm_done' | 'none'
export type RoutineRowRemoval = 'delete_day_entry' | 'delete_task' | 'unmark_task' | null

export type RoutineRowActions = {
    primary: RoutineRowPrimaryAction
    canEdit: boolean
    removal: RoutineRowRemoval
}

// Lógica pura: decide as ações disponíveis por linha, cruzando origem/estado
// com a existência do item ainda ativo. "Editar" exige o item ativo porque a
// tela de gerenciamento só lista itens não arquivados; um item arquivado
// depois da data exibida ainda pode aparecer na linha, mas sem atalho de
// edição.
export function deriveRoutineRowActions(row: RoutineRow, activeItemIds: Set<string>): RoutineRowActions {
    if (row.source === 'linked' && row.state === 'pending') {
        return { primary: 'linked_register', canEdit: false, removal: null }
    }

    const isDone = row.state === 'done' || row.state === 'done_manual_override'
    if (row.source === 'task') {
        return deriveTaskRowActions(row, isDone)
    }
    if (!isDone) {
        return { primary: 'confirm_done', canEdit: false, removal: null }
    }

    const isItemActive = row.routineItemId !== null && activeItemIds.has(row.routineItemId)
    const removal = row.dayEntryId !== null ? 'delete_day_entry' : null

    return { primary: 'none', canEdit: isItemActive, removal }
}

// Tarefa pendente pode ser descartada por inteiro; concluída, a remoção só
// desfaz a conclusão.
function deriveTaskRowActions(row: RoutineRow, isDone: boolean): RoutineRowActions {
    if (row.taskId === null) {
        return { primary: 'none', canEdit: false, removal: null }
    }
    if (isDone) {
        return { primary: 'none', canEdit: false, removal: 'unmark_task' }
    }

    return { primary: 'confirm_done', canEdit: false, removal: 'delete_task' }
}
