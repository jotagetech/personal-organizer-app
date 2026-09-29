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

import { createSession, finishSession, getSessionForDate, upsertSet } from '@/features/workout/api'
import type { WorkoutSnapshot } from '@/features/workout/types'
import {
    buildSendPlan,
    classifyOutboxError,
    countByStatus,
    enqueueOperation,
    enqueueOperations,
    markOperationAttempt,
    naturalKeyOf,
    nextBackoffDelayMs,
    operationsForDate,
    operationsWithStatus,
    removeOperation,
    replaceOperationInQueue,
    type OutboxOperation,
    type OutboxSetValues,
    type UpsertSetOperation,
} from '@/lib/outbox/outboxQueue'
import { loadOutboxQueue, saveOutboxQueue } from '@/lib/outbox/outboxStorage'

type EnqueueUpsertSetInput = {
    sessionDate: string
    planId: string
    snapshot: WorkoutSnapshot
    exerciseKey: string
    setIndex: number
    values: OutboxSetValues
}

type OutboxContextValue = {
    pendingCount: number
    failedCount: number
    isOnline: boolean
    getOperationsForDate: (sessionDate: string) => OutboxOperation[]
    enqueueUpsertSet: (input: EnqueueUpsertSetInput) => void
    enqueueUpsertSets: (inputs: EnqueueUpsertSetInput[]) => void
    enqueueFinishSession: (sessionDate: string) => void
    discardOperation: (naturalKey: string) => void
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

// Nem toda finalização de sessão está acompanhada de uma série pendente na
// mesma leva de envio (a última série pode ter sido confirmada numa leva
// anterior); nesse caso a sessão já existe e só falta descobrir o id dela.
async function resolveSessionId(sessionDate: string, sessionIdByDate: Map<string, string>): Promise<string> {
    const cachedSessionId = sessionIdByDate.get(sessionDate)
    if (cachedSessionId) {
        return cachedSessionId
    }

    const existingSession = await getSessionForDate(sessionDate)
    if (!existingSession) {
        throw new Error('Sessão não encontrada para finalizar')
    }

    sessionIdByDate.set(sessionDate, existingSession.session.id)
    return existingSession.session.id
}

export function OutboxProvider({ children }: { children: ReactNode }) {
    const [queue, setQueue] = useState<OutboxOperation[]>(() => loadOutboxQueue(window.localStorage))
    const [isOnline, setIsOnline] = useState(() => navigator.onLine)
    const queueRef = useRef(queue)
    const isFlushingRef = useRef(false)
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

    const flushOnce = useCallback(async () => {
        if (isFlushingRef.current) {
            return
        }
        isFlushingRef.current = true

        try {
            const sessionIdByDate = new Map<string, string>()
            const blockedDates = new Set<string>()
            let madeProgress = false

            const sendPlan = buildSendPlan(queueRef.current)
            for (const step of sendPlan) {
                if (step.type === 'ensure_session') {
                    if (blockedDates.has(step.sessionDate)) {
                        continue
                    }
                    try {
                        const ensuredSession = await createSession({
                            sessionDate: step.sessionDate,
                            planId: step.planId,
                            snapshot: step.snapshot,
                        })
                        sessionIdByDate.set(step.sessionDate, ensuredSession.id)
                    } catch {
                        blockedDates.add(step.sessionDate)
                    }
                    continue
                }

                const { operation } = step
                if (blockedDates.has(operation.sessionDate)) {
                    continue
                }

                try {
                    const sessionId = await resolveSessionId(operation.sessionDate, sessionIdByDate)
                    if (operation.kind === 'upsert_set') {
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
                    } else {
                        // A fila pode ficar horas sem sinal: a hora de fim é a do
                        // momento em que o treino terminou, não a do envio.
                        await finishSession(sessionId, operation.enqueuedAt)
                    }

                    madeProgress = true
                    updateQueue(removeOperation(queueRef.current, naturalKeyOf(operation)))
                } catch (sendError) {
                    const classification = classifyOutboxError(sendError)
                    updateQueue(
                        replaceOperationInQueue(queueRef.current, markOperationAttempt(operation, classification)),
                    )
                    if (classification === 'retry') {
                        blockedDates.add(operation.sessionDate)
                    }
                }
            }

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

        return {
            pendingCount: pending,
            failedCount: failed,
            isOnline,
            getOperationsForDate: (sessionDate: string) => operationsForDate(queue, sessionDate),
            enqueueUpsertSet: (input: EnqueueUpsertSetInput) => {
                const operation = buildUpsertSetOperation(input, new Date().toISOString())
                updateQueue(enqueueOperation(queueRef.current, operation))
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
                const operations = inputs.map((input) => buildUpsertSetOperation(input, enqueuedAt))
                updateQueue(enqueueOperations(queueRef.current, operations))
                void runFlushCycle()
            },
            enqueueFinishSession: (sessionDate: string) => {
                const operation: OutboxOperation = {
                    kind: 'finish_session',
                    sessionDate,
                    enqueuedAt: new Date().toISOString(),
                    attempts: 0,
                    status: 'pending',
                }
                updateQueue(enqueueOperation(queueRef.current, operation))
                void runFlushCycle()
            },
            discardOperation: (naturalKey: string) => {
                updateQueue(removeOperation(queueRef.current, naturalKey))
            },
            listFailedOperations: () => operationsWithStatus(queue, 'failed'),
        }
    }, [queue, isOnline, updateQueue, runFlushCycle])

    return <OutboxContext.Provider value={contextValue}>{children}</OutboxContext.Provider>
}

export function useOutbox(): OutboxContextValue {
    const contextValue = useContext(OutboxContext)
    if (!contextValue) {
        throw new Error('useOutbox precisa estar dentro de um OutboxProvider')
    }

    return contextValue
}
