import { useEffect, useState } from 'react'

import { finishSession, getSessionForDate, replaceSessionWorkout } from '@/features/workout/api'
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
import { useOutbox } from '@/contexts/OutboxContext'
import { overlayPendingSets, type OutboxOperation, type UpsertSetOperation } from '@/lib/outbox/outboxQueue'
import { weekdayOfIsoDate, type IsoDate } from '@/lib/dateUtils'
import type { Workout, WorkoutPlan } from '@/lib/workoutPlanSchema'

type WorkoutSessionViewProps = {
    plan: WorkoutPlan
    planId: string
    sessionDate: IsoDate
}

export function WorkoutSessionView({ plan, planId, sessionDate }: WorkoutSessionViewProps) {
    const outbox = useOutbox()
    const [isLoading, setIsLoading] = useState(true)
    const [session, setSession] = useState<WorkoutSessionRow | null>(null)
    const [snapshot, setSnapshot] = useState<WorkoutSnapshot | null>(null)
    const [setsByKey, setSetsByKey] = useState<Map<string, WorkoutSetRow>>(new Map())
    const [workoutChoices, setWorkoutChoices] = useState<Workout[] | null>(null)
    const [position, setPosition] = useState<StepPosition | null>(null)
    const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null)
    const [reloadToken, setReloadToken] = useState(0)
    const [isSwitchingWorkout, setIsSwitchingWorkout] = useState(false)
    const [switchWorkoutErrorMessage, setSwitchWorkoutErrorMessage] = useState<string | null>(null)

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

                const pendingOperationsForDate = outbox.getOperationsForDate(sessionDate)
                const pendingSnapshot = findSnapshotInPendingOperations(pendingOperationsForDate)
                if (pendingSnapshot) {
                    resumeFromPendingOperations(pendingSnapshot, pendingOperationsForDate)
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
    }, [sessionDate, plan, reloadToken])

    // Uma sessão nunca sincronizada ainda no servidor (o dia inteiro foi
    // registrado sem sinal) não aparece em getSessionForDate; o treino em
    // andamento continua vindo da própria fila de envio.
    function findSnapshotInPendingOperations(operations: OutboxOperation[]): WorkoutSnapshot | null {
        const upsertOperation = operations.find(
            (operation): operation is UpsertSetOperation => operation.kind === 'upsert_set',
        )
        return upsertOperation?.snapshot ?? null
    }

    function resumeFromPendingOperations(pendingSnapshot: WorkoutSnapshot, operations: OutboxOperation[]) {
        const overlaidSetsByKey = overlayPendingSets(new Map(), operations, sessionDate)
        const isFinishPending = operations.some((operation) => operation.kind === 'finish_session')

        setSnapshot(pendingSnapshot)
        setSession(null)
        setSetsByKey(overlaidSetsByKey)
        setWorkoutChoices(null)
        setPosition(isFinishPending ? null : findFirstIncompletePosition(pendingSnapshot, overlaidSetsByKey))
    }

    async function applyExistingSession(existingSession: WorkoutSessionRow, sets: WorkoutSetRow[]) {
        const nextSetsByKey = new Map<string, WorkoutSetRow>()
        for (const set of sets) {
            nextSetsByKey.set(setKey(set.exercise_key, set.set_index), set)
        }

        const overlaidSetsByKey = overlayPendingSets(
            nextSetsByKey,
            outbox.getOperationsForDate(sessionDate),
            sessionDate,
        )

        setSession(existingSession)
        setSnapshot(existingSession.workout_snapshot)
        setSetsByKey(overlaidSetsByKey)
        setWorkoutChoices(null)

        const resumePosition = findFirstIncompletePosition(existingSession.workout_snapshot, overlaidSetsByKey)
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
        if (!session) {
            startUnsavedWorkout(workout)
            return
        }

        const confirmedDiscard = window.confirm(
            'Trocar o treino descarta os registros já feitos nesta data. Continuar?',
        )
        if (!confirmedDiscard) {
            return
        }

        const nextSnapshot = buildWorkoutSnapshot(workout)
        setIsSwitchingWorkout(true)
        setSwitchWorkoutErrorMessage(null)

        try {
            const updatedSession = await replaceSessionWorkout({
                sessionId: session.id,
                planId,
                snapshot: nextSnapshot,
            })
            setSnapshot(nextSnapshot)
            setSession(updatedSession)
            setSetsByKey(new Map())
            setWorkoutChoices(null)
            setPosition({ exerciseIndex: 0, setIndexInExercise: 0 })
        } catch (switchError) {
            const message =
                switchError instanceof Error ? switchError.message : 'Falha ao trocar o treino'
            setSwitchWorkoutErrorMessage(message)
        } finally {
            setIsSwitchingWorkout(false)
        }
    }

    function handleRequestSwitchWorkout() {
        setWorkoutChoices(plan.treinos)
    }

    function handleLocalSetSaved(row: WorkoutSetRow) {
        setSetsByKey((previous) => {
            const next = new Map(previous)
            next.set(setKey(row.exercise_key, row.set_index), row)
            return next
        })
    }

    function handleConfirmed() {
        if (!snapshot || !position) {
            return
        }

        const nextPosition = advancePosition(snapshot, position)
        setPosition(nextPosition)

        if (nextPosition === null) {
            outbox.enqueueFinishSession(sessionDate)
        }
    }

    function handleGoBack() {
        if (!snapshot || !position) {
            return
        }
        setPosition(retreatPosition(snapshot, position))
    }

    // Treino terminado antes de a sessão ter sido criada no servidor (o dia
    // inteiro foi feito sem sinal): o painel de finalização depende do id real
    // da sessão, então observa a fila até o envio confirmar e revelar esse id.
    useEffect(() => {
        if (!snapshot || position || session) {
            return
        }

        let isCancelled = false

        async function refreshSessionAfterSync() {
            try {
                const existing = await getSessionForDate(sessionDate)
                if (!isCancelled && existing) {
                    setSession(existing.session)
                }
            } catch {
                // mantém o estado otimista de treino concluído; a próxima
                // mudança na fila de envio tenta buscar de novo
            }
        }

        void refreshSessionAfterSync()
        return () => {
            isCancelled = true
        }
    }, [snapshot, position, session, sessionDate, outbox.pendingCount])

    if (isLoading) {
        return <p>Carregando treino...</p>
    }

    if (loadErrorMessage) {
        return (
            <div className="error-list">
                Falha ao carregar treino: {loadErrorMessage}
                <button
                    type="button"
                    className="secondary-button"
                    style={{ display: 'block', marginTop: 8 }}
                    onClick={() => setReloadToken((token) => token + 1)}
                >
                    Tentar de novo
                </button>
            </div>
        )
    }

    if (workoutChoices) {
        return (
            <div>
                <p>Escolha o treino para este dia:</p>
                {switchWorkoutErrorMessage && (
                    <div className="error-list" style={{ marginBottom: 8 }}>
                        {switchWorkoutErrorMessage}
                    </div>
                )}
                {workoutChoices.map((workout) => (
                    <button
                        key={workout.id}
                        type="button"
                        className="secondary-button"
                        style={{ display: 'block', width: '100%', marginBottom: 8, textAlign: 'left' }}
                        disabled={isSwitchingWorkout}
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

    const effectiveSetsByKey = overlayPendingSets(setsByKey, outbox.getOperationsForDate(sessionDate), sessionDate)

    if (session?.finished_at || !position) {
        return (
            <div>
                <WorkoutSnapshotHeader nome={snapshot.nome} onRequestSwitchWorkout={handleRequestSwitchWorkout} />
                {session ? (
                    <WorkoutFinishPanel session={session} sessionDate={sessionDate} onSessionUpdated={setSession} />
                ) : (
                    <p className="save-status">Treino concluído no aparelho, sincronizando com o servidor...</p>
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
                sessionDate={sessionDate}
                planId={planId}
                snapshot={snapshot}
                exerciseKey={currentExercicio.exercise_key}
                setIndex={currentSet.set_index}
                repeticoesMin={currentSet.repeticoes_min}
                repeticoesMax={currentSet.repeticoes_max}
                cargaSugerida={currentSet.carga_sugerida}
                existingSet={effectiveSetsByKey.get(setKey(currentExercicio.exercise_key, currentSet.set_index))}
                confirmLabel={isVeryLastSet ? 'Confirmar e finalizar treino' : 'Confirmar'}
                onConfirmed={handleConfirmed}
                onLocalSave={handleLocalSetSaved}
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
