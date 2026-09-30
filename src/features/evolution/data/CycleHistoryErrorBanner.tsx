import { useCycleHistory } from '@/features/evolution/data/CycleHistoryContext'

// Falha de recarga com dados antigos na tela: mantém o conteúdo e oferece
// nova tentativa em vez de esconder tudo atrás do erro.
export function CycleHistoryErrorBanner() {
    const { history, errorMessage, reload } = useCycleHistory()
    if (!history || !errorMessage) {
        return null
    }

    return (
        <div className="error-list">
            {errorMessage}
            <button type="button" className="error-list__retry" onClick={() => void reload()}>
                Tentar de novo
            </button>
        </div>
    )
}
