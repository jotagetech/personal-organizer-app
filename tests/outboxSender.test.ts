import { describe, expect, it } from 'vitest'

import {
    deleteSessionFromQueue,
    enqueueOperation,
    type FinishSessionOperation,
    type OutboxOperation,
    type StartSessionOperation,
    type UpsertSetOperation,
} from '@/lib/outbox/outboxQueue'
import { runSendPass, type OutboxQueueAccess, type OutboxTransport } from '@/lib/outbox/outboxSender'
import type { WorkoutSnapshot } from '@/features/workout/types'
import { repsSnapshotSet, SNAPSHOT_EXERCISE_DEFAULTS } from './workoutFixtures'

const SESSION_DATE = '2026-09-28'
const OTHER_DATE = '2026-09-27'
const DELETED_AT = '2026-09-28T13:00:00.000Z'

function snapshotNamed(workoutKey: string): WorkoutSnapshot {
    return {
        versao: 2,
        workout_key: workoutKey,
        nome: workoutKey,
        semana_bloco: null,
        bloco_semanas: null,
        descricao_semana: null,
        exercicios: [
            {
                ...SNAPSHOT_EXERCISE_DEFAULTS,
                exercise_key: 'supino',
                nome: 'Supino',
                forma_carga: 'total',
                series: [repsSnapshotSet(1, 8, 12, null)],
            },
        ],
    }
}

function startOperation(overrides: Partial<StartSessionOperation> = {}): StartSessionOperation {
    return {
        kind: 'start_session',
        sessionDate: SESSION_DATE,
        planId: 'plan-1',
        snapshot: snapshotNamed('treino-a'),
        enqueuedAt: '2026-09-28T11:50:00.000Z',
        attempts: 0,
        status: 'pending',
        ...overrides,
    }
}

function setOperation(overrides: Partial<UpsertSetOperation> = {}): UpsertSetOperation {
    return {
        kind: 'upsert_set',
        sessionDate: SESSION_DATE,
        planId: 'plan-1',
        snapshot: snapshotNamed('treino-a'),
        exerciseKey: 'supino',
        setIndex: 1,
        values: {
            loadKg: 40,
            reps: 10,
            rir: null,
            note: null,
            completedAt: '2026-09-28T12:00:00.000Z',
            skippedAt: null,
        },
        enqueuedAt: '2026-09-28T12:00:00.000Z',
        attempts: 0,
        status: 'pending',
        ...overrides,
    }
}

function finishOperation(overrides: Partial<FinishSessionOperation> = {}): FinishSessionOperation {
    return {
        kind: 'finish_session',
        sessionDate: SESSION_DATE,
        enqueuedAt: '2026-09-28T12:40:00.000Z',
        attempts: 0,
        status: 'pending',
        ...overrides,
    }
}

type Deferred = { promise: Promise<void>; resolve: () => void }

function deferred(): Deferred {
    let resolve: () => void = () => {}
    const promise = new Promise<void>((resolvePromise) => {
        resolve = resolvePromise
    })

    return { promise, resolve }
}

// Servidor em memória: guarda quais datas têm sessão e quantas séries cada
// uma tem, e registra a ordem das chamadas.
function createFakeServer() {
    const calls: string[] = []
    const sessionsByDate = new Map<string, { id: string; workoutKey: string; setCount: number }>()
    const dateBySessionId = new Map<string, string>()
    let nextId = 1
    let setGate: Deferred | null = null
    let deleteError: unknown = null

    const transport: OutboxTransport = {
        ensureSession: async (step) => {
            calls.push(`ensure:${step.sessionDate}:${step.snapshot.workout_key}`)
            const existing = sessionsByDate.get(step.sessionDate)
            if (existing) {
                return existing.id
            }
            const id = `session-${nextId++}`
            sessionsByDate.set(step.sessionDate, { id, workoutKey: step.snapshot.workout_key, setCount: 0 })
            dateBySessionId.set(id, step.sessionDate)
            return id
        },
        findSessionId: async (sessionDate) => sessionsByDate.get(sessionDate)?.id ?? null,
        upsertSet: async (sessionId) => {
            calls.push(`set:${sessionId}`)
            if (setGate) {
                await setGate.promise
            }
            const sessionDate = dateBySessionId.get(sessionId)
            const session = sessionDate ? sessionsByDate.get(sessionDate) : undefined
            if (!session || session.id !== sessionId) {
                throw { code: '23503', message: 'violates foreign key constraint' }
            }
            session.setCount += 1
        },
        recordSessionStart: async (sessionId, startedAt) => {
            calls.push(`start:${sessionId}:${startedAt}`)
        },
        appendSessionExercise: async (sessionId) => {
            calls.push(`extra:${sessionId}`)
        },
        recordSessionPause: async (sessionId) => {
            calls.push(`pause:${sessionId}`)
        },
        clearSessionStart: async (sessionId) => {
            calls.push(`cancel:${sessionId}`)
        },
        finishSession: async (sessionId) => {
            calls.push(`finish:${sessionId}`)
        },
        deleteSession: async (sessionDate) => {
            calls.push(`delete:${sessionDate}`)
            if (deleteError) {
                throw deleteError
            }
            const session = sessionsByDate.get(sessionDate)
            if (session) {
                dateBySessionId.delete(session.id)
                sessionsByDate.delete(sessionDate)
            }
        },
    }

    return {
        calls,
        sessionsByDate,
        transport,
        gateSets: () => {
            setGate = deferred()
            return setGate
        },
        failDeletesWith: (error: unknown) => {
            deleteError = error
        },
    }
}

function createQueueAccess(initialQueue: OutboxOperation[]) {
    let queue = initialQueue
    let inFlight: OutboxOperation | null = null
    const reportedFailures: { kind: OutboxOperation['kind']; classification: string }[] = []
    const access: OutboxQueueAccess = {
        read: () => queue,
        write: (nextQueue) => {
            queue = nextQueue
        },
        setInFlight: (operation) => {
            inFlight = operation
        },
        reportFailure: (operation, _error, classification) => {
            reportedFailures.push({ kind: operation.kind, classification })
        },
    }

    return { access, currentQueue: () => queue, currentInFlight: () => inFlight, reportedFailures }
}

async function waitUntil(condition: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 100 && !condition(); attempt += 1) {
        await Promise.resolve()
    }
}

describe('runSendPass com exclusão do treino do dia', () => {
    it('espera a série em envio e descarta o resto da data sem recriar a sessão', async () => {
        const server = createFakeServer()
        const queueAccess = createQueueAccess([startOperation(), setOperation(), finishOperation()])
        const setGate = server.gateSets()

        const firstPass = runSendPass(queueAccess.access, server.transport)
        await waitUntil(() => queueAccess.currentInFlight()?.kind === 'upsert_set')
        queueAccess.access.write(deleteSessionFromQueue(queueAccess.currentQueue(), SESSION_DATE, DELETED_AT))
        setGate.resolve()
        await firstPass

        expect(server.calls.some((call) => call.startsWith('finish:'))).toBe(false)
        expect(queueAccess.currentQueue().map((operation) => operation.kind)).toEqual(['delete_session'])

        await runSendPass(queueAccess.access, server.transport)

        expect(server.calls.at(-1)).toBe(`delete:${SESSION_DATE}`)
        expect(server.sessionsByDate.has(SESSION_DATE)).toBe(false)
        expect(queueAccess.currentQueue()).toEqual([])
    })

    it('não envia a versão antiga de uma operação recriada com a mesma chave depois da exclusão', async () => {
        const server = createFakeServer()
        const queueAccess = createQueueAccess([setOperation({ sessionDate: OTHER_DATE }), startOperation()])
        const setGate = server.gateSets()

        const firstPass = runSendPass(queueAccess.access, server.transport)
        await waitUntil(() => queueAccess.currentInFlight()?.kind === 'upsert_set')
        const restartedWorkout = startOperation({
            snapshot: snapshotNamed('treino-b'),
            enqueuedAt: '2026-09-28T13:05:00.000Z',
        })
        const queueAfterDeletion = deleteSessionFromQueue(queueAccess.currentQueue(), SESSION_DATE, DELETED_AT)
        queueAccess.access.write(enqueueOperation(queueAfterDeletion, restartedWorkout))
        setGate.resolve()
        await firstPass

        expect(server.calls.some((call) => call.startsWith(`ensure:${SESSION_DATE}`))).toBe(false)

        await runSendPass(queueAccess.access, server.transport)

        const secondPassCalls = server.calls.slice(server.calls.indexOf(`delete:${SESSION_DATE}`))
        expect(secondPassCalls).toEqual([
            `delete:${SESSION_DATE}`,
            `ensure:${SESSION_DATE}:treino-b`,
            `start:${server.sessionsByDate.get(SESSION_DATE)?.id}:2026-09-28T13:05:00.000Z`,
        ])
        expect(queueAccess.currentQueue()).toEqual([])
    })

    it('sem rede, mantém a exclusão pendente e segura o treino recomeçado da mesma data', async () => {
        const server = createFakeServer()
        server.failDeletesWith(new TypeError('Failed to fetch'))
        const queue = enqueueOperation(deleteSessionFromQueue([], SESSION_DATE, DELETED_AT), startOperation())
        const queueAccess = createQueueAccess(queue)

        const madeProgress = await runSendPass(queueAccess.access, server.transport)

        expect(madeProgress).toBe(false)
        expect(server.calls).toEqual([`delete:${SESSION_DATE}`])
        const [pendingDeletion, pendingStart] = queueAccess.currentQueue()
        expect(pendingDeletion).toMatchObject({ kind: 'delete_session', status: 'pending', attempts: 1 })
        expect(pendingStart.kind).toBe('start_session')
        expect(queueAccess.reportedFailures).toEqual([{ kind: 'delete_session', classification: 'retry' }])
    })

    it('uma exclusão recusada de vez segura a data também nas passadas seguintes', async () => {
        const server = createFakeServer()
        server.failDeletesWith({ status: 403, message: 'permission denied' })
        const queue = enqueueOperation(deleteSessionFromQueue([], SESSION_DATE, DELETED_AT), startOperation())
        const queueAccess = createQueueAccess(queue)

        await runSendPass(queueAccess.access, server.transport)
        await runSendPass(queueAccess.access, server.transport)

        expect(server.calls).toEqual([`delete:${SESSION_DATE}`])
        expect(queueAccess.currentQueue()[0]).toMatchObject({ kind: 'delete_session', status: 'failed' })
    })

    it('continua enviando as outras datas', async () => {
        const server = createFakeServer()
        server.failDeletesWith(new TypeError('Failed to fetch'))
        const queue = [...deleteSessionFromQueue([], SESSION_DATE, DELETED_AT), setOperation({ sessionDate: OTHER_DATE })]
        const queueAccess = createQueueAccess(queue)

        await runSendPass(queueAccess.access, server.transport)

        expect(server.sessionsByDate.get(OTHER_DATE)?.setCount).toBe(1)
        expect(queueAccess.currentQueue().map((operation) => operation.kind)).toEqual(['delete_session'])
    })
})
