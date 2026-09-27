import { useState } from 'react'

import { startNewCycle } from '@/features/cycle/api'
import type { WorkoutCycleRow } from '@/features/cycle/types'
import { todayInTimezone } from '@/lib/dateUtils'

type StartCycleFormProps = {
    onStarted: (cycle: WorkoutCycleRow) => void
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
            const createdCycle = await startNewCycle(startDate)
            onStarted(createdCycle)
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
            <div style={{ display: 'flex', gap: 8 }}>
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
