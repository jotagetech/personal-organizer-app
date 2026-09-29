import { useState } from 'react'

import { CardioSection } from '@/features/cardio/CardioSection'
import { FeelingScaleInput } from '@/features/cardio/FeelingScaleInput'
import { updateSessionFeeling } from '@/features/workout/api'
import { deriveSessionActiveWindow, formatDurationMinutes } from '@/features/workout/sessionDuration'
import { countSetsByStatus } from '@/features/workout/sessionProgress'
import { setKey, type WorkoutSessionRow, type WorkoutSetRow } from '@/features/workout/types'
import type { IsoDate } from '@/lib/dateUtils'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

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
            <div className="card">
                <p style={{ marginTop: 0, marginBottom: 4, fontWeight: 600 }}>Treino concluído</p>
                <p style={{ marginTop: 0, fontSize: 13, color: '#52525b' }}>
                    {statusCounts.completed} {statusCounts.completed === 1 ? 'concluída' : 'concluídas'} ·{' '}
                    {statusCounts.skipped} {statusCounts.skipped === 1 ? 'pulada' : 'puladas'}
                    {activeWindow &&
                        ` · Duração: ${formatDurationMinutes(activeWindow.startIso, activeWindow.endIso)}`}
                </p>
                <div className="field">
                    <label>Como foi o treino?</label>
                    <FeelingScaleInput value={session.feeling_scale} onChange={handleFeelingScaleChange} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
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
