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
import type { IsoDate } from '@/lib/dateUtils'

type CardioSectionProps = {
    sessionDate: IsoDate
}

export function CardioSection({ sessionDate }: CardioSectionProps) {
    const [activityTypes, setActivityTypes] = useState<CardioActivityTypeRow[]>([])
    const [entries, setEntries] = useState<CardioEntryRow[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isAdding, setIsAdding] = useState(false)
    const [hasDismissedPrompt, setHasDismissedPrompt] = useState(false)

    useEffect(() => {
        let isCancelled = false

        async function load() {
            setIsLoading(true)
            const [nextActivityTypes, nextEntries] = await Promise.all([
                listActivityTypes(),
                listCardioEntriesForDate(sessionDate),
            ])
            if (isCancelled) {
                return
            }
            setActivityTypes(nextActivityTypes)
            setEntries(nextEntries)
            setIsLoading(false)
            setIsAdding(false)
            setHasDismissedPrompt(false)
        }

        void load()
        return () => {
            isCancelled = true
        }
    }, [sessionDate])

    if (isLoading) {
        return <p>Carregando cardio...</p>
    }

    const showPrompt = entries.length === 0 && !isAdding && !hasDismissedPrompt

    return (
        <div>
            <h3 style={{ fontSize: 14, marginBottom: 6 }}>Cardio / outras atividades</h3>
            <CardioEntryList
                entries={entries}
                activityTypes={activityTypes}
                onDelete={async (entryId) => {
                    await deleteCardioEntry(entryId)
                    setEntries((previous) => previous.filter((entry) => entry.id !== entryId))
                }}
            />
            {showPrompt && (
                <div className="card">
                    <p style={{ marginTop: 0 }}>Vai fazer cardio hoje?</p>
                    <div style={{ display: 'flex', gap: 8 }}>
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
                        }}
                    />
                </div>
            )}
            {!showPrompt && !isAdding && (
                <button type="button" className="secondary-button" onClick={() => setIsAdding(true)}>
                    {entries.length > 0 ? '+ Adicionar outro cardio' : '+ Adicionar cardio'}
                </button>
            )}
        </div>
    )
}
