import { useCycleHistory } from '@/features/evolution/data/CycleHistoryContext'

// O detalhe do dia também é usado fora de Resultados, onde não há histórico
// de ciclos para recarregar. useCycleHistory lê o contexto sempre, antes de
// lançar o erro de provider ausente, então a ordem dos hooks não muda entre
// as renderizações e o erro pode ser trocado por "nada a recarregar".
export function useOptionalCycleHistoryReload(): (() => Promise<void>) | null {
    try {
        const { reload } = useCycleHistory()
        return reload
    } catch {
        return null
    }
}
