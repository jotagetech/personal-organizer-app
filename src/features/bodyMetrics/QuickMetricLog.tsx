import { useEffect, useState } from 'react'

import { useUndoableActions } from '@/contexts/UndoableActionContext'
import { parseMetricValue } from '@/features/bodyMetrics/parseMetric'

type MetricPoint = { id: string; entryDate: string; value: number }

type QuickMetricLogProps = {
    title: string
    unitLabel: string
    placeholder: string
    entryDate: string
    maxValue?: number
    listRecent: () => Promise<MetricPoint[]>
    getEntryForDate: (entryDate: string) => Promise<MetricPoint | null>
    save: (entryDate: string, value: number) => Promise<MetricPoint>
    deleteEntry: (id: string) => Promise<void>
}

export function QuickMetricLog({
    title,
    unitLabel,
    placeholder,
    entryDate,
    maxValue,
    listRecent,
    getEntryForDate,
    save,
    deleteEntry,
}: QuickMetricLogProps) {
    const { scheduleDeletion, isPendingDeletion } = useUndoableActions()
    const [recentPoints, setRecentPoints] = useState<MetricPoint[]>([])
    const [existingEntry, setExistingEntry] = useState<MetricPoint | null>(null)
    const [hasLoadedEntry, setHasLoadedEntry] = useState(false)
    const [valueText, setValueText] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    useEffect(() => {
        void listRecent().then(setRecentPoints)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Refaz a busca do registro do dia selecionado sempre que a data muda, pra
    // abrir o formulário já preenchido em vez de sempre em branco.
    useEffect(() => {
        let isCancelled = false

        async function loadEntryForDate() {
            try {
                const entry = await getEntryForDate(entryDate)
                if (isCancelled) {
                    return
                }
                setExistingEntry(entry)
                setValueText(entry ? String(entry.value) : '')
            } catch (loadError) {
                if (isCancelled) {
                    return
                }
                const message = loadError instanceof Error ? loadError.message : 'Falha ao carregar registro do dia'
                setErrorMessage(message)
            } finally {
                if (!isCancelled) {
                    setHasLoadedEntry(true)
                }
            }
        }

        setHasLoadedEntry(false)
        void loadEntryForDate()
        return () => {
            isCancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entryDate])

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault()

        const parsedValue = parseMetricValue(valueText, maxValue)
        if (!parsedValue.valid) {
            setErrorMessage(parsedValue.errorMessage)
            return
        }

        setErrorMessage(null)
        setIsSubmitting(true)
        try {
            const savedPoint = await save(entryDate, parsedValue.value)
            setExistingEntry(savedPoint)
            setValueText(String(savedPoint.value))
            setRecentPoints((previous) => {
                const withoutSameDate = previous.filter((point) => point.entryDate !== savedPoint.entryDate)
                return [savedPoint, ...withoutSameDate].sort((a, b) => (a.entryDate < b.entryDate ? 1 : -1))
            })
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
                if (point.entryDate === entryDate) {
                    setExistingEntry(null)
                    setValueText('')
                }
            },
            onRestored: () => setErrorMessage('Não foi possível excluir esse registro.'),
        })
    }

    const visiblePoints = recentPoints.filter((point) => !isPendingDeletion(point.id))
    const isEntryPendingDeletion = existingEntry !== null && isPendingDeletion(existingEntry.id)
    const isMissingEntry = hasLoadedEntry && (existingEntry === null || isEntryPendingDeletion)
    const cardClassName = isMissingEntry ? 'card card--pending' : 'card'

    return (
        <div className={cardClassName}>
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
                <p className="quick-metric-log__recent">
                    últimos:{' '}
                    {visiblePoints.map((point, index) => (
                        <span key={point.id}>
                            {index > 0 && ' · '}
                            <button
                                type="button"
                                className="quick-metric-log__recent-value"
                                title="Toque para excluir"
                                aria-label={`Excluir registro de ${point.entryDate.slice(5)}: ${point.value}`}
                                onClick={() => handleDeleteClick(point)}
                            >
                                {point.value}
                            </button>
                        </span>
                    ))}
                </p>
            )}
        </div>
    )
}
