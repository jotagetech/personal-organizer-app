import { useState } from 'react'

import { useOutbox } from '@/contexts/OutboxContext'
import { naturalKeyOf, type OutboxOperation } from '@/lib/outbox/outboxQueue'

export function SyncStatusBadge() {
    const { pendingCount, failedCount, isOnline, listFailedOperations, discardOperation } = useOutbox()
    const [isFailedPanelOpen, setIsFailedPanelOpen] = useState(false)

    if (pendingCount === 0 && failedCount === 0) {
        return <span className="sync-status-badge sync-status-badge--ok">Tudo salvo</span>
    }

    return (
        <div className="sync-status-badge-wrapper">
            <button
                type="button"
                className="sync-status-badge sync-status-badge--pending"
                onClick={() => setIsFailedPanelOpen((previous) => !previous)}
            >
                {formatBadgeLabel(pendingCount, failedCount, isOnline)}
            </button>
            {isFailedPanelOpen && failedCount > 0 && (
                <div className="sync-status-badge__panel">
                    {listFailedOperations().map((operation) => (
                        <div key={naturalKeyOf(operation)} className="sync-status-badge__panel-row">
                            <span>{describeOperation(operation)}</span>
                            <button
                                type="button"
                                className="secondary-button"
                                onClick={() => discardOperation(naturalKeyOf(operation))}
                            >
                                Descartar
                            </button>
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

    return `Série ${operation.setIndex} de ${operation.exerciseKey} (${operation.sessionDate})`
}
