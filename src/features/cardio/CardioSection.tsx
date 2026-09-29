import { Flame, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
    createCardioEntry,
    deleteCardioEntry,
    listActivityTypes,
    listCardioEntriesForDate,
} from '@/features/cardio/api'
import { CardioEntryForm } from '@/features/cardio/CardioEntryForm'
import { CardioEntryList } from '@/features/cardio/CardioEntryList'
import type { CardioActivityTypeRow, CardioEntryRow } from '@/features/cardio/types'
import { useDayStatus } from '@/contexts/DayStatusContext'
import type { IsoDate } from '@/lib/dateUtils'

const HEADING_ICON_SIZE = 18
const BUTTON_ICON_SIZE = 18

type CardioSectionProps = {
    sessionDate: IsoDate
}

export function CardioSection({ sessionDate }: CardioSectionProps) {
    const { refreshDayStatus } = useDayStatus()
    const [activityTypes, setActivityTypes] = useState<CardioActivityTypeRow[]>([])
    const [entries, setEntries] = useState<CardioEntryRow[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isAdding, setIsAdding] = useState(false)
    const [hasDismissedPrompt, setHasDismissedPrompt] = useState(false)

    useEffect(() => {
        let isCancelled = false

        async function load() {
            setIsLoading(true)
            setErrorMessage(null)
            try {
                const [nextActivityTypes, nextEntries] = await Promise.all([
                    listActivityTypes(),
                    listCardioEntriesForDate(sessionDate),
                ])
                if (isCancelled) {
                    return
                }
                setActivityTypes(nextActivityTypes)
                setEntries(nextEntries)
                setIsAdding(false)
                setHasDismissedPrompt(false)
            } catch (loadError) {
                if (isCancelled) {
                    return
                }
                const message = loadError instanceof Error ? loadError.message : 'Falha ao carregar cardio'
                setErrorMessage(message)
            } finally {
                if (!isCancelled) {
                    setIsLoading(false)
                }
            }
        }

        void load()
        return () => {
            isCancelled = true
        }
    }, [sessionDate])

    if (isLoading) {
        return <p className="text-muted">Carregando cardio...</p>
    }

    if (errorMessage) {
        return <div className="error-list">Falha ao carregar cardio: {errorMessage}</div>
    }

    const showPrompt = entries.length === 0 && !isAdding && !hasDismissedPrompt

    return (
        <section className="cardio-section">
            <h3 className="section-title cardio-section__title">
                <Flame size={HEADING_ICON_SIZE} aria-hidden="true" />
                Cardio e outras atividades
            </h3>
            <CardioEntryList
                entries={entries}
                activityTypes={activityTypes}
                onDelete={async (entryId) => {
                    await deleteCardioEntry(entryId)
                    setEntries((previous) => previous.filter((entry) => entry.id !== entryId))
                    refreshDayStatus()
                }}
            />
            {showPrompt && (
                <div className="card">
                    <p className="cardio-section__prompt">Vai fazer cardio hoje?</p>
                    <div className="form-actions">
                        <button type="button" className="primary-button" onClick={() => setIsAdding(true)}>
                            Sim
                        </button>
                        <button
                            type="button"
                            className="secondary-button"
                            onClick={() => setHasDismissedPrompt(true)}
                        >
                            Não
                        </button>
                    </div>
                </div>
            )}
            {isAdding && (
                <div className="card">
                    <CardioEntryForm
                        activityTypes={activityTypes}
                        onActivityTypeCreated={(activityType) =>
                            setActivityTypes((previous) => [...previous, activityType])
                        }
                        onCancel={() => setIsAdding(false)}
                        onSubmit={async (values) => {
                            const createdEntry = await createCardioEntry({ entryDate: sessionDate, ...values })
                            setEntries((previous) => [...previous, createdEntry])
                            setIsAdding(false)
                            refreshDayStatus()
                        }}
                    />
                </div>
            )}
            {!showPrompt && !isAdding && (
                <button type="button" className="secondary-button full-width" onClick={() => setIsAdding(true)}>
                    <Plus size={BUTTON_ICON_SIZE} aria-hidden="true" />
                    {entries.length > 0 ? 'Adicionar outro cardio' : 'Adicionar cardio'}
                </button>
            )}
        </section>
    )
}
