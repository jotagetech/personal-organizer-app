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
import { deriveSessionActiveWindow } from '@/features/workout/sessionDuration'
import {
    buildSkipValuesForRemainingSets,
    findFirstIncompletePosition,
    findNextUnresolvedPosition,
    firstUnresolvedSetInExercise,
    isOnlyUnresolvedSet,
    retreatPosition,
    setStatusOf,
    summarizeExerciseProgress,
    type ExerciseProgress,
    type StepPosition,
} from '@/features/workout/sessionProgress'
import { WorkoutFinishPanel } from '@/features/workout/WorkoutFinishPanel'
import { suggestWorkoutForWeekday } from '@/features/workout/workoutSelection'
import { useDayStatus } from '@/contexts/DayStatusContext'
import { useOutbox } from '@/contexts/OutboxContext'
import {
    buildOverlaySetRow,
    overlayPendingSets,
    type OutboxOperation,
    type UpsertSetOperation,
} from '@/lib/outbox/outboxQueue'
import { weekdayOfIsoDate, type IsoDate } from '@/lib/dateUtils'
import type { Workout, WorkoutPlan } from '@/lib/workoutPlanSchema'

type WorkoutSessionViewProps = {
    plan: WorkoutPlan
    planId: string
    sessionDate: IsoDate
}

export function WorkoutSessionView({ plan, planId, sessionDate }: WorkoutSessionViewProps) {
    const outbox = useOutbox()
    const { refreshDayStatus } = useDayStatus()
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
    const [isExercisePickerOpen, setIsExercisePickerOpen] = useState(false)

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

        const allSetsAlreadyResolved = resumePosition === null
        if (allSetsAlreadyResolved && !existingSession.finished_at) {
            // Fechar o treino só ao reabrir a data não pode carimbar a hora da
            // reabertura: o fim real é a última série concluída, quando existe.
            const activeWindow = deriveSessionActiveWindow(Array.from(overlaidSetsByKey.values()))
            const finishedSession = await finishSession(existingSession.id, activeWindow?.endIso)
            setSession(finishedSession)
            refreshDayStatus()
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

    function currentEffectiveSetsByKey(): Map<string, WorkoutSetRow> {
        return overlayPendingSets(setsByKey, outbox.getOperationsForDate(sessionDate), sessionDate)
    }

    function moveToNextUnresolved(resolvedSetsByKey: Map<string, WorkoutSetRow>) {
        if (!snapshot || !position) {
            return
        }

        const nextPosition = findNextUnresolvedPosition(snapshot, resolvedSetsByKey, position)
        setPosition(nextPosition)
        setIsExercisePickerOpen(false)

        if (nextPosition === null) {
            outbox.enqueueFinishSession(sessionDate)
            refreshDayStatus()
        }
    }

    // O estado (setsByKey e a fila) ainda não reflete a série recém-salva
    // neste mesmo tick, então a próxima posição é calculada sobre um mapa que
    // já inclui a linha devolvida pela série.
    function mergeSavedRow(row: WorkoutSetRow): Map<string, WorkoutSetRow> {
        return new Map(currentEffectiveSetsByKey()).set(setKey(row.exercise_key, row.set_index), row)
    }

    function handleSetResolved(row: WorkoutSetRow) {
        moveToNextUnresolved(mergeSavedRow(row))
    }

    function handleSkipExercise(row: WorkoutSetRow) {
        if (!snapshot || !position) {
            return
        }

        const exercicio = snapshot.exercicios.find((candidate) => candidate.exercise_key === row.exercise_key)
        if (!exercicio) {
            return
        }

        const mergedSetsByKey = mergeSavedRow(row)
        const skipValues = buildSkipValuesForRemainingSets(exercicio, mergedSetsByKey, new Date().toISOString())
        if (skipValues.length === 0) {
            moveToNextUnresolved(mergedSetsByKey)
            return
        }

        const confirmedSkip = window.confirm(`Pular as ${skipValues.length} séries restantes de ${exercicio.nome}?`)
        if (!confirmedSkip) {
            return
        }

        const upsertInputs = skipValues.map(({ setIndex, values }) => ({
            sessionDate,
            planId,
            snapshot,
            exerciseKey: exercicio.exercise_key,
            setIndex,
            values,
        }))
        outbox.enqueueUpsertSets(upsertInputs)

        const enqueuedAt = new Date().toISOString()
        const skippedRows = upsertInputs.map((input) => {
            const key = setKey(input.exerciseKey, input.setIndex)
            const skippedRow = buildOverlaySetRow(
                { kind: 'upsert_set', ...input, enqueuedAt, attempts: 0, status: 'pending' },
                mergedSetsByKey.get(key),
            )
            mergedSetsByKey.set(key, skippedRow)
            return skippedRow
        })

        setSetsByKey((previous) => {
            const next = new Map(previous)
            for (const skippedRow of skippedRows) {
                next.set(setKey(skippedRow.exercise_key, skippedRow.set_index), skippedRow)
            }
            return next
        })
        moveToNextUnresolved(mergedSetsByKey)
    }

    function handleSelectExercise(exerciseIndex: number) {
        if (!snapshot) {
            return
        }
        setPosition(firstUnresolvedSetInExercise(snapshot, currentEffectiveSetsByKey(), exerciseIndex))
        setIsExercisePickerOpen(false)
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
                    <WorkoutFinishPanel
                        session={session}
                        sessionDate={sessionDate}
                        sets={Array.from(effectiveSetsByKey.values())}
                        onSessionUpdated={setSession}
                    />
                ) : (
                    <p className="save-status">Treino concluído no aparelho, sincronizando com o servidor...</p>
                )}
            </div>
        )
    }

    const currentExercicio = snapshot.exercicios[position.exerciseIndex]
    const currentSet = currentExercicio.series[position.setIndexInExercise]
    const isFinalUnresolvedSet = isOnlyUnresolvedSet(snapshot, effectiveSetsByKey, position)
    const isVeryFirstSet = position.exerciseIndex === 0 && position.setIndexInExercise === 0
    const segmentStatuses = snapshot.exercicios.flatMap((exercicio) =>
        exercicio.series.map((serie) =>
            setStatusOf(effectiveSetsByKey.get(setKey(exercicio.exercise_key, serie.set_index))),
        ),
    )

    return (
        <div>
            <WorkoutSnapshotHeader nome={snapshot.nome} onRequestSwitchWorkout={handleRequestSwitchWorkout} />
            <ExercisePicker
                progress={summarizeExerciseProgress(snapshot, effectiveSetsByKey)}
                currentExerciseIndex={position.exerciseIndex}
                isOpen={isExercisePickerOpen}
                onToggle={() => setIsExercisePickerOpen((isOpen) => !isOpen)}
                onSelect={handleSelectExercise}
            />
            <div className="progress-track">
                {segmentStatuses.map((status, segmentIndex) => (
                    <span key={segmentIndex} className={PROGRESS_SEGMENT_CLASS_BY_STATUS[status]} />
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
                confirmLabel={isFinalUnresolvedSet ? 'Confirmar e finalizar treino' : 'Confirmar'}
                onConfirmed={handleSetResolved}
                onSkipped={handleSetResolved}
                onSkipExercise={handleSkipExercise}
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

const PROGRESS_SEGMENT_CLASS_BY_STATUS = {
    completed: 'progress-track__segment progress-track__segment--done',
    skipped: 'progress-track__segment progress-track__segment--skipped',
    pending: 'progress-track__segment',
} as const

type ExercisePickerProps = {
    progress: ExerciseProgress[]
    currentExerciseIndex: number
    isOpen: boolean
    onToggle: () => void
    onSelect: (exerciseIndex: number) => void
}

function ExercisePicker({ progress, currentExerciseIndex, isOpen, onToggle, onSelect }: ExercisePickerProps) {
    return (
        <div className="exercise-picker">
            <button type="button" className="exercise-picker__toggle" aria-expanded={isOpen} onClick={onToggle}>
                Exercícios · {currentExerciseIndex + 1} de {progress.length} {isOpen ? '▴' : '▾'}
            </button>
            {isOpen && (
                <div className="exercise-picker__list">
                    {progress.map((exercise) => (
                        <button
                            key={exercise.exerciseIndex}
                            type="button"
                            className={exercisePickerItemClass(exercise, currentExerciseIndex)}
                            aria-current={exercise.exerciseIndex === currentExerciseIndex ? 'step' : undefined}
                            onClick={() => onSelect(exercise.exerciseIndex)}
                        >
                            <span>{exercise.nome}</span>
                            <span className="exercise-picker__status">{formatExerciseStatus(exercise)}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

function exercisePickerItemClass(exercise: ExerciseProgress, currentExerciseIndex: number): string {
    const classNames = ['exercise-picker__item']
    if (exercise.exerciseIndex === currentExerciseIndex) {
        classNames.push('exercise-picker__item--current')
    }
    if (exercise.skipped === exercise.total) {
        classNames.push('exercise-picker__item--skipped')
    } else if (exercise.completed + exercise.skipped === exercise.total) {
        classNames.push('exercise-picker__item--done')
    }

    return classNames.join(' ')
}

function formatExerciseStatus(exercise: ExerciseProgress): string {
    if (exercise.skipped === exercise.total) {
        return 'pulado'
    }
    if (exercise.completed === exercise.total) {
        return '✓'
    }
    const skippedSuffix = exercise.skipped > 0 ? ` · ${exercise.skipped} pulada(s)` : ''

    return `${exercise.completed}/${exercise.total}${skippedSuffix}`
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
