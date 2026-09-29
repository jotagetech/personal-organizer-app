import { FileUp } from 'lucide-react'
import { useRef, useState } from 'react'

import { importWorkoutPlanFromText } from '@/features/workout/api'

const PICK_ICON_SIZE = 20

type ImportWorkoutPlanProps = {
    onImported: () => void
}

export function ImportWorkoutPlan({ onImported }: ImportWorkoutPlanProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [errors, setErrors] = useState<{ path: string; message: string }[]>([])
    const [statusMessage, setStatusMessage] = useState<string | null>(null)
    const [isImporting, setIsImporting] = useState(false)

    async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
        const selectedFile = event.target.files?.[0]
        event.target.value = ''
        if (!selectedFile) {
            return
        }

        setIsImporting(true)
        setErrors([])
        setStatusMessage(null)

        const rawText = await selectedFile.text()
        const result = await importWorkoutPlanFromText(rawText)

        setIsImporting(false)
        if (!result.success) {
            setErrors(result.errors)
            return
        }

        if (result.alreadyImported) {
            setStatusMessage('Esse plano já estava importado como o plano ativo.')
        } else {
            setStatusMessage('Plano importado com sucesso.')
        }
        onImported()
    }

    return (
        <div className="card">
            <h2 className="section-title">Importar treino</h2>
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
            {statusMessage && <p className="save-status">{statusMessage}</p>}
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
        </div>
    )
}

function pickButtonClass(isImporting: boolean): string {
    const className = isImporting
        ? 'primary-button import-plan__pick import-plan__pick--busy'
        : 'primary-button import-plan__pick'

    return className
}
