import { describe, expect, it } from 'vitest'

import {
    applyPendingExtraExercises,
    buildSendPlan,
    enqueueOperation,
    enqueueOperations,
    isSessionCreatingOperation,
    naturalKeyOf,
    removePendingExtraExercises,
    resolvePendingSnapshot,
    type AddExtraExerciseOperation,
    type OutboxOperation,
    type StartSessionOperation,
    type UpsertSetOperation,
} from '@/lib/outbox/outboxQueue'
import { loadOutboxQueue, saveOutboxQueue, type OutboxStorageAdapter } from '@/lib/outbox/outboxStorage'
import { appendExtraExercise } from '@/features/workout/extraExercises'
import type { WorkoutSnapshot, WorkoutSnapshotExercise } from '@/features/workout/types'
import { repsSnapshotSet, SNAPSHOT_EXERCISE_DEFAULTS } from './workoutFixtures'

const SESSION_DATE = '2026-09-28'

function baseSnapshot(): WorkoutSnapshot {
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

function extraExercise(exerciseKey: string): WorkoutSnapshotExercise {
    return {
        ...SNAPSHOT_EXERCISE_DEFAULTS,
        exercise_key: exerciseKey,
        nome: exerciseKey,
        forma_carga: 'total',
        series: [repsSnapshotSet(1, 12, 15, null), repsSnapshotSet(2, 12, 15, null)],
        extra: true,
    }
}

function addExtraOperation(
    exercise: WorkoutSnapshotExercise,
    snapshot: WorkoutSnapshot,
    overrides: Partial<AddExtraExerciseOperation> = {},
): AddExtraExerciseOperation {
    return {
        kind: 'add_extra_exercise',
        sessionDate: SESSION_DATE,
        planId: 'plan-1',
        snapshot,
        exercise,
        enqueuedAt: '2026-09-28T12:00:00.000Z',
        attempts: 0,
        status: 'pending',
        ...overrides,
    }
}

function startOperation(snapshot: WorkoutSnapshot): StartSessionOperation {
    return {
        kind: 'start_session',
        sessionDate: SESSION_DATE,
        planId: 'plan-1',
        snapshot,
        enqueuedAt: '2026-09-28T11:50:00.000Z',
        attempts: 0,
        status: 'pending',
    }
}

function setOperation(exerciseKey: string, snapshot: WorkoutSnapshot): UpsertSetOperation {
    return {
        kind: 'upsert_set',
        sessionDate: SESSION_DATE,
        planId: 'plan-1',
        snapshot,
        exerciseKey,
        setIndex: 1,
        values: {
            loadKg: 10,
            reps: 12,
            rir: null,
            note: null,
            completedAt: '2026-09-28T12:05:00.000Z',
            skippedAt: null,
        },
        enqueuedAt: '2026-09-28T12:05:00.000Z',
        attempts: 0,
        status: 'pending',
    }
}

function memoryStorage(): OutboxStorageAdapter {
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

function sentKinds(queue: OutboxOperation[]): string[] {
    return buildSendPlan(queue).map((step) =>
        step.type === 'ensure_session' ? 'ensure_session' : naturalKeyOf(step.operation),
    )
}

describe('add_extra_exercise na fila', () => {
    it('cria a sessão sozinha, sem depender do início do treino', () => {
        const withFirst = appendExtraExercise(baseSnapshot(), extraExercise('extra-a'))
        const operation = addExtraOperation(extraExercise('extra-a'), withFirst)

        expect(isSessionCreatingOperation(operation)).toBe(true)
        const [ensureStep, sendStep] = buildSendPlan([operation])
        expect(ensureStep).toEqual({
            type: 'ensure_session',
            sessionDate: SESSION_DATE,
            planId: 'plan-1',
            snapshot: withFirst,
        })
        expect(sendStep).toEqual({ type: 'send_operation', operation })
    })

    it('dois extras sem sinal viram duas operações, e reenviar o mesmo substitui só o dele', () => {
        const withFirst = appendExtraExercise(baseSnapshot(), extraExercise('extra-a'))
        const withBoth = appendExtraExercise(withFirst, extraExercise('extra-b'))
        const queue = enqueueOperations(
            [],
            [
                addExtraOperation(extraExercise('extra-a'), withFirst),
                addExtraOperation(extraExercise('extra-b'), withBoth),
                addExtraOperation(extraExercise('extra-a'), withBoth, { enqueuedAt: '2026-09-28T12:10:00.000Z' }),
            ],
        )

        expect(queue.map(naturalKeyOf)).toEqual([
            `add_extra_exercise:${SESSION_DATE}:extra-a`,
            `add_extra_exercise:${SESSION_DATE}:extra-b`,
        ])
    })

    it('vai depois do início e antes das séries, inclusive as do próprio extra, na ordem em que foi acrescentado', () => {
        const withFirst = appendExtraExercise(baseSnapshot(), extraExercise('extra-a'))
        const withBoth = appendExtraExercise(withFirst, extraExercise('extra-b'))
        const queue = [
            setOperation('extra-b', withBoth),
            setOperation('supino', baseSnapshot()),
            addExtraOperation(extraExercise('extra-a'), withFirst),
            startOperation(baseSnapshot()),
            addExtraOperation(extraExercise('extra-b'), withBoth),
        ]

        expect(sentKinds(queue)).toEqual([
            'ensure_session',
            `start_session:${SESSION_DATE}`,
            `add_extra_exercise:${SESSION_DATE}:extra-a`,
            `add_extra_exercise:${SESSION_DATE}:extra-b`,
            `upsert_set:${SESSION_DATE}:extra-b:1`,
            `upsert_set:${SESSION_DATE}:supino:1`,
        ])
    })

    it('a criação da sessão já leva os extras pendentes, mesmo com o início enfileirado antes deles', () => {
        const withFirst = appendExtraExercise(baseSnapshot(), extraExercise('extra-a'))
        const queue = [startOperation(baseSnapshot()), addExtraOperation(extraExercise('extra-a'), withFirst)]

        const [ensureStep] = buildSendPlan(queue)
        expect(ensureStep.type === 'ensure_session' && ensureStep.snapshot.exercicios.map((e) => e.exercise_key)).toEqual([
            'supino',
            'extra-a',
        ])
    })

    it('uma falha definitiva fica fora do plano de envio', () => {
        const failed = addExtraOperation(extraExercise('extra-a'), baseSnapshot(), { status: 'failed', attempts: 1 })

        expect(buildSendPlan([failed])).toEqual([])
    })
})

describe('snapshot com extras pendentes', () => {
    it('sobrepõe os extras da data ao snapshot do servidor, sem duplicar os que já chegaram lá', () => {
        const serverSnapshot = appendExtraExercise(baseSnapshot(), extraExercise('extra-a'))
        const operations: OutboxOperation[] = [
            addExtraOperation(extraExercise('extra-a'), serverSnapshot),
            addExtraOperation(extraExercise('extra-b'), serverSnapshot),
            addExtraOperation(extraExercise('extra-outro-dia'), serverSnapshot, { sessionDate: '2026-09-27' }),
        ]

        const overlaid = applyPendingExtraExercises(serverSnapshot, operations, SESSION_DATE)
        expect(overlaid.exercicios.map((exercicio) => exercicio.exercise_key)).toEqual(['supino', 'extra-a', 'extra-b'])
    })

    it('sessão só na fila: parte da primeira operação que cria a sessão e soma os extras', () => {
        const operations: OutboxOperation[] = [
            startOperation(baseSnapshot()),
            addExtraOperation(extraExercise('extra-a'), appendExtraExercise(baseSnapshot(), extraExercise('extra-a'))),
        ]

        const pending = resolvePendingSnapshot(operations, SESSION_DATE)
        expect(pending?.exercicios.map((exercicio) => exercicio.exercise_key)).toEqual(['supino', 'extra-a'])
        expect(resolvePendingSnapshot(operations, '2026-09-27')).toBeNull()
    })

    it('trocar o treino descarta só os extras pendentes da data', () => {
        const queue: OutboxOperation[] = [
            startOperation(baseSnapshot()),
            addExtraOperation(extraExercise('extra-a'), baseSnapshot()),
            addExtraOperation(extraExercise('extra-b'), baseSnapshot(), { sessionDate: '2026-09-27' }),
        ]

        expect(removePendingExtraExercises(queue, SESSION_DATE).map(naturalKeyOf)).toEqual([
            `start_session:${SESSION_DATE}`,
            'add_extra_exercise:2026-09-27:extra-b',
        ])
    })
})

describe('persistência do extra na fila', () => {
    it('sobrevive a gravar e ler do armazenamento com a marca de extra', () => {
        const storage = memoryStorage()
        const withFirst = appendExtraExercise(baseSnapshot(), extraExercise('extra-a'))
        const queue = enqueueOperation([], addExtraOperation(extraExercise('extra-a'), withFirst))

        saveOutboxQueue(storage, queue)
        const [loaded] = loadOutboxQueue(storage)

        expect(loaded).toEqual(queue[0])
    })
})
