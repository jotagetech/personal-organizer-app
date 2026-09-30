import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { loadCycleHistory, type CycleHistory } from '@/features/evolution/data/cycleHistory'

type CycleHistoryContextValue = {
    // Continua com o valor anterior enquanto recarrega, para a tela não piscar.
    history: CycleHistory | null
    isLoading: boolean
    errorMessage: string | null
    reload: () => Promise<void>
}

const CycleHistoryContext = createContext<CycleHistoryContextValue | null>(null)

export function CycleHistoryProvider({ children }: { children: ReactNode }) {
    const [history, setHistory] = useState<CycleHistory | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    // Só a resposta da chamada mais recente vale; uma resposta lenta de uma
    // chamada anterior não pode sobrescrever o resultado atual.
    const latestRequestId = useRef(0)

    const reload = useCallback(async () => {
        latestRequestId.current += 1
        const requestId = latestRequestId.current
        setIsLoading(true)
        try {
            const loadedHistory = await loadCycleHistory()
            if (requestId === latestRequestId.current) {
                setHistory(loadedHistory)
                setErrorMessage(null)
            }
        } catch (loadError) {
            if (requestId === latestRequestId.current) {
                setErrorMessage(loadError instanceof Error ? loadError.message : 'Falha ao carregar ciclos')
            }
        } finally {
            if (requestId === latestRequestId.current) {
                setIsLoading(false)
            }
        }
    }, [])

    useEffect(() => {
        void reload()
        return () => {
            latestRequestId.current += 1
        }
    }, [reload])

    const contextValue = useMemo(
        () => ({ history, isLoading, errorMessage, reload }),
        [history, isLoading, errorMessage, reload],
    )

    return <CycleHistoryContext.Provider value={contextValue}>{children}</CycleHistoryContext.Provider>
}

export function useCycleHistory(): CycleHistoryContextValue {
    const contextValue = useContext(CycleHistoryContext)
    if (!contextValue) {
        throw new Error('useCycleHistory precisa estar dentro de um CycleHistoryProvider')
    }

    return contextValue
}
