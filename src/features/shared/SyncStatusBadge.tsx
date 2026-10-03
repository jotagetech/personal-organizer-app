import { useState } from 'react'
import { CloudCheck, CloudOff, CloudUpload } from 'lucide-react'

import { useOutbox } from '@/contexts/OutboxContext'
import { naturalKeyOf, type OutboxOperation } from '@/lib/outbox/outboxQueue'

const SYNC_ICON_SIZE = 18

// No cabeçalho só cabe o ícone e a contagem; a descrição completa do que está
// na fila aparece no painel ao tocar.
export function SyncStatusBadge() {
    const { pendingCount, failedCount, isOnline, listFailedOperations, discardOperation, retryOperation } = useOutbox()
    const [isPanelOpen, setIsPanelOpen] = useState(false)

    if (pendingCount === 0 && failedCount === 0) {
        return (
            <span className="sync-status-badge sync-status-badge--ok" role="img" aria-label="Tudo salvo">
                <CloudCheck size={SYNC_ICON_SIZE} aria-hidden="true" />
            </span>
        )
    }

    const badgeLabel = formatBadgeLabel(pendingCount, failedCount, isOnline)
    const queuedCount = pendingCount + failedCount
    const StatusIcon = isOnline ? CloudUpload : CloudOff

    return (
        <div className="sync-status-badge-wrapper">
            <button
                type="button"
                className="sync-status-badge sync-status-badge--pending"
                aria-label={badgeLabel}
                aria-expanded={isPanelOpen}
                onClick={() => setIsPanelOpen((previous) => !previous)}
            >
                <StatusIcon size={SYNC_ICON_SIZE} aria-hidden="true" />
                <span className="sync-status-badge__count">{queuedCount}</span>
            </button>
            {isPanelOpen && (
                <div className="sync-status-badge__panel">
                    <p className="sync-status-badge__summary">{badgeLabel}</p>
                    {listFailedOperations().map((operation) => (
                        <div key={naturalKeyOf(operation)} className="sync-status-badge__panel-row">
                            <span>{describeOperation(operation)}</span>
                            <div className="sync-status-badge__panel-actions">
                                <button
                                    type="button"
                                    className="secondary-button"
                                    onClick={() => retryOperation(naturalKeyOf(operation))}
                                >
                                    Tentar de novo
                                </button>
                                <button
                                    type="button"
                                    className="secondary-button"
                                    onClick={() => discardOperation(naturalKeyOf(operation))}
                                >
                                    Descartar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function formatBadgeLabel(pendingCount: number, failedCount: number, isOnline: boolean): string {
    if (pendingCount === 0 && failedCount > 0) {
        return `${failedCount} ${failedCount === 1 ? 'falha' : 'falhas'} no envio`
    }

    const pendingLabel = `${pendingCount} ${pendingCount === 1 ? 'série aguardando envio' : 'séries aguardando envio'}`
    if (!isOnline) {
        return `${pendingLabel} (sem conexão)`
    }

    return pendingLabel
}

function describeOperation(operation: OutboxOperation): string {
    if (operation.kind === 'finish_session') {
        return `Finalizar treino de ${operation.sessionDate}`
    }
    if (operation.kind === 'start_session') {
        return `Iniciar treino de ${operation.sessionDate}`
    }
    if (operation.kind === 'pause_session') {
        return `Pausar treino de ${operation.sessionDate}`
    }
    if (operation.kind === 'resume_session') {
        return `Retomar treino de ${operation.sessionDate}`
    }
    if (operation.kind === 'cancel_session_start') {
        return `Cancelar início do treino de ${operation.sessionDate}`
    }
    if (operation.kind === 'delete_session') {
        return `Excluir treino de ${operation.sessionDate}`
    }
    if (operation.kind === 'add_extra_exercise') {
        return `Adicionar ${operation.exercise.nome} ao treino de ${operation.sessionDate}`
    }

    return `Série ${operation.setIndex} de ${operation.exerciseKey} (${operation.sessionDate})`
}
