import { useEffect, useState } from 'react'

import { todayInTimezone } from '@/lib/dateUtils'

type MetricPoint = { entryDate: string; value: number }

type QuickMetricLogProps = {
    title: string
    unitLabel: string
    placeholder: string
    listRecent: () => Promise<MetricPoint[]>
    save: (entryDate: string, value: number) => Promise<MetricPoint>
}

export function QuickMetricLog({ title, unitLabel, placeholder, listRecent, save }: QuickMetricLogProps) {
    const [recentPoints, setRecentPoints] = useState<MetricPoint[]>([])
    const [valueText, setValueText] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    useEffect(() => {
        void listRecent().then(setRecentPoints)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault()

        const normalizedText = valueText.trim().replace(',', '.')
        const value = Number(normalizedText)
        if (!Number.isFinite(value) || value <= 0) {
            setErrorMessage('Informe um número válido.')
            return
        }

        setErrorMessage(null)
        setIsSubmitting(true)
        try {
            const savedPoint = await save(todayInTimezone(), value)
            setRecentPoints((previous) => {
                const withoutToday = previous.filter((point) => point.entryDate !== savedPoint.entryDate)
                return [savedPoint, ...withoutToday].sort((a, b) => (a.entryDate < b.entryDate ? 1 : -1))
            })
            setValueText('')
        } catch (submitError) {
            const message = submitError instanceof Error ? submitError.message : 'Falha ao salvar'
            setErrorMessage(message)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="card">
            <h3 style={{ fontSize: 14, marginTop: 0 }}>{title}</h3>
            {errorMessage && <div className="error-list">{errorMessage}</div>}
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                    <label>{unitLabel}</label>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={valueText}
                        onChange={(event) => setValueText(event.target.value)}
                        placeholder={placeholder}
                    />
                </div>
                <button type="submit" className="primary-button" disabled={isSubmitting}>
                    {isSubmitting ? 'Salvando...' : 'Salvar'}
                </button>
            </form>
            {recentPoints.length > 0 && (
                <p style={{ fontSize: 12, color: '#71717a', marginTop: 8, marginBottom: 0 }}>
                    {recentPoints.map((point) => `${point.entryDate.slice(5)}: ${point.value}`).join(' · ')}
                </p>
            )}
        </div>
    )
}
