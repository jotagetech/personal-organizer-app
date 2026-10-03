import { describe, expect, it } from 'vitest'

import {
    BACKOFF_SCHEDULE_MS,
    buildOverlaySetRow,
    buildSendPlan,
    classifyOutboxError,
    enqueueOperation,
    enqueueOperations,
    findPendingFinishedAt,
    findPendingStartedAt,
    naturalKeyOf,
    nextBackoffDelayMs,
    overlayPendingSets,
    removeSentOperation,
    replaceSentOperation,
    retryFailedOperation,
    type FinishSessionOperation,
    type OutboxOperation,
    type StartSessionOperation,
    type UpsertSetOperation,
} from '@/lib/outbox/outboxQueue'
import { SupabaseRequestError } from '@/lib/supabaseRequestError'
import { clearOutboxQueue, loadOutboxQueue, saveOutboxQueue, type OutboxStorageAdapter } from '@/lib/outbox/outboxStorage'
import { findFirstIncompletePosition } from '@/features/workout/sessionProgress'
import { setKey, type WorkoutSetRow, type WorkoutSnapshot } from '@/features/workout/types'
import { EMPTY_SET_METRIC_COLUMNS, repsSnapshotSet, SNAPSHOT_EXERCISE_DEFAULTS } from './workoutFixtures'

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
                series: [
                    repsSnapshotSet(1, 8, 12, null),
                    repsSnapshotSet(2, 8, 12, null),
                ],
            },
        ],
    }
}

function upsertSetOperation(overrides: Partial<UpsertSetOperation> = {}): UpsertSetOperation {
    return {
        kind: 'upsert_set',
        sessionDate: '2026-09-28',
        planId: 'plan-1',
        snapshot: snapshotWithOneExercise(),
        exerciseKey: 'supino',
        setIndex: 1,
        values: { loadKg: 60, reps: 10, rir: null, note: null, completedAt: '2026-09-28T12:00:00.000Z', skippedAt: null },
        enqueuedAt: '2026-09-28T12:00:00.000Z',
        attempts: 0,
        status: 'pending',
        ...overrides,
    }
}

function finishSessionOperation(overrides: Partial<FinishSessionOperation> = {}): FinishSessionOperation {
    return {
        kind: 'finish_session',
        sessionDate: '2026-09-28',
        enqueuedAt: '2026-09-28T12:05:00.000Z',
        attempts: 0,
        status: 'pending',
        ...overrides,
    }
}

describe('enqueueOperation', () => {
    it('agrupa por chave natural: a segunda escrita da mesma série substitui a primeira', () => {
        const firstWrite = upsertSetOperation({ values: { loadKg: 40, reps: 8, rir: null, note: null, completedAt: null, skippedAt: null } })
        const secondWrite = upsertSetOperation({
            values: { loadKg: 45, reps: 10, rir: 2, note: null, completedAt: '2026-09-28T12:01:00.000Z', skippedAt: null },
        })

        const queue = enqueueOperation(enqueueOperation([], firstWrite), secondWrite)

        expect(queue).toHaveLength(1)
        expect(queue[0]).toEqual(secondWrite)
    })

    it('não mistura operações de séries diferentes na mesma sessão', () => {
        const setOne = upsertSetOperation({ setIndex: 1 })
        const setTwo = upsertSetOperation({ setIndex: 2 })

        const queue = enqueueOperation(enqueueOperation([], setOne), setTwo)

        expect(queue).toHaveLength(2)
    })

    it('finish_session agrupa por data, independente de outras operações da fila', () => {
        const finishFirst = finishSessionOperation()
        const finishSecond = finishSessionOperation({ enqueuedAt: '2026-09-28T13:00:00.000Z' })

        const queue = enqueueOperation(enqueueOperation([], finishFirst), finishSecond)

        expect(queue).toHaveLength(1)
        expect(queue[0]).toEqual(finishSecond)
    })
})

describe('buildSendPlan', () => {
    it('garante a sessão antes de enviar as séries, e séries antes de finalizar', () => {
        const queue: OutboxOperation[] = [
            finishSessionOperation(),
            upsertSetOperation({ setIndex: 2 }),
            upsertSetOperation({ setIndex: 1 }),
        ]

        const sendPlan = buildSendPlan(queue)

        expect(sendPlan[0]).toEqual({
            type: 'ensure_session',
            sessionDate: '2026-09-28',
            planId: 'plan-1',
            snapshot: snapshotWithOneExercise(),
        })
        const stepTypes = sendPlan.map((step) =>
            step.type === 'ensure_session' ? 'ensure_session' : step.operation.kind,
        )
        expect(stepTypes).toEqual(['ensure_session', 'upsert_set', 'upsert_set', 'finish_session'])
    })

    it('só ensaia a sessão uma vez por data mesmo com várias séries pendentes', () => {
        const queue: OutboxOperation[] = [upsertSetOperation({ setIndex: 1 }), upsertSetOperation({ setIndex: 2 })]

        const sendPlan = buildSendPlan(queue)
        const ensureSessionSteps = sendPlan.filter((step) => step.type === 'ensure_session')

        expect(ensureSessionSteps).toHaveLength(1)
    })

    it('não inclui operações já marcadas como failed', () => {
        const queue: OutboxOperation[] = [upsertSetOperation({ status: 'failed' })]

        expect(buildSendPlan(queue)).toEqual([])
    })
})

describe('nextBackoffDelayMs', () => {
    it('começa no primeiro degrau da escala quando não há atraso anterior', () => {
        expect(nextBackoffDelayMs(null)).toBe(BACKOFF_SCHEDULE_MS[0])
    })

    it('sobe um degrau a cada chamada até o teto, sem crescer além dele', () => {
        let delay: number | null = null
        const observedDelays: number[] = []
        for (let attempt = 0; attempt < 8; attempt += 1) {
            delay = nextBackoffDelayMs(delay)
            observedDelays.push(delay)
        }

        expect(observedDelays.slice(0, 4)).toEqual([5000, 15000, 30000, 60000])
        expect(observedDelays.slice(4)).toEqual([60000, 60000, 60000, 60000])
    })
})

describe('classifyOutboxError', () => {
    it('classifica erro de rede como retry', () => {
        expect(classifyOutboxError(new TypeError('Failed to fetch'))).toBe('retry')
    })

    it('classifica timeout (abort) como retry', () => {
        const abortError = new DOMException('The operation was aborted.', 'AbortError')
        expect(classifyOutboxError(abortError)).toBe('retry')
    })

    it('classifica erro 5xx como retry', () => {
        expect(classifyOutboxError({ status: 503, message: 'service unavailable' })).toBe('retry')
    })

    it('classifica erro 429 como retry', () => {
        expect(classifyOutboxError({ status: 429, message: 'too many requests' })).toBe('retry')
    })

    it('classifica violação de constraint (SQLSTATE 23xxx) como terminal', () => {
        expect(classifyOutboxError({ code: '23505', message: 'duplicate key value' })).toBe('terminal')
    })

    it('classifica erro 4xx como terminal', () => {
        expect(classifyOutboxError({ status: 400, message: 'bad request' })).toBe('terminal')
    })

    it('classifica erro desconhecido como terminal por padrão', () => {
        expect(classifyOutboxError(new Error('algo inesperado'))).toBe('terminal')
    })

    it('classifica queda de rede no Safari, como a API lança, como retry', () => {
        const safariNetworkError = new SupabaseRequestError({ message: 'TypeError: Load failed', code: '' }, 0)
        expect(classifyOutboxError(safariNetworkError)).toBe('retry')
    })

    it('classifica a mensagem "Load failed" sem status como retry', () => {
        expect(classifyOutboxError(new Error('TypeError: Load failed'))).toBe('retry')
    })

    it('classifica token vencido (401) como retry', () => {
        const expiredTokenError = new SupabaseRequestError({ message: 'JWT expired', code: 'PGRST303' }, 401)
        expect(classifyOutboxError(expiredTokenError)).toBe('retry')
    })

    it('classifica restrição violada, como a API lança, como terminal', () => {
        const checkViolation = new SupabaseRequestError({ message: 'violates check constraint', code: '23514' }, 400)
        expect(classifyOutboxError(checkViolation)).toBe('terminal')
    })
})

describe('retryFailedOperation', () => {
    it('devolve a operação com falha para o envio, zerando as tentativas', () => {
        const failedOperation = upsertSetOperation({ status: 'failed', attempts: 1 })
        const otherOperation = upsertSetOperation({ setIndex: 2, status: 'failed', attempts: 1 })

        const nextQueue = retryFailedOperation([failedOperation, otherOperation], naturalKeyOf(failedOperation))

        expect(nextQueue[0]).toMatchObject({ status: 'pending', attempts: 0 })
        expect(nextQueue[1]).toBe(otherOperation)
    })
})

describe('overlayPendingSets', () => {
    it('sobrepõe uma série pendente numa data sem nenhuma sessão no servidor ainda', () => {
        const pendingOperation = upsertSetOperation({
            setIndex: 1,
            values: { loadKg: 50, reps: 10, rir: null, note: null, completedAt: '2026-09-28T12:00:00.000Z', skippedAt: null },
        })

        const overlaid = overlayPendingSets(new Map(), [pendingOperation], '2026-09-28')
        const overlaidSet = overlaid.get(setKey('supino', 1))

        expect(overlaidSet).toBeDefined()
        expect(overlaidSet?.load_kg).toBe(50)
        expect(overlaidSet?.completed_at).toBe('2026-09-28T12:00:00.000Z')
    })

    it('a versão pendente vence quando diverge da versão vinda do servidor', () => {
        const serverSet: WorkoutSetRow = {
            id: 'server-set-1',
            session_id: 'session-1',
            exercise_key: 'supino',
            set_index: 1,
            load_kg: 40,
            reps: 8,
            rir: null,
            note: null,
            completed_at: null,
            skipped_at: null,
            ...EMPTY_SET_METRIC_COLUMNS,
            updated_at: '2026-09-28T11:00:00.000Z',
        }
        const serverSetsByKey = new Map([[setKey('supino', 1), serverSet]])
        const pendingOperation = upsertSetOperation({
            setIndex: 1,
            values: { loadKg: 45, reps: 10, rir: 1, note: 'ombro ok', completedAt: '2026-09-28T12:00:00.000Z', skippedAt: null },
        })

        const overlaid = overlayPendingSets(serverSetsByKey, [pendingOperation], '2026-09-28')
        const overlaidSet = overlaid.get(setKey('supino', 1))

        expect(overlaidSet?.id).toBe('server-set-1')
        expect(overlaidSet?.load_kg).toBe(45)
        expect(overlaidSet?.reps).toBe(10)
        expect(overlaidSet?.completed_at).toBe('2026-09-28T12:00:00.000Z')
    })

    it('ignora operações pendentes de outras datas', () => {
        const pendingOperation = upsertSetOperation({ sessionDate: '2026-09-27' })

        const overlaid = overlayPendingSets(new Map(), [pendingOperation], '2026-09-28')

        expect(overlaid.size).toBe(0)
    })
})

describe('findFirstIncompletePosition com séries sobrepostas pela fila', () => {
    it('não retrocede pra uma série já confirmada localmente mas ainda não sincronizada', () => {
        const snapshot = snapshotWithOneExercise()
        const pendingOperation = upsertSetOperation({
            setIndex: 1,
            values: { loadKg: 50, reps: 10, rir: null, note: null, completedAt: '2026-09-28T12:00:00.000Z', skippedAt: null },
        })

        const overlaid = overlayPendingSets(new Map(), [pendingOperation], '2026-09-28')
        const position = findFirstIncompletePosition(snapshot, overlaid)

        expect(position).toEqual({ exerciseIndex: 0, setIndexInExercise: 1 })
    })

    it('resolve null quando a última série pendente completa o treino', () => {
        const snapshot = snapshotWithOneExercise()
        const pendingOperations = [
            upsertSetOperation({ setIndex: 1, values: { loadKg: 50, reps: 10, rir: null, note: null, completedAt: '2026-09-28T12:00:00.000Z', skippedAt: null } }),
            upsertSetOperation({ setIndex: 2, values: { loadKg: 50, reps: 9, rir: null, note: null, completedAt: '2026-09-28T12:01:00.000Z', skippedAt: null } }),
        ]

        const overlaid = overlayPendingSets(new Map(), pendingOperations, '2026-09-28')
        const position = findFirstIncompletePosition(snapshot, overlaid)

        expect(position).toBeNull()
    })
})

describe('persistência da fila (localStorage)', () => {
    function createFakeStorage(initialValue?: string): OutboxStorageAdapter {
        let storedValue = initialValue ?? null

        return {
            getItem: () => storedValue,
            setItem: (_key: string, value: string) => {
                storedValue = value
            },
            removeItem: () => {
                storedValue = null
            },
        }
    }

    it('salva e recarrega a fila sem perder as operações', () => {
        const storage = createFakeStorage()
        const queue = [upsertSetOperation(), finishSessionOperation()]

        saveOutboxQueue(storage, queue)

        expect(loadOutboxQueue(storage)).toEqual(queue)
    })

    it('descarta JSON corrompido sem travar, voltando fila vazia', () => {
        const storage = createFakeStorage('{ isso não é json válido')

        expect(loadOutboxQueue(storage)).toEqual([])
    })

    it('descarta dado de formato antigo (sem envelope de versão) sem travar', () => {
        const storage = createFakeStorage(JSON.stringify([upsertSetOperation()]))

        expect(loadOutboxQueue(storage)).toEqual([])
    })

    it('descarta operação que não bate com o schema esperado sem travar', () => {
        const storage = createFakeStorage(
            JSON.stringify({ formatVersion: 1, operations: [{ kind: 'upsert_set' }] }),
        )

        expect(loadOutboxQueue(storage)).toEqual([])
    })

    it('nunca trava ao limpar uma fila vazia', () => {
        const storage = createFakeStorage()
        expect(() => clearOutboxQueue(storage)).not.toThrow()
        expect(loadOutboxQueue(storage)).toEqual([])
    })
})

describe('naturalKeyOf', () => {
    it('produz a mesma chave para reenvios da mesma série', () => {
        const first = upsertSetOperation({ attempts: 0 })
        const second = upsertSetOperation({ attempts: 1, status: 'failed' })

        expect(naturalKeyOf(first)).toBe(naturalKeyOf(second))
    })

    it('produz chaves diferentes para séries diferentes', () => {
        expect(naturalKeyOf(upsertSetOperation({ setIndex: 1 }))).not.toBe(
            naturalKeyOf(upsertSetOperation({ setIndex: 2 })),
        )
    })
})

describe('enqueueOperations', () => {
    it('agrupa pela chave natural como uma sequência de enqueueOperation', () => {
        const existingWrite = upsertSetOperation({ setIndex: 1 })
        const skipSetOne = upsertSetOperation({
            setIndex: 1,
            values: { loadKg: null, reps: null, rir: null, note: null, completedAt: null, skippedAt: '2026-09-28T12:10:00.000Z' },
        })
        const skipSetTwo = upsertSetOperation({
            setIndex: 2,
            values: { loadKg: null, reps: null, rir: null, note: null, completedAt: null, skippedAt: '2026-09-28T12:10:00.000Z' },
        })

        const queue = enqueueOperations([existingWrite, finishSessionOperation()], [skipSetOne, skipSetTwo])

        expect(queue).toHaveLength(3)
        expect(queue[0]).toEqual(skipSetOne)
        expect(queue[2]).toEqual(skipSetTwo)
    })

    it('devolve a fila intacta quando não há nada para enfileirar', () => {
        const queue = [upsertSetOperation()]

        expect(enqueueOperations(queue, [])).toEqual(queue)
    })
})

describe('buildOverlaySetRow', () => {
    it('mapeia skipped_at a partir dos valores da operação', () => {
        const operation = upsertSetOperation({
            values: { loadKg: null, reps: null, rir: null, note: 'joelho', completedAt: null, skippedAt: '2026-09-28T12:10:00.000Z' },
        })

        const row = buildOverlaySetRow(operation, undefined)

        expect(row.skipped_at).toBe('2026-09-28T12:10:00.000Z')
        expect(row.completed_at).toBeNull()
        expect(row.note).toBe('joelho')
    })

    it('mapeia métrica, tempo e distância, e trata a ausência deles como série de repetições', () => {
        const timedOperation = upsertSetOperation({
            values: {
                loadKg: null,
                reps: null,
                rir: null,
                note: null,
                completedAt: '2026-09-28T12:10:00.000Z',
                skippedAt: null,
                metric: 'tempo',
                durationSeconds: 35,
            },
        })
        const repsOperation = upsertSetOperation()

        expect(buildOverlaySetRow(timedOperation, undefined)).toMatchObject({
            metric: 'tempo',
            duration_seconds: 35,
            distance_m: null,
        })
        expect(buildOverlaySetRow(repsOperation, undefined)).toMatchObject(EMPTY_SET_METRIC_COLUMNS)
    })
})

describe('persistência da fila com séries puladas', () => {
    function createFakeStorage(initialValue?: string): OutboxStorageAdapter {
        let storedValue = initialValue ?? null

        return {
            getItem: () => storedValue,
            setItem: (_key: string, value: string) => {
                storedValue = value
            },
            removeItem: () => {
                storedValue = null
            },
        }
    }

    it('carrega envelope gravado antes do estado pulada, com skippedAt null, sem descartar a fila', () => {
        const legacyOperation = {
            ...upsertSetOperation(),
            values: { loadKg: 60, reps: 10, rir: null, note: null, completedAt: '2026-09-28T12:00:00.000Z' },
        }
        const storage = createFakeStorage(JSON.stringify({ formatVersion: 1, operations: [legacyOperation] }))

        const loadedQueue = loadOutboxQueue(storage)

        expect(loadedQueue).toHaveLength(1)
        expect(loadedQueue[0]).toEqual({ ...legacyOperation, values: { ...legacyOperation.values, skippedAt: null } })
    })

    it('preserva skippedAt na ida e volta pelo armazenamento', () => {
        const storage = createFakeStorage()
        const skippedOperation = upsertSetOperation({
            values: { loadKg: null, reps: null, rir: null, note: null, completedAt: null, skippedAt: '2026-09-28T12:10:00.000Z' },
        })

        saveOutboxQueue(storage, [skippedOperation])

        expect(loadOutboxQueue(storage)).toEqual([skippedOperation])
    })

    it('converte snapshot no formato antigo enfileirado antes da atualização, sem descartar a fila', () => {
        const legacySnapshot = {
            workout_key: 'treino_a',
            nome: 'Treino A',
            exercicios: [
                {
                    exercise_key: 'supino',
                    nome: 'Supino',
                    forma_carga: 'total',
                    series: [{ set_index: 1, repeticoes_min: 8, repeticoes_max: 12, carga_sugerida: null }],
                },
            ],
        }
        const legacyOperation = { ...upsertSetOperation(), snapshot: legacySnapshot }
        const storage = createFakeStorage(JSON.stringify({ formatVersion: 1, operations: [legacyOperation] }))

        const [loadedOperation] = loadOutboxQueue(storage)

        expect(loadedOperation.kind).toBe('upsert_set')
        if (loadedOperation.kind === 'upsert_set') {
            expect(loadedOperation.snapshot.versao).toBe(2)
            expect(loadedOperation.snapshot.exercicios[0].series[0]).toEqual(repsSnapshotSet(1, 8, 12, null))
        }
    })

    it('preserva métrica, tempo, distância e quedas na ida e volta pelo armazenamento', () => {
        const storage = createFakeStorage()
        const dropSetOperation = upsertSetOperation({
            values: {
                loadKg: 30,
                reps: 12,
                rir: 0,
                note: null,
                completedAt: '2026-09-28T12:10:00.000Z',
                skippedAt: null,
                metric: 'repeticoes',
                durationSeconds: null,
                distanceM: null,
                drops: [
                    { loadKg: 20, reps: 10, durationSeconds: null, distanceM: null },
                    { loadKg: 10, reps: 8, durationSeconds: null, distanceM: null },
                ],
            },
        })

        saveOutboxQueue(storage, [dropSetOperation])

        expect(loadOutboxQueue(storage)).toEqual([dropSetOperation])
    })
})

describe('resultado de um envio com a série reescrita durante ele', () => {
    it('remove a operação enviada quando ela continua na fila', () => {
        const sentOperation = upsertSetOperation()

        expect(removeSentOperation([sentOperation], sentOperation)).toEqual([])
    })

    it('mantém a digitação nova que substituiu a operação enviada', () => {
        const sentOperation = upsertSetOperation()
        const newerOperation = upsertSetOperation({
            values: { ...sentOperation.values, loadKg: 62.5 },
            enqueuedAt: '2026-09-28T12:00:01.000Z',
        })
        const queueAfterTyping = enqueueOperation([sentOperation], newerOperation)

        expect(removeSentOperation(queueAfterTyping, sentOperation)).toEqual([newerOperation])
    })

    it('não troca a digitação nova pela tentativa falha da versão antiga', () => {
        const sentOperation = upsertSetOperation()
        const newerOperation = upsertSetOperation({ values: { ...sentOperation.values, reps: 12 } })
        const queueAfterTyping = enqueueOperation([sentOperation], newerOperation)
        const failedAttempt = { ...sentOperation, attempts: 1 }

        expect(replaceSentOperation(queueAfterTyping, sentOperation, failedAttempt)).toEqual([newerOperation])
    })

    it('registra a tentativa quando a operação enviada continua na fila', () => {
        const sentOperation = upsertSetOperation()
        const failedAttempt = { ...sentOperation, attempts: 1 }

        expect(replaceSentOperation([sentOperation], sentOperation, failedAttempt)).toEqual([failedAttempt])
    })
})

function startSessionOperation(overrides: Partial<StartSessionOperation> = {}): StartSessionOperation {
    return {
        kind: 'start_session',
        sessionDate: '2026-09-28',
        planId: 'plan-1',
        snapshot: snapshotWithOneExercise(),
        enqueuedAt: '2026-09-28T11:50:00.000Z',
        attempts: 0,
        status: 'pending',
        ...overrides,
    }
}

describe('início do treino na fila (start_session)', () => {
    it('agrupa por data, com chave própria que não se mistura com séries nem finalização', () => {
        expect(naturalKeyOf(startSessionOperation())).toBe('start_session:2026-09-28')

        const queue = enqueueOperations([], [startSessionOperation(), upsertSetOperation(), finishSessionOperation()])

        expect(queue).toHaveLength(3)
    })

    it('um novo início pendente atualiza a sessão mas mantém a hora do primeiro', () => {
        const otherSnapshot = { ...snapshotWithOneExercise(), workout_key: 'treino-b', nome: 'Treino B' }
        const firstStart = startSessionOperation()
        const laterStart = startSessionOperation({ snapshot: otherSnapshot, enqueuedAt: '2026-09-28T12:30:00.000Z' })

        const queue = enqueueOperation(enqueueOperation([], firstStart), laterStart)

        expect(queue).toHaveLength(1)
        expect(queue[0]).toEqual({ ...laterStart, enqueuedAt: '2026-09-28T11:50:00.000Z' })
    })

    it('garante a sessão a partir do início quando ainda não há série nenhuma', () => {
        const sendPlan = buildSendPlan([startSessionOperation()])

        expect(sendPlan).toEqual([
            { type: 'ensure_session', sessionDate: '2026-09-28', planId: 'plan-1', snapshot: snapshotWithOneExercise() },
            { type: 'send_operation', operation: startSessionOperation() },
        ])
    })

    it('envia o início antes das séries e da finalização da mesma data, garantindo a sessão uma vez', () => {
        const queue: OutboxOperation[] = [
            finishSessionOperation(),
            upsertSetOperation({ setIndex: 1 }),
            startSessionOperation(),
            upsertSetOperation({ sessionDate: '2026-09-27', setIndex: 1 }),
        ]

        const stepTypes = buildSendPlan(queue).map((step) =>
            step.type === 'ensure_session' ? `ensure:${step.sessionDate}` : `${step.operation.kind}:${step.operation.sessionDate}`,
        )

        expect(stepTypes).toEqual([
            'ensure:2026-09-27',
            'upsert_set:2026-09-27',
            'ensure:2026-09-28',
            'start_session:2026-09-28',
            'upsert_set:2026-09-28',
            'finish_session:2026-09-28',
        ])
    })

    it('expõe a hora de início e de fim ainda pendentes da data pedida', () => {
        const queue: OutboxOperation[] = [
            upsertSetOperation(),
            startSessionOperation({ sessionDate: '2026-09-27', enqueuedAt: '2026-09-27T10:00:00.000Z' }),
            startSessionOperation(),
            finishSessionOperation(),
        ]

        expect(findPendingStartedAt(queue, '2026-09-28')).toBe('2026-09-28T11:50:00.000Z')
        expect(findPendingFinishedAt(queue, '2026-09-28')).toBe('2026-09-28T12:05:00.000Z')
        expect(findPendingStartedAt([upsertSetOperation()], '2026-09-28')).toBeNull()
        expect(findPendingFinishedAt(queue, '2026-09-27')).toBeNull()
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
        const queue: OutboxOperation[] = [startSessionOperation(), upsertSetOperation()]

        saveOutboxQueue(storage, queue)

        expect(loadOutboxQueue(storage)).toEqual(queue)
    })

    it('o resultado do envio do início vale só para a versão enviada', () => {
        const sentStart = startSessionOperation()
        const rewrittenStart = startSessionOperation({ snapshot: { ...snapshotWithOneExercise(), nome: 'Outro' } })
        const queueDuringSend = enqueueOperation([sentStart], rewrittenStart)

        expect(removeSentOperation(queueDuringSend, sentStart)).toHaveLength(1)
    })
})
