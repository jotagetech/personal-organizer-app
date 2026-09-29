import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import { useUndoableActions } from '@/contexts/UndoableActionContext'
import { activityTypeName, FEELING_SCALE_OPTIONS } from '@/features/cardio/types'
import type { CardioActivityTypeRow, CardioEntryRow } from '@/features/cardio/types'

const DELETE_ICON_SIZE = 18
const FEELING_SCALE_MAX = 5

type CardioEntryListProps = {
    entries: CardioEntryRow[]
    activityTypes: CardioActivityTypeRow[]
    onDelete: (entryId: string) => Promise<void>
}

export function CardioEntryList({ entries, activityTypes, onDelete }: CardioEntryListProps) {
    const { scheduleDeletion, isPendingDeletion } = useUndoableActions()
    const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null)

    const visibleEntries = entries.filter((entry) => !isPendingDeletion(entry.id))
    if (visibleEntries.length === 0 && !deleteErrorMessage) {
        return null
    }

    function handleDeleteClick(entry: CardioEntryRow) {
        setDeleteErrorMessage(null)
        scheduleDeletion({
            id: entry.id,
            label: `Cardio: ${activityTypeName(activityTypes, entry.activity_type_id)}`,
            commit: () => onDelete(entry.id),
            onRestored: () => setDeleteErrorMessage('Não foi possível excluir esse registro de cardio.'),
        })
    }

    return (
        <div>
            {deleteErrorMessage && <div className="error-list">{deleteErrorMessage}</div>}
            {visibleEntries.length > 0 && (
                <div className="card cardio-list">
                    {visibleEntries.map((entry) => (
                        <div key={entry.id} className="cardio-list__row">
                            <div className="cardio-list__text">
                                <strong className="cardio-list__name">
                                    {activityTypeName(activityTypes, entry.activity_type_id)}
                                </strong>
                                <p className="cardio-list__stats">
                                    <span className="cardio-list__number">{entry.duration_minutes}</span> min
                                    {entry.distance_km !== null && (
                                        <>
                                            {' · '}
                                            <span className="cardio-list__number">{entry.distance_km}</span> km
                                        </>
                                    )}
                                    {` · ${feelingLabel(entry.feeling_scale)}`}
                                </p>
                                {entry.feeling_note && <p className="cardio-list__note">{entry.feeling_note}</p>}
                                {entry.note && <p className="cardio-list__note">{entry.note}</p>}
                            </div>
                            <button
                                type="button"
                                className="icon-button cardio-list__delete"
                                aria-label="Excluir"
                                onClick={() => handleDeleteClick(entry)}
                            >
                                <Trash2 size={DELETE_ICON_SIZE} aria-hidden="true" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function feelingLabel(feelingScale: number): string {
    const matchingOption = FEELING_SCALE_OPTIONS.find((option) => option.value === feelingScale)
    const label = matchingOption ? `${matchingOption.label} (${matchingOption.value}/${FEELING_SCALE_MAX})` : ''

    return label
}
