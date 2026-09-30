import { useState } from 'react'

import { startNewCycle } from '@/features/cycle/api'
import { todayInTimezone } from '@/lib/dateUtils'

type StartCycleFormProps = {
    onStarted: () => void
    onCancel: () => void
}

export function StartCycleForm({ onStarted, onCancel }: StartCycleFormProps) {
    const [startDate, setStartDate] = useState(() => todayInTimezone())
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault()
        setIsSubmitting(true)
        setErrorMessage(null)

        try {
            await startNewCycle(startDate)
            onStarted()
        } catch (submitError) {
            const message = submitError instanceof Error ? submitError.message : 'Falha ao iniciar ciclo'
            setErrorMessage(message)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            {errorMessage && <div className="error-list">{errorMessage}</div>}
            <div className="field">
                <label htmlFor="cycle-start-date">Data de início do ciclo</label>
                <input
                    id="cycle-start-date"
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                />
            </div>
            <div className="form-actions">
                <button type="submit" className="primary-button" disabled={isSubmitting}>
                    {isSubmitting ? 'Iniciando...' : 'Iniciar ciclo'}
                </button>
                <button type="button" className="secondary-button" onClick={onCancel}>
                    Cancelar
                </button>
            </div>
        </form>
    )
}
