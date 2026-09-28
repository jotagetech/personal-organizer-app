import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import {
    createPendingDeletionsStore,
    type PendingDeletion,
    type PendingDeletionsStore,
    type ScheduleDeletionInput,
} from '@/lib/pendingDeletions'

type UndoableActionContextValue = {
    scheduleDeletion: (input: ScheduleDeletionInput) => void
    undoDeletion: (id: string) => void
    isPendingDeletion: (id: string) => boolean
    pendingDeletions: PendingDeletion[]
}

const UndoableActionContext = createContext<UndoableActionContextValue | null>(null)

export function UndoableActionProvider({ children }: { children: ReactNode }) {
    const [changeTick, setChangeTick] = useState(0)
    const storeRef = useRef<PendingDeletionsStore | null>(null)
    if (!storeRef.current) {
        storeRef.current = createPendingDeletionsStore(() => setChangeTick((tick) => tick + 1))
    }
    const store = storeRef.current

    // O app fica vivo no celular por um instante depois de minimizado; esse é o
    // último ponto confiável pra confirmar exclusões pendentes antes que o
    // processo seja encerrado.
    useEffect(() => {
        function handleVisibilityChange() {
            if (document.hidden) {
                store.flushAllPending()
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [store])

    // changeTick não é lido diretamente dentro do useMemo: ele só existe pra forçar
    // o recálculo de pendingDeletions sempre que o estado interno do store muda,
    // já que esse estado não vive em nenhum hook do React.
    const contextValue = useMemo<UndoableActionContextValue>(
        () => ({
            scheduleDeletion: store.scheduleDeletion,
            undoDeletion: store.undoDeletion,
            isPendingDeletion: store.isPendingDeletion,
            pendingDeletions: store.listPendingDeletions(),
        }),
        [store, changeTick],
    )

    return (
        <UndoableActionContext.Provider value={contextValue}>
            {children}
        </UndoableActionContext.Provider>
    )
}

export function useUndoableActions(): UndoableActionContextValue {
    const contextValue = useContext(UndoableActionContext)
    if (!contextValue) {
        throw new Error('useUndoableActions precisa estar dentro de um UndoableActionProvider')
    }

    return contextValue
}
