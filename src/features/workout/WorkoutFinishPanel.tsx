import { Check, ChevronDown, Pencil } from 'lucide-react'
import { useState } from 'react'

import { CardioSection } from '@/features/cardio/CardioSection'
import { FeelingScaleInput } from '@/features/cardio/FeelingScaleInput'
import { feelingEmoji, feelingLabel } from '@/features/cardio/types'
import { summarizeWorkoutSetsWithDrops } from '@/features/results/daySummary'
import type { SetCorrectionTarget } from '@/features/results/SetCorrectionItem'
import { WorkoutSummaryView } from '@/features/results/WorkoutSummaryView'
import { updateSessionFeeling } from '@/features/workout/api'
import { normalizeFeelingNote } from '@/features/workout/feelingDraft'
import { formatDurationMinutes, resolveSessionDuration } from '@/features/workout/sessionDuration'
import { countSetsByStatus } from '@/features/workout/sessionProgress'
import { setKey, type WorkoutSessionRow, type WorkoutSetRow } from '@/features/workout/types'
import type { IsoDate } from '@/lib/dateUtils'
import type { OutboxDropValues } from '@/lib/outbox/outboxQueue'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const BADGE_ICON_SIZE = 18
const BADGE_ICON_STROKE = 3
const ACTION_ICON_SIZE = 18

type WorkoutFinishPanelProps = {
    session: WorkoutSessionRow
    sessionDate: IsoDate
    sets: WorkoutSetRow[]
    dropsBySetKey: Map<string, OutboxDropValues[]>
    onSessionUpdated: (session: WorkoutSessionRow) => void
    // Só vem quando o servidor já tem o treino como finalizado.
    onSetCorrected?: (row: WorkoutSetRow) => void
}

export function WorkoutFinishPanel({
    session,
    sessionDate,
    sets,
    dropsBySetKey,
    onSessionUpdated,
    onSetCorrected,
}: WorkoutFinishPanelProps) {
    const hasSavedFeeling = session.feeling_scale !== null
    const [isEditing, setIsEditing] = useState(!hasSavedFeeling)
    const [draftScale, setDraftScale] = useState<number | null>(session.feeling_scale)
    const [draftNote, setDraftNote] = useState(session.feeling_note ?? '')
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
    const [isDetailOpen, setIsDetailOpen] = useState(false)

    function handleStartEditing() {
        setDraftScale(session.feeling_scale)
        setDraftNote(session.feeling_note ?? '')
        setSaveStatus('idle')
        setIsEditing(true)
    }

    function handleCancelEditing() {
        setSaveStatus('idle')
        setIsEditing(false)
    }

    async function handleSaveFeeling() {
        if (draftScale === null) {
            return
        }
        setSaveStatus('saving')
        try {
            const updatedSession = await updateSessionFeeling(session.id, draftScale, normalizeFeelingNote(draftNote))
            onSessionUpdated(updatedSession)
            setSaveStatus('saved')
            setIsEditing(false)
        } catch {
            setSaveStatus('error')
        }
    }

    const activeWindow = resolveSessionDuration(session, sets)
    const setsByKey = new Map(sets.map((set) => [setKey(set.exercise_key, set.set_index), set]))
    const statusCounts = countSetsByStatus(session.workout_snapshot, setsByKey)
    const workoutSummary = summarizeWorkoutSetsWithDrops(session.workout_snapshot, sets, dropsBySetKey)
    const isSaving = saveStatus === 'saving'
    const correctionTarget: SetCorrectionTarget | undefined = onSetCorrected
        ? { sessionDate, onSetCorrected }
        : undefined

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
                <button
                    type="button"
                    className="secondary-button finish-card__toggle"
                    aria-expanded={isDetailOpen}
                    onClick={() => setIsDetailOpen((wasOpen) => !wasOpen)}
                >
                    {isDetailOpen ? 'Ocultar treino' : 'Ver treino'}
                    <ChevronDown
                        size={ACTION_ICON_SIZE}
                        aria-hidden="true"
                        className={isDetailOpen ? 'finish-card__chevron finish-card__chevron--open' : 'finish-card__chevron'}
                    />
                </button>
                {isDetailOpen && (
                    <div className="finish-card__detail">
                        <WorkoutSummaryView summary={workoutSummary} correctionTarget={correctionTarget} />
                    </div>
                )}
                {isEditing ? (
                    <>
                        <div className="field">
                            <label>Como foi o treino?</label>
                            <FeelingScaleInput value={draftScale} onChange={setDraftScale} />
                        </div>
                        <div className="field field--last">
                            <label htmlFor="workout-feeling-note">Detalhar (opcional)</label>
                            <input
                                id="workout-feeling-note"
                                type="text"
                                value={draftNote}
                                onChange={(event) => setDraftNote(event.target.value)}
                            />
                        </div>
                        <div className="finish-card__actions">
                            <button
                                type="button"
                                className="primary-button"
                                disabled={draftScale === null || isSaving}
                                onClick={handleSaveFeeling}
                            >
                                Salvar avaliação
                            </button>
                            {hasSavedFeeling && (
                                <button
                                    type="button"
                                    className="secondary-button"
                                    disabled={isSaving}
                                    onClick={handleCancelEditing}
                                >
                                    Cancelar
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="finish-feeling">
                        <p className="finish-feeling__title">Como foi o treino?</p>
                        {session.feeling_scale !== null && (
                            <p className="finish-feeling__value">
                                <span aria-hidden="true">{feelingEmoji(session.feeling_scale)}</span>{' '}
                                {session.feeling_scale} · {feelingLabel(session.feeling_scale)}
                            </p>
                        )}
                        {session.feeling_note && <p className="day-workout__note">{session.feeling_note}</p>}
                        <button type="button" className="secondary-button" onClick={handleStartEditing}>
                            <Pencil size={ACTION_ICON_SIZE} aria-hidden="true" />
                            Editar
                        </button>
                    </div>
                )}
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
        return <p className="save-status save-status--error">Falha ao salvar a avaliação. Toque em Salvar avaliação de novo.</p>
    }

    return <p className="save-status">Salvo</p>
}
