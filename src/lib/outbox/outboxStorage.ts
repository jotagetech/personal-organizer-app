// Persistência da fila em localStorage. O schema Zod aqui não é o mesmo tipo
// que outboxQueue.ts exporta por acaso: qualquer coisa lida do localStorage é
// dado externo não confiável (formato antigo, escrita corrompida, edição
// manual), então precisa de validação de verdade antes de virar estado do
// app, não só um cast de tipo.

import { z } from 'zod'

import { LOAD_CONVENTIONS } from '@/lib/workoutPlanSchema'
import type { OutboxOperation } from '@/lib/outbox/outboxQueue'

const OUTBOX_STORAGE_KEY = 'outbox_queue'
const CURRENT_FORMAT_VERSION = 1

export type OutboxStorageAdapter = {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
}

const outboxSnapshotSetSchema = z.object({
    set_index: z.number().int(),
    repeticoes_min: z.number().int(),
    repeticoes_max: z.number().int(),
    carga_sugerida: z.number().nullable(),
})

const outboxSnapshotExerciseSchema = z.object({
    exercise_key: z.string(),
    nome: z.string(),
    forma_carga: z.enum(LOAD_CONVENTIONS),
    series: z.array(outboxSnapshotSetSchema),
})

const outboxSnapshotSchema = z.object({
    workout_key: z.string(),
    nome: z.string(),
    exercicios: z.array(outboxSnapshotExerciseSchema),
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
})

const outboxOperationStatusSchema = z.enum(['pending', 'failed'])

const upsertSetOperationSchema = z.object({
    kind: z.literal('upsert_set'),
    sessionDate: z.string(),
    planId: z.string(),
    snapshot: outboxSnapshotSchema,
    exerciseKey: z.string(),
    setIndex: z.number().int(),
    values: outboxSetValuesSchema,
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

const outboxOperationSchema = z.discriminatedUnion('kind', [
    upsertSetOperationSchema,
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
