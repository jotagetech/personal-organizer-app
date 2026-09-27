import { useRef, useState } from 'react'

import { importWorkoutPlanFromText } from '@/features/workout/api'

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
            <h2 style={{ fontSize: 16, marginTop: 0 }}>Importar treino</h2>
            <p style={{ fontSize: 13, color: '#52525b' }}>
                Selecione o arquivo .json do plano de treino gerado fora do aplicativo.
            </p>
            {errors.length > 0 && (
                <div className="error-list">
                    <strong>Não foi possível importar o plano:</strong>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                        {errors.map((error) => (
                            <li key={`${error.path}-${error.message}`}>
                                <code>{error.path}</code>: {error.message}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {statusMessage && <p className="save-status">{statusMessage}</p>}
            <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleFileSelected}
                disabled={isImporting}
            />
        </div>
    )
}
