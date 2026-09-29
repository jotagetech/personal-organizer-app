import type { RoutineRow } from '@/features/routine/types'

export type RoutineRowPrimaryAction = 'linked_register' | 'confirm_done' | 'none'
export type RoutineRowRemoval = 'delete_day_entry' | 'unmark_adhoc' | null

export type RoutineRowActions = {
    primary: RoutineRowPrimaryAction
    canEdit: boolean
    removal: RoutineRowRemoval
}

// Lógica pura: decide as ações disponíveis por linha, cruzando origem/estado
// com a existência do template ainda ativo. "Editar" exige o template ativo
// porque a tela de gerenciamento só lista itens não arquivados; um item
// arquivado depois da data exibida ainda pode aparecer na linha, mas sem
// atalho de edição.
export function deriveRoutineRowActions(row: RoutineRow, activeItemIds: Set<string>): RoutineRowActions {
    if (row.source === 'linked' && row.state === 'pending') {
        return { primary: 'linked_register', canEdit: false, removal: null }
    }

    const isDone = row.state === 'done' || row.state === 'done_manual_override'
    if (!isDone) {
        // Tarefa avulsa pendente pode ser descartada por inteiro: sem isso, uma
        // tarefa com prazo abandonada seguiria aparecendo em todo dia seguinte.
        const removal = row.source === 'adhoc' && row.dayEntryId !== null ? 'delete_day_entry' : null
        return { primary: 'confirm_done', canEdit: false, removal }
    }

    if (row.source === 'adhoc') {
        return { primary: 'none', canEdit: false, removal: 'unmark_adhoc' }
    }

    const isTemplateActive = row.routineItemId !== null && activeItemIds.has(row.routineItemId)
    const removal = row.dayEntryId !== null ? 'delete_day_entry' : null

    return { primary: 'none', canEdit: isTemplateActive, removal }
}
