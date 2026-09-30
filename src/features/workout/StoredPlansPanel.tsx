import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'

import { startNewCycle } from '@/features/cycle/api'
import { activateStoredPlan, listStoredPlans } from '@/features/workout/api'
import { PlanSwitchConfirm } from '@/features/workout/PlanSwitchConfirm'
import { StoredPlanViewer } from '@/features/workout/StoredPlanViewer'
import {
    describeStoredPlans,
    formatPlanImportedAt,
    storedPlanDisplayName,
    type StoredPlanEntry,
} from '@/features/workout/storedPlans'
import { todayInTimezone } from '@/lib/dateUtils'

const BACK_ICON_SIZE = 18
const NO_ACTIVE_PLAN_NAME = 'nenhum plano'

type StoredPlansPanelProps = {
    onClose: () => void
}

export function StoredPlansPanel({ onClose }: StoredPlansPanelProps) {
    const [entries, setEntries] = useState<StoredPlanEntry[] | null>(null)
    const [confirmingPlanId, setConfirmingPlanId] = useState<string | null>(null)
    const [viewingPlanId, setViewingPlanId] = useState<string | null>(null)
    const [isSwitching, setIsSwitching] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [statusMessage, setStatusMessage] = useState<string | null>(null)

    useEffect(() => {
        void loadEntries()
    }, [])

    async function loadEntries() {
        try {
            const listing = await listStoredPlans()
            setEntries(describeStoredPlans(listing))
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : 'Falha ao carregar os planos'
            setErrorMessage(message)
        }
    }

    async function handleSwitch(planEntry: StoredPlanEntry, choice: { restartCycle: boolean }) {
        setIsSwitching(true)
        setErrorMessage(null)
        setStatusMessage(null)

        try {
            await activateStoredPlan(planEntry.id)
            if (choice.restartCycle) {
                await startNewCycle(todayInTimezone())
            }
            const cycleNote = choice.restartCycle ? ', com ciclo novo começando hoje' : ''
            setStatusMessage(`${planEntry.name} é o plano ativo agora${cycleNote}.`)
            setConfirmingPlanId(null)
            await loadEntries()
        } catch (switchError) {
            const message = switchError instanceof Error ? switchError.message : 'Falha ao trocar o plano'
            setErrorMessage(message)
        } finally {
            setIsSwitching(false)
        }
    }

    const activeEntry = entries?.find((entry) => entry.isActive)
    const activePlanName = activeEntry ? storedPlanDisplayName(activeEntry) : NO_ACTIVE_PLAN_NAME

    const viewingEntry = entries?.find((entry) => entry.id === viewingPlanId)
    if (viewingEntry) {
        return <StoredPlanViewer entry={viewingEntry} onBack={() => setViewingPlanId(null)} />
    }

    return (
        <div>
            <div className="page-header">
                <h2 className="page-title">Planos de treino</h2>
                <button type="button" className="secondary-button" onClick={onClose}>
                    <ArrowLeft size={BACK_ICON_SIZE} aria-hidden="true" />
                    Voltar
                </button>
            </div>
            <p className="text-small text-muted stored-plans__hint">
                Todo plano importado ou salvo pelo montador fica guardado aqui. Voltar para um deles não
                precisa do arquivo de novo.
            </p>
            {errorMessage && <div className="error-list">{errorMessage}</div>}
            {statusMessage && <p className="save-status">{statusMessage}</p>}
            {entries === null && !errorMessage && <p className="text-muted">Carregando planos...</p>}
            {entries?.length === 0 && <p className="text-muted">Nenhum plano importado ainda.</p>}
            {entries && entries.length > 0 && (
                <div className="card stored-plans__list">
                    {entries.map((entry) => (
                        <div key={entry.id} className="stored-plans__row">
                            <div className="stored-plans__summary">
                                <span className="stored-plans__name">
                                    {entry.name}
                                    {entry.isActive && <span className="stored-plans__badge">Ativo</span>}
                                </span>
                                <span className="text-small text-secondary">
                                    Importado em {formatPlanImportedAt(entry.importedAt)}
                                    {entry.versionLabel && ` · ${entry.versionLabel}`}
                                </span>
                            </div>
                            {confirmingPlanId === entry.id ? (
                                <PlanSwitchConfirm
                                    currentPlanName={activePlanName}
                                    nextPlanName={storedPlanDisplayName(entry)}
                                    confirmLabel="Usar este plano"
                                    isBusy={isSwitching}
                                    onConfirm={(choice) => void handleSwitch(entry, choice)}
                                    onCancel={() => setConfirmingPlanId(null)}
                                />
                            ) : (
                                <div className="stored-plans__actions">
                                    <button
                                        type="button"
                                        className="secondary-button"
                                        onClick={() => setViewingPlanId(entry.id)}
                                    >
                                        Ver
                                    </button>
                                    {!entry.isActive && (
                                        <button
                                            type="button"
                                            className="secondary-button"
                                            onClick={() => {
                                                setConfirmingPlanId(entry.id)
                                                setStatusMessage(null)
                                            }}
                                            disabled={isSwitching}
                                        >
                                            Usar este plano
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
