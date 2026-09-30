import { useOptionalCycleHistory } from '@/features/evolution/data/CycleHistoryContext'

// O detalhe do dia também é usado fora de Resultados, onde não há histórico
// de ciclos para recarregar.
export function useOptionalCycleHistoryReload(): (() => Promise<void>) | null {
    const contextValue = useOptionalCycleHistory()
    const reload = contextValue?.reload ?? null

    return reload
}
