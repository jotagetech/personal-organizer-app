// Persistência da fila em localStorage. O schema Zod aqui não é o mesmo tipo
// que outboxQueue.ts exporta por acaso: qualquer coisa lida do localStorage é
// dado externo não confiável (formato antigo, escrita corrompida, edição
// manual), então precisa de validação de verdade antes de virar estado do
// app, não só um cast de tipo.

import { z } from 'zod'

import { SET_METRICS } from '@/lib/workoutPlanSchema'
import { storedWorkoutSnapshotSchema } from '@/lib/workoutSnapshotSchema'
import type { OutboxOperation } from '@/lib/outbox/outboxQueue'

const OUTBOX_STORAGE_KEY = 'outbox_queue'
const CURRENT_FORMAT_VERSION = 1

export type OutboxStorageAdapter = {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
}

const outboxDropValuesSchema = z.object({
    loadKg: z.number().nullable(),
    reps: z.number().nullable(),
    durationSeconds: z.number().nullable(),
    distanceM: z.number().nullable(),
})

const outboxSetValuesSchema = z.object({
    loadKg: z.number().nullable(),
    reps: z.number().nullable(),
    rir: z.number().nullable(),
    note: z.string().nullable(),
    completedAt: z.string().nullable(),
    // Filas gravadas antes de existir o estado "pulada" não têm esse campo;
    // obrigatório, o envelope inteiro falharia na validação e seria descartado.
    skippedAt: z.string().nullable().default(null),
    // Mesmo motivo: filas anteriores a séries de tempo, distância e drop set
    // não trazem estes campos.
    metric: z.enum(SET_METRICS).nullable().optional(),
    durationSeconds: z.number().nullable().optional(),
    distanceM: z.number().nullable().optional(),
    drops: z.array(outboxDropValuesSchema).nullable().optional(),
    rpe: z.number().nullable().optional(),
})

const outboxOperationStatusSchema = z.enum(['pending', 'failed'])

const upsertSetOperationSchema = z.object({
    kind: z.literal('upsert_set'),
    sessionDate: z.string(),
    planId: z.string(),
    // Snapshots enfileirados antes do formato atual são convertidos na leitura
    // em vez de invalidar a fila inteira (e perder séries ainda não enviadas).
    snapshot: storedWorkoutSnapshotSchema,
    exerciseKey: z.string(),
    setIndex: z.number().int(),
    values: outboxSetValuesSchema,
    enqueuedAt: z.string(),
    attempts: z.number().int().nonnegative(),
    status: outboxOperationStatusSchema,
})

const startSessionOperationSchema = z.object({
    kind: z.literal('start_session'),
    sessionDate: z.string(),
    planId: z.string(),
    snapshot: storedWorkoutSnapshotSchema,
    enqueuedAt: z.string(),
    attempts: z.number().int().nonnegative(),
    status: outboxOperationStatusSchema,
})

const finishSessionOperationSchema = z.object({
    kind: z.literal('finish_session'),
    sessionDate: z.string(),
    enqueuedAt: z.string(),
    attempts: z.number().int().nonnegative(),
    status: outboxOperationStatusSchema,
})

const sessionPauseValuesSchema = z.object({
    pausedAt: z.string().nullable(),
    pausedSeconds: z.number().int().nonnegative(),
})

function sessionPauseOperationSchema<Kind extends 'pause_session' | 'resume_session'>(kind: Kind) {
    return z.object({
        kind: z.literal(kind),
        sessionDate: z.string(),
        pause: sessionPauseValuesSchema,
        enqueuedAt: z.string(),
        attempts: z.number().int().nonnegative(),
        status: outboxOperationStatusSchema,
    })
}

const cancelSessionStartOperationSchema = z.object({
    kind: z.literal('cancel_session_start'),
    sessionDate: z.string(),
    enqueuedAt: z.string(),
    attempts: z.number().int().nonnegative(),
    status: outboxOperationStatusSchema,
})

// Tipos novos de operação entram na união sem mudar a versão do envelope:
// filas gravadas antes deles continuam válidas, só não os contêm.
const outboxOperationSchema = z.discriminatedUnion('kind', [
    upsertSetOperationSchema,
    startSessionOperationSchema,
    sessionPauseOperationSchema('pause_session'),
    sessionPauseOperationSchema('resume_session'),
    cancelSessionStartOperationSchema,
    finishSessionOperationSchema,
])

const outboxEnvelopeSchema = z.object({
    formatVersion: z.literal(CURRENT_FORMAT_VERSION),
    operations: z.array(outboxOperationSchema),
})

export function loadOutboxQueue(storage: OutboxStorageAdapter): OutboxOperation[] {
    const rawValue = storage.getItem(OUTBOX_STORAGE_KEY)
    if (!rawValue) {
        return []
    }

    let parsedJson: unknown
    try {
        parsedJson = JSON.parse(rawValue)
    } catch {
        return []
    }

    const validationResult = outboxEnvelopeSchema.safeParse(parsedJson)
    if (!validationResult.success) {
        return []
    }

    return validationResult.data.operations
}

export function saveOutboxQueue(storage: OutboxStorageAdapter, queue: OutboxOperation[]): void {
    const envelope = { formatVersion: CURRENT_FORMAT_VERSION, operations: queue }
    storage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(envelope))
}

export function clearOutboxQueue(storage: OutboxStorageAdapter): void {
    storage.removeItem(OUTBOX_STORAGE_KEY)
}
