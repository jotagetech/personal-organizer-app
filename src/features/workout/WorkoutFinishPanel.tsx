import { Check } from 'lucide-react'
import { useState } from 'react'

import { CardioSection } from '@/features/cardio/CardioSection'
import { FeelingScaleInput } from '@/features/cardio/FeelingScaleInput'
import { updateSessionFeeling } from '@/features/workout/api'
import { deriveSessionActiveWindow, formatDurationMinutes } from '@/features/workout/sessionDuration'
import { countSetsByStatus } from '@/features/workout/sessionProgress'
import { setKey, type WorkoutSessionRow, type WorkoutSetRow } from '@/features/workout/types'
import type { IsoDate } from '@/lib/dateUtils'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const BADGE_ICON_SIZE = 18
const BADGE_ICON_STROKE = 3

type WorkoutFinishPanelProps = {
    session: WorkoutSessionRow
    sessionDate: IsoDate
    sets: WorkoutSetRow[]
    onSessionUpdated: (session: WorkoutSessionRow) => void
}

export function WorkoutFinishPanel({ session, sessionDate, sets, onSessionUpdated }: WorkoutFinishPanelProps) {
    const [feelingNote, setFeelingNote] = useState(session.feeling_note ?? '')
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

    async function handleFeelingScaleChange(feelingScale: number) {
        setSaveStatus('saving')
        try {
            const updatedSession = await updateSessionFeeling(session.id, feelingScale, feelingNote || null)
            onSessionUpdated(updatedSession)
            setSaveStatus('saved')
        } catch {
            setSaveStatus('error')
        }
    }

    async function handleFeelingNoteBlur() {
        if (session.feeling_scale === null) {
            return
        }
        setSaveStatus('saving')
        try {
            const updatedSession = await updateSessionFeeling(
                session.id,
                session.feeling_scale,
                feelingNote.trim() === '' ? null : feelingNote.trim(),
            )
            onSessionUpdated(updatedSession)
            setSaveStatus('saved')
        } catch {
            setSaveStatus('error')
        }
    }

    const activeWindow = deriveSessionActiveWindow(sets)
    const setsByKey = new Map(sets.map((set) => [setKey(set.exercise_key, set.set_index), set]))
    const statusCounts = countSetsByStatus(session.workout_snapshot, setsByKey)

    return (
        <div>
            <div className="card finish-card">
                <div className="finish-card__header">
                    <span className="finish-card__badge">
                        <Check size={BADGE_ICON_SIZE} strokeWidth={BADGE_ICON_STROKE} aria-hidden="true" />
                    </span>
                    <h3 className="page-title">Treino concluído</h3>
                </div>
                <dl className="finish-stats">
                    <div className="finish-stats__item">
                        <dt>{statusCounts.completed === 1 ? 'Concluída' : 'Concluídas'}</dt>
                        <dd>{statusCounts.completed}</dd>
                    </div>
                    <div className="finish-stats__item">
                        <dt>{statusCounts.skipped === 1 ? 'Pulada' : 'Puladas'}</dt>
                        <dd>{statusCounts.skipped}</dd>
                    </div>
                    {activeWindow && (
                        <div className="finish-stats__item finish-stats__item--wide">
                            <dt>Duração</dt>
                            <dd>{formatDurationMinutes(activeWindow.startIso, activeWindow.endIso)}</dd>
                        </div>
                    )}
                </dl>
                <div className="field">
                    <label>Como foi o treino?</label>
                    <FeelingScaleInput value={session.feeling_scale} onChange={handleFeelingScaleChange} />
                </div>
                <div className="field field--last">
                    <label htmlFor="workout-feeling-note">Detalhar (opcional)</label>
                    <input
                        id="workout-feeling-note"
                        type="text"
                        value={feelingNote}
                        onChange={(event) => setFeelingNote(event.target.value)}
                        onBlur={handleFeelingNoteBlur}
                    />
                </div>
                <SaveStatusLabel status={saveStatus} />
            </div>
            <CardioSection sessionDate={sessionDate} />
        </div>
    )
}

function SaveStatusLabel({ status }: { status: SaveStatus }) {
    if (status === 'idle') {
        return null
    }

    if (status === 'saving') {
        return <p className="save-status">Salvando...</p>
    }

    if (status === 'error') {
        return <p className="save-status save-status--error">Falha ao salvar. Toque no sentimento de novo.</p>
    }

    return <p className="save-status">Salvo</p>
}
