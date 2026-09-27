import { useState } from 'react'

import { CardioSection } from '@/features/cardio/CardioSection'
import { FeelingScaleInput } from '@/features/cardio/FeelingScaleInput'
import { updateSessionFeeling } from '@/features/workout/api'
import type { WorkoutSessionRow } from '@/features/workout/types'
import type { IsoDate } from '@/lib/dateUtils'

type WorkoutFinishPanelProps = {
    session: WorkoutSessionRow
    sessionDate: IsoDate
    onSessionUpdated: (session: WorkoutSessionRow) => void
}

export function WorkoutFinishPanel({ session, sessionDate, onSessionUpdated }: WorkoutFinishPanelProps) {
    const [feelingNote, setFeelingNote] = useState(session.feeling_note ?? '')

    async function handleFeelingScaleChange(feelingScale: number) {
        const updatedSession = await updateSessionFeeling(session.id, feelingScale, feelingNote || null)
        onSessionUpdated(updatedSession)
    }

    async function handleFeelingNoteBlur() {
        if (session.feeling_scale === null) {
            return
        }
        const updatedSession = await updateSessionFeeling(
            session.id,
            session.feeling_scale,
            feelingNote.trim() === '' ? null : feelingNote.trim(),
        )
        onSessionUpdated(updatedSession)
    }

    return (
        <div>
            <div className="card">
                <p style={{ marginTop: 0, fontWeight: 600 }}>Treino concluído</p>
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
            </div>
            <CardioSection sessionDate={sessionDate} />
        </div>
    )
}
