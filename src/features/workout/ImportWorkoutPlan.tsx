import { ArrowLeft, FileUp } from 'lucide-react'
import { useRef, useState } from 'react'

import { startNewCycle } from '@/features/cycle/api'
import { importWorkoutPlanDocument } from '@/features/workout/api'
import { PlanSwitchConfirm } from '@/features/workout/PlanSwitchConfirm'
import { todayInTimezone } from '@/lib/dateUtils'
import { parseWorkoutPlanJson, type WorkoutPlanDocument } from '@/lib/workoutPlanSchema'

const PICK_ICON_SIZE = 20
const BACK_ICON_SIZE = 18

type ImportError = { path: string; message: string }

type ImportWorkoutPlanProps = {
    activePlanName: string | null
    onImported: () => void
    onCancel?: () => void
}

export function ImportWorkoutPlan({ activePlanName, onImported, onCancel }: ImportWorkoutPlanProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [errors, setErrors] = useState<ImportError[]>([])
    const [isImporting, setIsImporting] = useState(false)
    const [pendingDocument, setPendingDocument] = useState<WorkoutPlanDocument | null>(null)

    async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
        const selectedFile = event.target.files?.[0]
        event.target.value = ''
        if (!selectedFile) {
            return
        }

        setErrors([])
        const rawText = await selectedFile.text()
        const validationResult = parseWorkoutPlanJson(rawText)
        if (!validationResult.success) {
            setErrors(validationResult.errors)
            return
        }

        // Sem plano ativo não há o que trocar; com plano ativo, a troca só
        // acontece depois da confirmação explícita.
        if (activePlanName === null) {
            await importDocument(validationResult.document, { restartCycle: false })
            return
        }
        setPendingDocument(validationResult.document)
    }

    async function importDocument(document: WorkoutPlanDocument, choice: { restartCycle: boolean }) {
        setIsImporting(true)
        const result = await importWorkoutPlanDocument(document)
        if (!result.success) {
            setIsImporting(false)
            setPendingDocument(null)
            setErrors(result.errors)
            return
        }

        try {
            if (choice.restartCycle) {
                await startNewCycle(todayInTimezone())
            }
            onImported()
        } catch (cycleError) {
            const message = cycleError instanceof Error ? cycleError.message : 'erro desconhecido'
            setErrors([{ path: '(ciclo)', message: `plano trocado, mas o ciclo novo não começou: ${message}` }])
        } finally {
            setIsImporting(false)
            setPendingDocument(null)
        }
    }

    return (
        <div className="card">
            <div className="import-plan__header">
                <h2 className="section-title">Importar treino</h2>
                {onCancel && (
                    <button type="button" className="secondary-button" onClick={onCancel} disabled={isImporting}>
                        <ArrowLeft size={BACK_ICON_SIZE} aria-hidden="true" />
                        Voltar
                    </button>
                )}
            </div>
            <p className="text-small text-secondary import-plan__hint">
                Selecione o arquivo .json do plano de treino gerado fora do aplicativo.
            </p>
            {errors.length > 0 && (
                <div className="error-list">
                    <strong>Não foi possível importar o plano:</strong>
                    <ul className="error-list__items">
                        {errors.map((error) => (
                            <li key={`${error.path}-${error.message}`}>
                                <code>{error.path}</code>: {error.message}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {pendingDocument && activePlanName !== null ? (
                <PlanSwitchConfirm
                    currentPlanName={activePlanName}
                    nextPlanName={pendingDocument.nome}
                    confirmLabel="Importar e trocar"
                    isBusy={isImporting}
                    onConfirm={(choice) => void importDocument(pendingDocument, choice)}
                    onCancel={() => setPendingDocument(null)}
                />
            ) : (
                <label className={pickButtonClass(isImporting)}>
                    <FileUp size={PICK_ICON_SIZE} aria-hidden="true" />
                    {isImporting ? 'Importando...' : 'Escolher arquivo .json'}
                    <input
                        ref={fileInputRef}
                        className="visually-hidden"
                        type="file"
                        accept="application/json,.json"
                        onChange={handleFileSelected}
                        disabled={isImporting}
                    />
                </label>
            )}
        </div>
    )
}

function pickButtonClass(isImporting: boolean): string {
    const className = isImporting
        ? 'primary-button import-plan__pick import-plan__pick--busy'
        : 'primary-button import-plan__pick'

    return className
}
