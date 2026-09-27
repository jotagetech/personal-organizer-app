import { useEffect, useState } from 'react'

import {
    createSession,
    finishSession,
    getSessionForDate,
    replaceSessionWorkout,
    upsertSet,
} from '@/features/workout/api'
import { ExerciseSetRow } from '@/features/workout/ExerciseSetRow'
import { buildWorkoutSnapshot } from '@/features/workout/snapshot'
import {
    setKey,
    type WorkoutSessionRow,
    type WorkoutSetRow,
    type WorkoutSnapshot,
    type WorkoutSnapshotExercise,
} from '@/features/workout/types'
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
    const [isFinishing, setIsFinishing] = useState(false)

    useEffect(() => {
        let isCancelled = false

        async function load() {
            setIsLoading(true)
            const existing = await getSessionForDate(sessionDate)
            if (isCancelled) {
                return
            }

            if (existing) {
                applyExistingSession(existing.session, existing.sets)
                setIsLoading(false)
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
            setIsLoading(false)
        }

        void load()
        return () => {
            isCancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionDate, plan])

    function applyExistingSession(existingSession: WorkoutSessionRow, sets: WorkoutSetRow[]) {
        const nextSetsByKey = new Map<string, WorkoutSetRow>()
        for (const set of sets) {
            nextSetsByKey.set(setKey(set.exercise_key, set.set_index), set)
        }

        setSession(existingSession)
        setSnapshot(existingSession.workout_snapshot)
        setSetsByKey(nextSetsByKey)
        setWorkoutChoices(null)
    }

    function startUnsavedWorkout(workout: Workout) {
        setSnapshot(buildWorkoutSnapshot(workout))
        setSession(null)
        setSetsByKey(new Map())
        setWorkoutChoices(null)
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

    async function handleCompleteExercise(exercicio: WorkoutSnapshotExercise, isLastExercise: boolean) {
        if (!session) {
            return
        }

        setIsFinishing(isLastExercise)
        try {
            const completions = exercicio.series.map(async (set) => {
                const currentSet = setsByKey.get(setKey(exercicio.exercise_key, set.set_index))
                const isReadyToComplete =
                    currentSet && currentSet.load_kg !== null && currentSet.reps !== null && !currentSet.completed_at
                if (!isReadyToComplete) {
                    return
                }

                const savedSet = await upsertSet({
                    sessionId: session.id,
                    exerciseKey: exercicio.exercise_key,
                    setIndex: set.set_index,
                    loadKg: currentSet.load_kg,
                    reps: currentSet.reps,
                    completedAt: new Date().toISOString(),
                })
                handleSetSaved(savedSet)
            })
            await Promise.all(completions)

            if (isLastExercise) {
                const finishedSession = await finishSession(session.id)
                setSession(finishedSession)
            }
        } finally {
            setIsFinishing(false)
        }
    }

    if (isLoading) {
        return <p>Carregando treino...</p>
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

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h2 style={{ fontSize: 16, margin: 0 }}>{snapshot.nome}</h2>
                <button type="button" className="secondary-button" onClick={handleRequestSwitchWorkout}>
                    Trocar treino
                </button>
            </div>
            {snapshot.exercicios.map((exercicio, exercicioIndex) => {
                const isLastExercise = exercicioIndex === snapshot.exercicios.length - 1

                return (
                    <div key={exercicio.exercise_key} style={{ marginBottom: 16 }}>
                        <h3 style={{ fontSize: 14, marginBottom: 6 }}>{exercicio.nome}</h3>
                        {exercicio.series.map((set) => (
                            <ExerciseSetRow
                                key={set.set_index}
                                sessionId={session?.id ?? null}
                                exerciseKey={exercicio.exercise_key}
                                setIndex={set.set_index}
                                repeticoesMin={set.repeticoes_min}
                                repeticoesMax={set.repeticoes_max}
                                cargaSugerida={set.carga_sugerida}
                                existingSet={setsByKey.get(setKey(exercicio.exercise_key, set.set_index))}
                                onSessionNeeded={ensureSession}
                                onSaved={handleSetSaved}
                            />
                        ))}
                        <button
                            type="button"
                            className={isLastExercise ? 'primary-button' : 'secondary-button'}
                            style={{ width: '100%' }}
                            disabled={isFinishing}
                            onClick={() => handleCompleteExercise(exercicio, isLastExercise)}
                        >
                            {isLastExercise ? 'Finalizar treino do dia' : 'Concluir exercício'}
                        </button>
                    </div>
                )
            })}
            {session?.finished_at && (
                <WorkoutFinishPanel
                    session={session}
                    sessionDate={sessionDate}
                    onSessionUpdated={setSession}
                />
            )}
        </div>
    )
}
