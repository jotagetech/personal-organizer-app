import { useEffect, useState } from 'react'

import { useUndoableActions } from '@/contexts/UndoableActionContext'
import { todayInTimezone } from '@/lib/dateUtils'

type MetricPoint = { id: string; entryDate: string; value: number }

type QuickMetricLogProps = {
    title: string
    unitLabel: string
    placeholder: string
    listRecent: () => Promise<MetricPoint[]>
    save: (entryDate: string, value: number) => Promise<MetricPoint>
    deleteEntry: (id: string) => Promise<void>
}

export function QuickMetricLog({
    title,
    unitLabel,
    placeholder,
    listRecent,
    save,
    deleteEntry,
}: QuickMetricLogProps) {
    const { scheduleDeletion, isPendingDeletion } = useUndoableActions()
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

    function handleDeleteClick(point: MetricPoint) {
        setErrorMessage(null)
        scheduleDeletion({
            id: point.id,
            label: `${title} (${point.entryDate.slice(5)})`,
            commit: () => deleteEntry(point.id),
            onCommitted: () => {
                setRecentPoints((previous) => previous.filter((existingPoint) => existingPoint.id !== point.id))
            },
            onRestored: () => setErrorMessage('Não foi possível excluir esse registro.'),
        })
    }

    const visiblePoints = recentPoints.filter((point) => !isPendingDeletion(point.id))

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
            {visiblePoints.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
                    {visiblePoints.map((point) => (
                        <li
                            key={point.id}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 8,
                                fontSize: 13,
                                color: '#52525b',
                                padding: '6px 0',
                                borderTop: '1px solid #e4e4e7',
                            }}
                        >
                            <span
                                style={{
                                    flex: 1,
                                    minWidth: 0,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {point.entryDate.slice(5)}: {point.value}
                            </span>
                            <button
                                type="button"
                                className="secondary-button"
                                style={{ flexShrink: 0, minHeight: 32, padding: '0 10px', fontSize: 12 }}
                                onClick={() => handleDeleteClick(point)}
                            >
                                Excluir
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
