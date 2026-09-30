import { describe, expect, it } from 'vitest'

import {
    buildSendPlan,
    deleteSessionFromQueue,
    enqueueOperation,
    hasSessionDeletion,
    isEnqueueableOperation,
    naturalKeyOf,
    type DeleteSessionOperation,
    type FinishSessionOperation,
    type OutboxOperation,
    type StartSessionOperation,
    type UpsertSetOperation,
} from '@/lib/outbox/outboxQueue'
import { loadOutboxQueue, saveOutboxQueue, type OutboxStorageAdapter } from '@/lib/outbox/outboxStorage'
import type { WorkoutSnapshot } from '@/features/workout/types'
import { repsSnapshotSet, SNAPSHOT_EXERCISE_DEFAULTS } from './workoutFixtures'

const SESSION_DATE = '2026-09-28'
const OTHER_DATE = '2026-09-27'
const DELETED_AT = '2026-09-28T13:00:00.000Z'

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

function startOperation(overrides: Partial<StartSessionOperation> = {}): StartSessionOperation {
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

function setOperation(overrides: Partial<UpsertSetOperation> = {}): UpsertSetOperation {
    return {
        kind: 'upsert_set',
        sessionDate: SESSION_DATE,
        planId: 'plan-1',
        snapshot: snapshotWithOneExercise(),
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

function deleteOperation(overrides: Partial<DeleteSessionOperation> = {}): DeleteSessionOperation {
    return {
        kind: 'delete_session',
        sessionDate: SESSION_DATE,
        enqueuedAt: DELETED_AT,
        attempts: 0,
        status: 'pending',
        ...overrides,
    }
}

function createMemoryStorage(): OutboxStorageAdapter {
    const values = new Map<string, string>()

    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
            values.set(key, value)
        },
        removeItem: (key) => {
            values.delete(key)
        },
    }
}

describe('deleteSessionFromQueue', () => {
    it('troca todas as operações da data, inclusive falhas, por uma exclusão', () => {
        const queue: OutboxOperation[] = [
            startOperation({ attempts: 2 }),
            setOperation({ status: 'failed', attempts: 1 }),
            finishOperation(),
        ]

        const nextQueue = deleteSessionFromQueue(queue, SESSION_DATE, DELETED_AT)

        expect(nextQueue).toEqual([deleteOperation()])
    })

    it('mantém intactas as operações de outras datas', () => {
        const otherDateSet = setOperation({ sessionDate: OTHER_DATE })

        const nextQueue = deleteSessionFromQueue([otherDateSet, startOperation()], SESSION_DATE, DELETED_AT)

        expect(nextQueue).toEqual([otherDateSet, deleteOperation()])
    })

    it('manda a exclusão mesmo sem nada da data na fila', () => {
        expect(deleteSessionFromQueue([], SESSION_DATE, DELETED_AT)).toEqual([deleteOperation()])
    })

    it('uma exclusão nova substitui a anterior e o que veio depois dela', () => {
        const queue = [deleteOperation({ enqueuedAt: '2026-09-28T12:59:00.000Z' }), startOperation()]

        const nextQueue = deleteSessionFromQueue(queue, SESSION_DATE, DELETED_AT)

        expect(nextQueue).toEqual([deleteOperation()])
    })
})

describe('buildSendPlan com exclusão', () => {
    it('envia a exclusão antes do treino recomeçado depois dela', () => {
        const queue = enqueueOperation(deleteSessionFromQueue([], SESSION_DATE, DELETED_AT), startOperation())

        const plan = buildSendPlan(queue)

        expect(plan.map((step) => (step.type === 'ensure_session' ? 'ensure' : step.operation.kind))).toEqual([
            'delete_session',
            'ensure',
            'start_session',
        ])
    })

    it('segura a data inteira enquanto a exclusão está como falha', () => {
        const queue: OutboxOperation[] = [
            deleteOperation({ status: 'failed', attempts: 1 }),
            startOperation(),
            setOperation({ sessionDate: OTHER_DATE }),
        ]

        const plan = buildSendPlan(queue)

        const plannedDates = plan.map((step) =>
            step.type === 'ensure_session' ? step.sessionDate : step.operation.sessionDate,
        )
        expect(plannedDates.every((date) => date === OTHER_DATE)).toBe(true)
    })
})

describe('hasSessionDeletion', () => {
    it('só vale para a data da exclusão', () => {
        const queue = [deleteOperation()]

        expect(hasSessionDeletion(queue, SESSION_DATE)).toBe(true)
        expect(hasSessionDeletion(queue, OTHER_DATE)).toBe(false)
    })
})

describe('isEnqueueableOperation', () => {
    const today = '2026-09-28'

    it('aceita registro de hoje e de dias passados', () => {
        expect(isEnqueueableOperation(startOperation({ sessionDate: today }), today)).toBe(true)
        expect(isEnqueueableOperation(setOperation({ sessionDate: '2026-09-20' }), today)).toBe(true)
    })

    it('recusa qualquer registro em data futura', () => {
        const futureDate = '2026-09-29'

        expect(isEnqueueableOperation(startOperation({ sessionDate: futureDate }), today)).toBe(false)
        expect(isEnqueueableOperation(setOperation({ sessionDate: futureDate }), today)).toBe(false)
        expect(isEnqueueableOperation(finishOperation({ sessionDate: futureDate }), today)).toBe(false)
    })

    it('aceita a exclusão em qualquer data', () => {
        expect(isEnqueueableOperation(deleteOperation({ sessionDate: '2026-10-05' }), today)).toBe(true)
    })
})

describe('persistência da exclusão', () => {
    it('sobrevive a fechar e reabrir o app', () => {
        const storage = createMemoryStorage()
        const queue = deleteSessionFromQueue([startOperation()], SESSION_DATE, DELETED_AT)

        saveOutboxQueue(storage, queue)
        const reloadedQueue = loadOutboxQueue(storage)

        expect(reloadedQueue).toEqual([deleteOperation()])
        expect(naturalKeyOf(reloadedQueue[0])).toBe(`delete_session:${SESSION_DATE}`)
    })
})
