import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react'

import {
    appendSessionExercise,
    clearSessionStart,
    createSession,
    deleteSessionForDate,
    finishSession,
    getSessionForDate,
    recordSessionPause,
    recordSessionStart,
    upsertSet,
} from '@/features/workout/api'
import type { WorkoutSnapshot, WorkoutSnapshotExercise } from '@/features/workout/types'
import { isRecordableSessionDate } from '@/features/workout/recordableDate'
import { todayInTimezone } from '@/lib/dateUtils'
import {
    cancelSessionStart,
    countByStatus,
    deleteSessionFromQueue,
    enqueueOperations,
    hasSessionDeletion,
    isEnqueueableOperation,
    nextBackoffDelayMs,
    operationsForDate,
    operationsWithStatus,
    removeOperation,
    removePendingExtraExercises,
    retryFailedOperation,
    type AddExtraExerciseOperation,
    type OutboxOperation,
    type OutboxSetValues,
    type SessionPauseValues,
    type StartSessionOperation,
    type UpsertSetOperation,
} from '@/lib/outbox/outboxQueue'
import { runSendPass, type OutboxTransport } from '@/lib/outbox/outboxSender'
import { loadOutboxQueue, saveOutboxQueue } from '@/lib/outbox/outboxStorage'

type EnqueueUpsertSetInput = {
    sessionDate: string
    planId: string
    snapshot: WorkoutSnapshot
    exerciseKey: string
    setIndex: number
    values: OutboxSetValues
}

type EnqueueStartSessionInput = {
    sessionDate: string
    planId: string
    snapshot: WorkoutSnapshot
    startedAt: string
}

type EnqueueAddExtraExerciseInput = {
    sessionDate: string
    planId: string
    snapshot: WorkoutSnapshot
    exercise: WorkoutSnapshotExercise
}

type OutboxContextValue = {
    pendingCount: number
    failedCount: number
    isOnline: boolean
    getOperationsForDate: (sessionDate: string) => OutboxOperation[]
    enqueueUpsertSet: (input: EnqueueUpsertSetInput) => void
    // Grava a série só no aparelho (a fila persiste no localStorage), sem
    // disparar envio: é o que a digitação usa, para não mandar uma escrita ao
    // servidor a cada pausa entre teclas. O envio acontece em syncNow, ao sair
    // do campo, ou no próximo ciclo da fila.
    stageUpsertSet: (input: EnqueueUpsertSetInput) => void
    syncNow: () => void
    enqueueUpsertSets: (inputs: EnqueueUpsertSetInput[]) => void
    // Quem chama escolhe a hora (início e fim do treino), para a tela mostrar
    // exatamente o mesmo horário que vai para o servidor.
    enqueueStartSession: (input: EnqueueStartSessionInput) => void
    enqueueFinishSession: (sessionDate: string, finishedAt: string) => void
    // O snapshot é o do treino já com o extra, para a operação criar a sessão
    // sozinha quando ela ainda não existe no servidor.
    enqueueAddExtraExercise: (input: EnqueueAddExtraExerciseInput) => void
    discardPendingExtraExercises: (sessionDate: string) => void
    // O estado da pausa já vem calculado por quem chama, com a hora do toque.
    enqueuePauseSession: (sessionDate: string, pause: SessionPauseValues, pausedAt: string) => void
    enqueueResumeSession: (sessionDate: string, pause: SessionPauseValues, resumedAt: string) => void
    cancelSessionStart: (sessionDate: string, cancelledAt: string) => void
    // Troca tudo o que a data tem na fila pela exclusão da sessão dela.
    deleteSession: (sessionDate: string) => void
    // Lê a fila atual, não a da última renderização: quem chama pode estar no
    // meio de uma leitura assíncrona que começou antes da exclusão.
    hasPendingSessionDeletion: (sessionDate: string) => boolean
    discardOperation: (naturalKey: string) => void
    retryOperation: (naturalKey: string) => void
    listFailedOperations: () => OutboxOperation[]
}

const OutboxContext = createContext<OutboxContextValue | null>(null)

function buildUpsertSetOperation(input: EnqueueUpsertSetInput, enqueuedAt: string): UpsertSetOperation {
    return {
        kind: 'upsert_set',
        sessionDate: input.sessionDate,
        planId: input.planId,
        snapshot: input.snapshot,
        exerciseKey: input.exerciseKey,
        setIndex: input.setIndex,
        values: input.values,
        enqueuedAt,
        attempts: 0,
        status: 'pending',
    }
}

function buildStartSessionOperation(input: EnqueueStartSessionInput): StartSessionOperation {
    return {
        kind: 'start_session',
        sessionDate: input.sessionDate,
        planId: input.planId,
        snapshot: input.snapshot,
        enqueuedAt: input.startedAt,
        attempts: 0,
        status: 'pending',
    }
}

function buildAddExtraExerciseOperation(input: EnqueueAddExtraExerciseInput): AddExtraExerciseOperation {
    return {
        kind: 'add_extra_exercise',
        sessionDate: input.sessionDate,
        planId: input.planId,
        snapshot: input.snapshot,
        exercise: input.exercise,
        enqueuedAt: new Date().toISOString(),
        attempts: 0,
        status: 'pending',
    }
}

// As chamadas do envio ao servidor; a passada em si (ordem, corrida com a
// fila, bloqueio por data) mora em outboxSender.ts.
const SUPABASE_TRANSPORT: OutboxTransport = {
    ensureSession: async (step) => {
        const ensuredSession = await createSession({
            sessionDate: step.sessionDate,
            planId: step.planId,
            snapshot: step.snapshot,
        })
        return ensuredSession.id
    },
    findSessionId: async (sessionDate) => {
        const existingSession = await getSessionForDate(sessionDate)
        return existingSession?.session.id ?? null
    },
    upsertSet: async (sessionId, operation) => {
        await upsertSet({
            sessionId,
            exerciseKey: operation.exerciseKey,
            setIndex: operation.setIndex,
            loadKg: operation.values.loadKg,
            reps: operation.values.reps,
            rir: operation.values.rir,
            note: operation.values.note,
            completedAt: operation.values.completedAt,
            skippedAt: operation.values.skippedAt,
            metric: operation.values.metric,
            durationSeconds: operation.values.durationSeconds,
            distanceM: operation.values.distanceM,
            drops: operation.values.drops,
            rpe: operation.values.rpe,
        })
    },
    recordSessionStart,
    appendSessionExercise,
    recordSessionPause,
    clearSessionStart,
    finishSession: async (sessionId, finishedAt) => {
        await finishSession(sessionId, finishedAt)
    },
    deleteSession: deleteSessionForDate,
}

export function OutboxProvider({ children }: { children: ReactNode }) {
    const [queue, setQueue] = useState<OutboxOperation[]>(() => loadOutboxQueue(window.localStorage))
    const [isOnline, setIsOnline] = useState(() => navigator.onLine)
    const queueRef = useRef(queue)
    const isFlushingRef = useRef(false)
    // A operação que está sendo enviada agora: cancelar o início precisa
    // saber se ele pode estar chegando ao servidor neste instante.
    const inFlightOperationRef = useRef<OutboxOperation | null>(null)
    const backoffDelayRef = useRef<number | null>(null)
    const backoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    // scheduleNextFlush precisa disparar o próximo ciclo completo (flush + novo
    // agendamento), mas é definido antes de runFlushCycle existir; uma ref
    // sempre atualizada evita depender da ordem de declaração das duas funções.
    const runFlushCycleRef = useRef<() => Promise<void>>(async () => {})

    const updateQueue = useCallback((nextQueue: OutboxOperation[]) => {
        queueRef.current = nextQueue
        try {
            saveOutboxQueue(window.localStorage, nextQueue)
        } catch {
            // Sem espaço ou sem acesso ao localStorage (modo privado, por
            // exemplo): a fila continua funcionando só em memória nesta
            // sessão, em vez de derrubar o app inteiro.
        }
        setQueue(nextQueue)
    }, [])

    // Nenhum caminho (retomada, finalização automática, efeito ao abrir a
    // tela) registra treino em data futura, mesmo que a tela deixe passar.
    const enqueueRecordable = useCallback(
        (operations: OutboxOperation[]): boolean => {
            const today = todayInTimezone()
            const recordableOperations = operations.filter((operation) => isEnqueueableOperation(operation, today))
            if (recordableOperations.length === 0) {
                return false
            }
            updateQueue(enqueueOperations(queueRef.current, recordableOperations))
            return true
        },
        [updateQueue],
    )

    const flushOnce = useCallback(async () => {
        if (isFlushingRef.current) {
            return
        }
        isFlushingRef.current = true

        try {
            const madeProgress = await runSendPass(
                {
                    read: () => queueRef.current,
                    write: updateQueue,
                    setInFlight: (operation) => {
                        inFlightOperationRef.current = operation
                    },
                },
                SUPABASE_TRANSPORT,
            )
            backoffDelayRef.current = madeProgress ? null : nextBackoffDelayMs(backoffDelayRef.current)
        } finally {
            isFlushingRef.current = false
        }
    }, [updateQueue])

    const scheduleNextFlush = useCallback(() => {
        if (backoffTimerRef.current) {
            clearTimeout(backoffTimerRef.current)
            backoffTimerRef.current = null
        }

        const { pending } = countByStatus(queueRef.current)
        if (pending === 0) {
            return
        }

        const delayMs = backoffDelayRef.current ?? nextBackoffDelayMs(null)
        backoffTimerRef.current = setTimeout(() => {
            void runFlushCycleRef.current()
        }, delayMs)
    }, [])

    const runFlushCycle = useCallback(async () => {
        await flushOnce()
        scheduleNextFlush()
    }, [flushOnce, scheduleNextFlush])
    runFlushCycleRef.current = runFlushCycle

    useEffect(() => {
        void runFlushCycle()
        return () => {
            if (backoffTimerRef.current) {
                clearTimeout(backoffTimerRef.current)
            }
        }
    }, [runFlushCycle])

    useEffect(() => {
        function handleOnline() {
            setIsOnline(true)
            void runFlushCycle()
        }
        function handleOffline() {
            setIsOnline(false)
        }

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [runFlushCycle])

    useEffect(() => {
        function handleVisibilityChange() {
            if (!document.hidden) {
                void runFlushCycle()
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [runFlushCycle])

    const contextValue = useMemo<OutboxContextValue>(() => {
        const { pending, failed } = countByStatus(queue)

        function enqueueAndSync(operations: OutboxOperation[]) {
            if (enqueueRecordable(operations)) {
                void runFlushCycle()
            }
        }

        function sessionPauseOperation(
            kind: 'pause_session' | 'resume_session',
            sessionDate: string,
            pause: SessionPauseValues,
            enqueuedAt: string,
        ): OutboxOperation {
            return { kind, sessionDate, pause, enqueuedAt, attempts: 0, status: 'pending' }
        }

        return {
            pendingCount: pending,
            failedCount: failed,
            isOnline,
            getOperationsForDate: (sessionDate: string) => operationsForDate(queue, sessionDate),
            enqueueUpsertSet: (input: EnqueueUpsertSetInput) => {
                enqueueAndSync([buildUpsertSetOperation(input, new Date().toISOString())])
            },
            stageUpsertSet: (input: EnqueueUpsertSetInput) => {
                enqueueRecordable([buildUpsertSetOperation(input, new Date().toISOString())])
            },
            syncNow: () => {
                void runFlushCycle()
            },
            // Várias séries de uma vez (pular exercício) entram numa única
            // gravação da fila e num único ciclo de envio, em vez de disparar
            // um flush por série.
            enqueueUpsertSets: (inputs: EnqueueUpsertSetInput[]) => {
                if (inputs.length === 0) {
                    return
                }
                const enqueuedAt = new Date().toISOString()
                enqueueAndSync(inputs.map((input) => buildUpsertSetOperation(input, enqueuedAt)))
            },
            enqueueStartSession: (input: EnqueueStartSessionInput) => {
                enqueueAndSync([buildStartSessionOperation(input)])
            },
            enqueueFinishSession: (sessionDate: string, finishedAt: string) => {
                enqueueAndSync([
                    { kind: 'finish_session', sessionDate, enqueuedAt: finishedAt, attempts: 0, status: 'pending' },
                ])
            },
            enqueueAddExtraExercise: (input: EnqueueAddExtraExerciseInput) => {
                enqueueAndSync([buildAddExtraExerciseOperation(input)])
            },
            discardPendingExtraExercises: (sessionDate: string) => {
                updateQueue(removePendingExtraExercises(queueRef.current, sessionDate))
            },
            enqueuePauseSession: (sessionDate: string, pause: SessionPauseValues, pausedAt: string) => {
                enqueueAndSync([sessionPauseOperation('pause_session', sessionDate, pause, pausedAt)])
            },
            enqueueResumeSession: (sessionDate: string, pause: SessionPauseValues, resumedAt: string) => {
                enqueueAndSync([sessionPauseOperation('resume_session', sessionDate, pause, resumedAt)])
            },
            cancelSessionStart: (sessionDate: string, cancelledAt: string) => {
                if (!isRecordableSessionDate(sessionDate, todayInTimezone())) {
                    return
                }
                const nextQueue = cancelSessionStart(
                    queueRef.current,
                    sessionDate,
                    cancelledAt,
                    inFlightOperationRef.current,
                )
                updateQueue(nextQueue)
                void runFlushCycle()
            },
            deleteSession: (sessionDate: string) => {
                updateQueue(deleteSessionFromQueue(queueRef.current, sessionDate, new Date().toISOString()))
                void runFlushCycle()
            },
            hasPendingSessionDeletion: (sessionDate: string) => hasSessionDeletion(queueRef.current, sessionDate),
            discardOperation: (naturalKey: string) => {
                updateQueue(removeOperation(queueRef.current, naturalKey))
            },
            // Pedido explícito de quem está olhando a falha: envia já, sem
            // esperar o intervalo crescente das tentativas automáticas.
            retryOperation: (naturalKey: string) => {
                updateQueue(retryFailedOperation(queueRef.current, naturalKey))
                backoffDelayRef.current = null
                void runFlushCycle()
            },
            listFailedOperations: () => operationsWithStatus(queue, 'failed'),
        }
    }, [queue, isOnline, updateQueue, enqueueRecordable, runFlushCycle])

    return <OutboxContext.Provider value={contextValue}>{children}</OutboxContext.Provider>
}

export function useOutbox(): OutboxContextValue {
    const contextValue = useContext(OutboxContext)
    if (!contextValue) {
        throw new Error('useOutbox precisa estar dentro de um OutboxProvider')
    }

    return contextValue
}
