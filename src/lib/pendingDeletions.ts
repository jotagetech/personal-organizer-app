// Módulo puro (sem React) que agenda exclusões com uma janela de desfazer antes
// de executar a exclusão de fato. Mantém o timer aqui, e não em cada componente,
// pra sobreviver a troca de aba e remontagem de tela sem cancelar nem duplicar a
// exclusão pendente.

export const DEFAULT_UNDO_DELAY_MS = 5000

export type PendingDeletion = {
    id: string
    label: string
}

export type ScheduleDeletionInput = {
    id: string
    label: string
    commit: () => Promise<void>
    onCommitted?: () => void
    onRestored?: (errorMessage: string) => void
}

export type PendingDeletionsStore = {
    scheduleDeletion: (input: ScheduleDeletionInput) => void
    undoDeletion: (id: string) => void
    isPendingDeletion: (id: string) => boolean
    listPendingDeletions: () => PendingDeletion[]
    flushAllPending: () => void
}

type ScheduledDeletion = ScheduleDeletionInput & {
    timeoutId: ReturnType<typeof setTimeout>
}

export function createPendingDeletionsStore(
    onChange?: () => void,
    delayMs: number = DEFAULT_UNDO_DELAY_MS,
): PendingDeletionsStore {
    const scheduledById = new Map<string, ScheduledDeletion>()

    function notifyChange() {
        onChange?.()
    }

    async function commit(id: string) {
        const scheduled = scheduledById.get(id)
        if (!scheduled) {
            return
        }

        scheduledById.delete(id)
        notifyChange()

        try {
            await scheduled.commit()
            scheduled.onCommitted?.()
        } catch (commitError) {
            const message = commitError instanceof Error ? commitError.message : 'Falha ao excluir'
            scheduled.onRestored?.(message)
        }
    }

    function scheduleDeletion(input: ScheduleDeletionInput) {
        const existingScheduled = scheduledById.get(input.id)
        if (existingScheduled) {
            clearTimeout(existingScheduled.timeoutId)
        }

        const timeoutId = setTimeout(() => {
            void commit(input.id)
        }, delayMs)

        scheduledById.set(input.id, { ...input, timeoutId })
        notifyChange()
    }

    function undoDeletion(id: string) {
        const scheduled = scheduledById.get(id)
        if (!scheduled) {
            return
        }

        clearTimeout(scheduled.timeoutId)
        scheduledById.delete(id)
        notifyChange()
    }

    function isPendingDeletion(id: string): boolean {
        return scheduledById.has(id)
    }

    function listPendingDeletions(): PendingDeletion[] {
        return Array.from(scheduledById.values()).map((scheduled) => ({
            id: scheduled.id,
            label: scheduled.label,
        }))
    }

    function flushAllPending() {
        const pendingIds = Array.from(scheduledById.keys())
        for (const id of pendingIds) {
            const scheduled = scheduledById.get(id)
            if (scheduled) {
                clearTimeout(scheduled.timeoutId)
            }
            void commit(id)
        }
    }

    return {
        scheduleDeletion,
        undoDeletion,
        isPendingDeletion,
        listPendingDeletions,
        flushAllPending,
    }
}
