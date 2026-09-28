import { useEffect, useState } from 'react'

import {
    createSession,
    finishSession,
    getSessionForDate,
    replaceSessionWorkout,
} from '@/features/workout/api'
import { ExerciseSetRow } from '@/features/workout/ExerciseSetRow'
import { buildWorkoutSnapshot } from '@/features/workout/snapshot'
import {
    setKey,
    type WorkoutSessionRow,
    type WorkoutSetRow,
    type WorkoutSnapshot,
} from '@/features/workout/types'
import {
    advancePosition,
    findFirstIncompletePosition,
    isLastPosition,
    positionToGlobalIndex,
    retreatPosition,
    totalSetCount,
    type StepPosition,
} from '@/features/workout/sessionProgress'
import { WorkoutFinishPanel } from '@/features/workout/WorkoutFinishPanel'
import { suggestWorkoutForWeekday } from '@/features/workout/workoutSelection'
import { weekdayOfIsoDate, type IsoDate } from '@/lib/dateUtils'
import type { Workout, WorkoutPlan } from '@/lib/workoutPlanSchema'

type WorkoutSessionViewProps = {
    plan: WorkoutPlan
    planId: string
    sessionDate: IsoDate
}

export function WorkoutSessionView({ plan, planId, sessionDate }: WorkoutSessionViewProps) {
    const [isLoading, setIsLoading] = useState(true)
    const [session, setSession] = useState<WorkoutSessionRow | null>(null)
    const [snapshot, setSnapshot] = useState<WorkoutSnapshot | null>(null)
    const [setsByKey, setSetsByKey] = useState<Map<string, WorkoutSetRow>>(new Map())
    const [workoutChoices, setWorkoutChoices] = useState<Workout[] | null>(null)
    const [position, setPosition] = useState<StepPosition | null>(null)
    const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null)

    useEffect(() => {
        let isCancelled = false

        async function load() {
            setIsLoading(true)
            setLoadErrorMessage(null)
            try {
                const existing = await getSessionForDate(sessionDate)
                if (isCancelled) {
                    return
                }

                if (existing) {
                    await applyExistingSession(existing.session, existing.sets)
                    return
                }

                const weekday = weekdayOfIsoDate(sessionDate)
                const suggestion = suggestWorkoutForWeekday(plan, weekday)

                if (suggestion.kind === 'single') {
                    startUnsavedWorkout(suggestion.workout)
                } else if (suggestion.kind === 'choose_one') {
                    setWorkoutChoices(suggestion.workouts)
                    setSnapshot(null)
                    setSession(null)
                    setSetsByKey(new Map())
                } else {
                    setWorkoutChoices(suggestion.availableWorkouts)
                    setSnapshot(null)
                    setSession(null)
                    setSetsByKey(new Map())
                }
            } catch (loadError) {
                if (isCancelled) {
                    return
                }
                const message = loadError instanceof Error ? loadError.message : 'Falha ao carregar treino'
                setLoadErrorMessage(message)
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionDate, plan])

    async function applyExistingSession(existingSession: WorkoutSessionRow, sets: WorkoutSetRow[]) {
        const nextSetsByKey = new Map<string, WorkoutSetRow>()
        for (const set of sets) {
            nextSetsByKey.set(setKey(set.exercise_key, set.set_index), set)
        }

        setSession(existingSession)
        setSnapshot(existingSession.workout_snapshot)
        setSetsByKey(nextSetsByKey)
        setWorkoutChoices(null)

        const resumePosition = findFirstIncompletePosition(existingSession.workout_snapshot, nextSetsByKey)
        setPosition(resumePosition)

        const allSetsAlreadyCompleted = resumePosition === null
        if (allSetsAlreadyCompleted && !existingSession.finished_at) {
            const finishedSession = await finishSession(existingSession.id)
            setSession(finishedSession)
        }
    }

    function startUnsavedWorkout(workout: Workout) {
        const nextSnapshot = buildWorkoutSnapshot(workout)
        setSnapshot(nextSnapshot)
        setSession(null)
        setSetsByKey(new Map())
        setWorkoutChoices(null)
        setPosition({ exerciseIndex: 0, setIndexInExercise: 0 })
    }

    async function handleChooseWorkout(workout: Workout) {
        if (session) {
            const confirmedDiscard = window.confirm(
                'Trocar o treino descarta os registros já feitos nesta data. Continuar?',
            )
            if (!confirmedDiscard) {
                return
            }

            const nextSnapshot = buildWorkoutSnapshot(workout)
            await replaceSessionWorkout({ sessionId: session.id, planId, snapshot: nextSnapshot })
            setSnapshot(nextSnapshot)
            setSession({ ...session, workout_snapshot: nextSnapshot, finished_at: null })
            setSetsByKey(new Map())
            setWorkoutChoices(null)
            setPosition({ exerciseIndex: 0, setIndexInExercise: 0 })
            return
        }

        startUnsavedWorkout(workout)
    }

    function handleRequestSwitchWorkout() {
        setWorkoutChoices(plan.treinos)
    }

    async function ensureSession(): Promise<string> {
        if (session) {
            return session.id
        }
        if (!snapshot) {
            throw new Error('Nenhum treino selecionado')
        }

        const createdSession = await createSession({ sessionDate, planId, snapshot })
        setSession(createdSession)
        return createdSession.id
    }

    function handleSetSaved(savedSet: WorkoutSetRow) {
        setSetsByKey((previous) => {
            const next = new Map(previous)
            next.set(setKey(savedSet.exercise_key, savedSet.set_index), savedSet)
            return next
        })
    }

    async function handleConfirmed() {
        if (!snapshot || !position) {
            return
        }

        const nextPosition = advancePosition(snapshot, position)
        setPosition(nextPosition)

        if (nextPosition === null) {
            const activeSessionId = session?.id ?? (await ensureSession())
            const finishedSession = await finishSession(activeSessionId)
            setSession(finishedSession)
        }
    }

    function handleGoBack() {
        if (!snapshot || !position) {
            return
        }
        setPosition(retreatPosition(snapshot, position))
    }

    if (isLoading) {
        return <p>Carregando treino...</p>
    }

    if (loadErrorMessage) {
        return <div className="error-list">Falha ao carregar treino: {loadErrorMessage}</div>
    }

    if (workoutChoices) {
        return (
            <div>
                <p>Escolha o treino para este dia:</p>
                {workoutChoices.map((workout) => (
                    <button
                        key={workout.id}
                        type="button"
                        className="secondary-button"
                        style={{ display: 'block', width: '100%', marginBottom: 8, textAlign: 'left' }}
                        onClick={() => handleChooseWorkout(workout)}
                    >
                        {workout.nome}
                    </button>
                ))}
            </div>
        )
    }

    if (!snapshot) {
        return <p>Nenhum treino disponível no plano ativo.</p>
    }

    if (session?.finished_at || !position) {
        return (
            <div>
                <WorkoutSnapshotHeader nome={snapshot.nome} onRequestSwitchWorkout={handleRequestSwitchWorkout} />
                {session && (
                    <WorkoutFinishPanel session={session} sessionDate={sessionDate} onSessionUpdated={setSession} />
                )}
            </div>
        )
    }

    const currentExercicio = snapshot.exercicios[position.exerciseIndex]
    const currentSet = currentExercicio.series[position.setIndexInExercise]
    const isVeryLastSet = isLastPosition(snapshot, position)
    const isVeryFirstSet = position.exerciseIndex === 0 && position.setIndexInExercise === 0
    const completedSetCount = positionToGlobalIndex(snapshot, position)
    const totalSets = totalSetCount(snapshot)

    return (
        <div>
            <WorkoutSnapshotHeader nome={snapshot.nome} onRequestSwitchWorkout={handleRequestSwitchWorkout} />
            <div className="progress-track">
                {Array.from({ length: totalSets }, (_, segmentIndex) => (
                    <span
                        key={segmentIndex}
                        className={
                            segmentIndex < completedSetCount
                                ? 'progress-track__segment progress-track__segment--done'
                                : 'progress-track__segment'
                        }
                    />
                ))}
            </div>
            <p style={{ fontSize: 13, color: '#52525b', marginBottom: 4 }}>
                Exercício {position.exerciseIndex + 1} de {snapshot.exercicios.length} · Série{' '}
                {position.setIndexInExercise + 1} de {currentExercicio.series.length}
            </p>
            <h3 style={{ fontSize: 16, marginTop: 0, marginBottom: 8 }}>{currentExercicio.nome}</h3>
            <ExerciseSetRow
                key={setKey(currentExercicio.exercise_key, currentSet.set_index)}
                sessionId={session?.id ?? null}
                exerciseKey={currentExercicio.exercise_key}
                setIndex={currentSet.set_index}
                repeticoesMin={currentSet.repeticoes_min}
                repeticoesMax={currentSet.repeticoes_max}
                cargaSugerida={currentSet.carga_sugerida}
                existingSet={setsByKey.get(setKey(currentExercicio.exercise_key, currentSet.set_index))}
                confirmLabel={isVeryLastSet ? 'Confirmar e finalizar treino' : 'Confirmar'}
                onSessionNeeded={ensureSession}
                onSaved={handleSetSaved}
                onConfirmed={handleConfirmed}
            />
            {!isVeryFirstSet && (
                <button type="button" className="secondary-button" style={{ marginTop: 8 }} onClick={handleGoBack}>
                    ◀ Voltar
                </button>
            )}
        </div>
    )
}

function WorkoutSnapshotHeader({
    nome,
    onRequestSwitchWorkout,
}: {
    nome: string
    onRequestSwitchWorkout: () => void
}) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>{nome}</h2>
            <button type="button" className="secondary-button" onClick={onRequestSwitchWorkout}>
                Trocar treino
            </button>
        </div>
    )
}
