import { describe, expect, it } from 'vitest'

import {
    buildSendPlan,
    cancelSessionStart,
    enqueueOperation,
    enqueueOperations,
    findPendingPauseState,
    naturalKeyOf,
    resolveEffectivePauseState,
    resolveEffectiveStartedAt,
    type CancelSessionStartOperation,
    type FinishSessionOperation,
    type OutboxOperation,
    type PauseSessionOperation,
    type ResumeSessionOperation,
    type StartSessionOperation,
    type UpsertSetOperation,
} from '@/lib/outbox/outboxQueue'
import { loadOutboxQueue, saveOutboxQueue, type OutboxStorageAdapter } from '@/lib/outbox/outboxStorage'
import type { WorkoutSnapshot } from '@/features/workout/types'
import { repsSnapshotSet, SNAPSHOT_EXERCISE_DEFAULTS } from './workoutFixtures'

const SESSION_DATE = '2026-09-28'
const CANCELLED_AT = '2026-09-28T11:55:00.000Z'

function snapshotWithOneExercise(): WorkoutSnapshot {
    return {
        versao: 2,
        workout_key: 'treino-a',
        nome: 'Treino A',
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

function startSessionOperation(overrides: Partial<StartSessionOperation> = {}): StartSessionOperation {
    return {
        kind: 'start_session',
        sessionDate: SESSION_DATE,
        planId: 'plan-1',
        snapshot: snapshotWithOneExercise(),
        enqueuedAt: '2026-09-28T11:50:00.000Z',
        attempts: 0,
        status: 'pending',
        ...overrides,
    }
}

function pauseOperation(overrides: Partial<PauseSessionOperation> = {}): PauseSessionOperation {
    return {
        kind: 'pause_session',
        sessionDate: SESSION_DATE,
        pause: { pausedAt: '2026-09-28T12:10:00.000Z', pausedSeconds: 0 },
        enqueuedAt: '2026-09-28T12:10:00.000Z',
        attempts: 0,
        status: 'pending',
        ...overrides,
    }
}

function resumeOperation(overrides: Partial<ResumeSessionOperation> = {}): ResumeSessionOperation {
    return {
        kind: 'resume_session',
        sessionDate: SESSION_DATE,
        pause: { pausedAt: null, pausedSeconds: 300 },
        enqueuedAt: '2026-09-28T12:15:00.000Z',
        attempts: 0,
        status: 'pending',
        ...overrides,
    }
}

function cancelOperation(overrides: Partial<CancelSessionStartOperation> = {}): CancelSessionStartOperation {
    return {
        kind: 'cancel_session_start',
        sessionDate: SESSION_DATE,
        enqueuedAt: CANCELLED_AT,
        attempts: 0,
        status: 'pending',
        ...overrides,
    }
}

function upsertSetOperation(): UpsertSetOperation {
    return {
        kind: 'upsert_set',
        sessionDate: SESSION_DATE,
        planId: 'plan-1',
        snapshot: snapshotWithOneExercise(),
        exerciseKey: 'supino',
        setIndex: 1,
        values: { loadKg: 60, reps: 10, rir: null, note: null, completedAt: '2026-09-28T12:20:00.000Z', skippedAt: null },
        enqueuedAt: '2026-09-28T12:20:00.000Z',
        attempts: 0,
        status: 'pending',
    }
}

function finishSessionOperation(): FinishSessionOperation {
    return {
        kind: 'finish_session',
        sessionDate: SESSION_DATE,
        enqueuedAt: '2026-09-28T13:00:00.000Z',
        attempts: 0,
        status: 'pending',
    }
}

function kindsOf(queue: OutboxOperation[]): string[] {
    return queue.map((operation) => `${operation.kind}:${operation.sessionDate}`)
}

describe('pausa e retomada na fila', () => {
    it('pausar e retomar dividem a chave da data e deixam só o estado mais recente', () => {
        expect(naturalKeyOf(pauseOperation())).toBe('session_pause:2026-09-28')
        expect(naturalKeyOf(resumeOperation())).toBe('session_pause:2026-09-28')

        const secondPause = pauseOperation({
            pause: { pausedAt: '2026-09-28T12:30:00.000Z', pausedSeconds: 300 },
            enqueuedAt: '2026-09-28T12:30:00.000Z',
        })
        const queue = enqueueOperations([], [pauseOperation(), resumeOperation(), secondPause])

        expect(queue).toEqual([secondPause])
    })

    it('expõe o estado da pausa ainda pendente da data pedida', () => {
        const queue: OutboxOperation[] = [upsertSetOperation(), resumeOperation()]

        expect(findPendingPauseState(queue, SESSION_DATE)).toEqual({ pausedAt: null, pausedSeconds: 300 })
        expect(findPendingPauseState(queue, '2026-09-27')).toBeNull()
    })

    it('envia na ordem cancelamento, início, pausa, séries e finalização', () => {
        const queue: OutboxOperation[] = [
            finishSessionOperation(),
            upsertSetOperation(),
            resumeOperation(),
            startSessionOperation(),
            cancelOperation(),
        ]

        const stepTypes = buildSendPlan(queue).map((step) =>
            step.type === 'ensure_session' ? 'ensure' : step.operation.kind,
        )

        expect(stepTypes).toEqual([
            'cancel_session_start',
            'ensure',
            'start_session',
            'resume_session',
            'upsert_set',
            'finish_session',
        ])
    })

    it('pausa, retomada e cancelamento não criam a sessão sozinhos', () => {
        const stepTypes = buildSendPlan([cancelOperation(), pauseOperation()]).map((step) => step.type)

        expect(stepTypes).toEqual(['send_operation', 'send_operation'])
    })

    it('sobrevive a salvar e recarregar a fila do localStorage', () => {
        let storedValue: string | null = null
        const storage: OutboxStorageAdapter = {
            getItem: () => storedValue,
            setItem: (_key: string, value: string) => {
                storedValue = value
            },
            removeItem: () => {
                storedValue = null
            },
        }
        const queue: OutboxOperation[] = [startSessionOperation(), pauseOperation(), cancelOperation({ sessionDate: '2026-09-27' })]

        saveOutboxQueue(storage, queue)

        expect(loadOutboxQueue(storage)).toEqual(queue)
    })

    it('descarta a fila com uma pausa de tempo negativo gravada à mão', () => {
        const storage: OutboxStorageAdapter = {
            getItem: () =>
                JSON.stringify({
                    formatVersion: 1,
                    operations: [pauseOperation({ pause: { pausedAt: null, pausedSeconds: -5 } })],
                }),
            setItem: () => {},
            removeItem: () => {},
        }

        expect(loadOutboxQueue(storage)).toEqual([])
    })
})

describe('cancelSessionStart', () => {
    it('início que nunca saiu do aparelho é desfeito só na fila, junto com a pausa', () => {
        const otherDateStart = startSessionOperation({ sessionDate: '2026-09-27' })
        const queue: OutboxOperation[] = [startSessionOperation(), pauseOperation(), otherDateStart]

        expect(cancelSessionStart(queue, SESSION_DATE, CANCELLED_AT, null)).toEqual([otherDateStart])
    })

    it('início já tentado pode ter chegado ao servidor, então o cancelamento vai para lá', () => {
        const queue: OutboxOperation[] = [startSessionOperation({ attempts: 1 }), resumeOperation()]

        expect(cancelSessionStart(queue, SESSION_DATE, CANCELLED_AT, null)).toEqual([cancelOperation()])
    })

    it('início a caminho do servidor neste instante também manda o cancelamento', () => {
        const sendingStart = startSessionOperation()
        const rewrittenStart = enqueueOperation([sendingStart], startSessionOperation({ planId: 'plan-2' }))

        expect(kindsOf(cancelSessionStart(rewrittenStart, SESSION_DATE, CANCELLED_AT, sendingStart))).toEqual([
            'cancel_session_start:2026-09-28',
        ])
    })

    it('início que já saiu da fila manda o cancelamento', () => {
        expect(cancelSessionStart([pauseOperation()], SESSION_DATE, CANCELLED_AT, null)).toEqual([cancelOperation()])
    })

    it('um cancelamento anterior ainda pendente continua valendo ao cancelar um início novo', () => {
        const queue: OutboxOperation[] = [cancelOperation(), startSessionOperation({ enqueuedAt: '2026-09-28T12:00:00.000Z' })]

        expect(cancelSessionStart(queue, SESSION_DATE, '2026-09-28T12:01:00.000Z', null)).toEqual([cancelOperation()])
    })
})

describe('início e pausa efetivos com a fila', () => {
    const serverPause = { pausedAt: '2026-09-28T12:10:00.000Z', pausedSeconds: 60 }

    it('sem nada pendente, vale o que veio do servidor', () => {
        expect(resolveEffectiveStartedAt('2026-09-28T11:00:00.000Z', [], SESSION_DATE)).toBe('2026-09-28T11:00:00.000Z')
        expect(resolveEffectivePauseState(serverPause, [], SESSION_DATE)).toBe(serverPause)
    })

    it('sem início no servidor, vale o início pendente', () => {
        expect(resolveEffectiveStartedAt(null, [startSessionOperation()], SESSION_DATE)).toBe('2026-09-28T11:50:00.000Z')
    })

    it('cancelamento pendente desfaz o início e a pausa que vieram do servidor', () => {
        const queue: OutboxOperation[] = [cancelOperation()]

        expect(resolveEffectiveStartedAt('2026-09-28T11:00:00.000Z', queue, SESSION_DATE)).toBeNull()
        expect(resolveEffectivePauseState(serverPause, queue, SESSION_DATE)).toEqual({ pausedAt: null, pausedSeconds: 0 })
    })

    it('com cancelamento pendente, um início novo também pendente conta', () => {
        const restart = startSessionOperation({ enqueuedAt: '2026-09-28T12:30:00.000Z' })
        const queue: OutboxOperation[] = [cancelOperation(), restart, pauseOperation()]

        expect(resolveEffectiveStartedAt('2026-09-28T11:00:00.000Z', queue, SESSION_DATE)).toBe('2026-09-28T12:30:00.000Z')
        expect(resolveEffectivePauseState(serverPause, queue, SESSION_DATE)).toEqual(pauseOperation().pause)
    })
})
