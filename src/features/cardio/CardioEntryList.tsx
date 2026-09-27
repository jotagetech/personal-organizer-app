import { FEELING_SCALE_OPTIONS } from '@/features/cardio/types'
import type { CardioActivityTypeRow, CardioEntryRow } from '@/features/cardio/types'

type CardioEntryListProps = {
    entries: CardioEntryRow[]
    activityTypes: CardioActivityTypeRow[]
    onDelete: (entryId: string) => Promise<void>
}

export function CardioEntryList({ entries, activityTypes, onDelete }: CardioEntryListProps) {
    if (entries.length === 0) {
        return null
    }

    return (
        <div>
            {entries.map((entry) => (
                <div key={entry.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <strong>{activityTypeName(activityTypes, entry.activity_type_id)}</strong>
                            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#52525b' }}>
                                {entry.duration_minutes} min
                                {entry.distance_km !== null ? ` · ${entry.distance_km} km` : ''}
                                {` · ${feelingEmoji(entry.feeling_scale)}`}
                            </p>
                            {entry.feeling_note && (
                                <p style={{ margin: '2px 0 0', fontSize: 13 }}>{entry.feeling_note}</p>
                            )}
                            {entry.note && <p style={{ margin: '2px 0 0', fontSize: 13 }}>{entry.note}</p>}
                        </div>
                        <button
                            type="button"
                            className="secondary-button"
                            onClick={() => handleDeleteClick(entry.id, onDelete)}
                        >
                            Excluir
                        </button>
                    </div>
                </div>
            ))}
        </div>
    )
}

async function handleDeleteClick(entryId: string, onDelete: (entryId: string) => Promise<void>) {
    const confirmedDeletion = window.confirm('Excluir este registro de cardio?')
    if (!confirmedDeletion) {
        return
    }
    await onDelete(entryId)
}

function activityTypeName(activityTypes: CardioActivityTypeRow[], activityTypeId: string): string {
    const matchingType = activityTypes.find((activityType) => activityType.id === activityTypeId)
    const name = matchingType?.name ?? 'Atividade'

    return name
}

function feelingEmoji(feelingScale: number): string {
    const matchingOption = FEELING_SCALE_OPTIONS.find((option) => option.value === feelingScale)
    const emoji = matchingOption?.emoji ?? ''

    return emoji
}
