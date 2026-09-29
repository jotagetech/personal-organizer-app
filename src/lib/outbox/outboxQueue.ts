// Fila de escrita otimista para o treino: nada aqui toca rede ou localStorage,
// só as regras de agrupamento, ordenação de envio, backoff e classificação de
// erro, pra poder testar sem mock de I/O.

import { setKey, type WorkoutSetRow, type WorkoutSnapshot } from '@/features/workout/types'
import type { SetMetric } from '@/lib/workoutPlanSchema'

export type OutboxOperationStatus = 'pending' | 'failed'

// Cada queda de um drop set é gravada como registro próprio; a posição na
// lista define o índice da queda (a primeira é 1).
export type OutboxDropValues = {
    loadKg: number | null
    reps: number | null
    durationSeconds: number | null
    distanceM: number | null
}

// Os campos opcionais existem para séries de tempo, distância e drop set.
// Ausentes, a série é gravada como repetições; `drops` ausente ou null não
// mexe nas quedas já salvas, enquanto uma lista (mesmo vazia) substitui todas.
export type OutboxSetValues = {
    loadKg: number | null
    reps: number | null
    rir: number | null
    note: string | null
    completedAt: string | null
    skippedAt: string | null
    metric?: SetMetric | null
    durationSeconds?: number | null
    distanceM?: number | null
    drops?: OutboxDropValues[] | null
}

export type UpsertSetOperation = {
    kind: 'upsert_set'
    sessionDate: string
    planId: string
    snapshot: WorkoutSnapshot
    exerciseKey: string
    setIndex: number
    values: OutboxSetValues
    enqueuedAt: string
    attempts: number
    status: OutboxOperationStatus
}

export type FinishSessionOperation = {
    kind: 'finish_session'
    sessionDate: string
    enqueuedAt: string
    attempts: number
    status: OutboxOperationStatus
}

export type OutboxOperation = UpsertSetOperation | FinishSessionOperation

export type OutboxErrorClassification = 'retry' | 'terminal'

export type SendStep =
    | { type: 'ensure_session'; sessionDate: string; planId: string; snapshot: WorkoutSnapshot }
    | { type: 'send_operation'; operation: OutboxOperation }

export const BACKOFF_SCHEDULE_MS = [5000, 15000, 30000, 60000] as const

// Chave de agrupamento natural: uma nova operação para a mesma série ou para a
// mesma finalização de sessão substitui a anterior, então autosaves repetidos
// nunca acumulam mais de uma entrada pendente por série.
export function naturalKeyOf(operation: OutboxOperation): string {
    if (operation.kind === 'upsert_set') {
        return `upsert_set:${operation.sessionDate}:${operation.exerciseKey}:${operation.setIndex}`
    }

    return `finish_session:${operation.sessionDate}`
}

// Uma escrita da série sem `drops` significa "não mexer nas quedas". Se ela
// substituísse por inteiro uma escrita ainda pendente que levava quedas (a
// carga da série corrigida logo depois de lançar as quedas, sem sinal), essas
// quedas nunca chegariam ao banco; por isso elas passam para a nova escrita.
function carryOverPendingDrops(existing: OutboxOperation, replacement: OutboxOperation): OutboxOperation {
    if (existing.kind !== 'upsert_set' || replacement.kind !== 'upsert_set') {
        return replacement
    }
    const replacementTouchesDrops = replacement.values.drops != null
    const existingDrops = existing.values.drops
    if (replacementTouchesDrops || existingDrops == null) {
        return replacement
    }

    return { ...replacement, values: { ...replacement.values, drops: existingDrops } }
}

export function enqueueOperation(queue: OutboxOperation[], operation: OutboxOperation): OutboxOperation[] {
    const naturalKey = naturalKeyOf(operation)
    const existingIndex = queue.findIndex((existing) => naturalKeyOf(existing) === naturalKey)

    if (existingIndex === -1) {
        return [...queue, operation]
    }

    const nextQueue = [...queue]
    nextQueue[existingIndex] = carryOverPendingDrops(queue[existingIndex], operation)
    return nextQueue
}

export function enqueueOperations(queue: OutboxOperation[], operations: OutboxOperation[]): OutboxOperation[] {
    return operations.reduce(enqueueOperation, queue)
}

export function removeOperation(queue: OutboxOperation[], naturalKey: string): OutboxOperation[] {
    return queue.filter((operation) => naturalKeyOf(operation) !== naturalKey)
}

export function replaceOperationInQueue(
    queue: OutboxOperation[],
    updatedOperation: OutboxOperation,
): OutboxOperation[] {
    const naturalKey = naturalKeyOf(updatedOperation)
    return queue.map((existing) => (naturalKeyOf(existing) === naturalKey ? updatedOperation : existing))
}

// Erro classificado como "retry" mantém a operação pendente pro próximo ciclo;
// "terminal" marca como falha definitiva, pra não girar em loop numa violação
// de dado que uma nova tentativa nunca vai corrigir sozinha.
export function markOperationAttempt(
    operation: OutboxOperation,
    classification: OutboxErrorClassification,
): OutboxOperation {
    const attempts = operation.attempts + 1
    const status: OutboxOperationStatus = classification === 'terminal' ? 'failed' : 'pending'

    return { ...operation, attempts, status }
}

export function operationsForDate(queue: OutboxOperation[], sessionDate: string): OutboxOperation[] {
    return queue.filter((operation) => operation.sessionDate === sessionDate)
}

export function operationsWithStatus(
    queue: OutboxOperation[],
    status: OutboxOperationStatus,
): OutboxOperation[] {
    return queue.filter((operation) => operation.status === status)
}

export function countByStatus(queue: OutboxOperation[]): { pending: number; failed: number } {
    let pending = 0
    let failed = 0

    for (const operation of queue) {
        if (operation.status === 'pending') {
            pending += 1
        } else {
            failed += 1
        }
    }

    return { pending, failed }
}

// Uma sessão sem id real ainda (nunca confirmada no servidor) não pode ser
// referenciada por id em cada série da fila, então a série carrega os dados
// pra recriar a sessão (idempotente via upsert) antes de ser enviada. Sessões
// já garantidas na mesma passada de envio não precisam ser repetidas.
function sendPriority(operation: OutboxOperation): number {
    return operation.kind === 'upsert_set' ? 0 : 1
}

export function sortQueueForSending(queue: OutboxOperation[]): OutboxOperation[] {
    return [...queue].sort((a, b) => {
        if (a.sessionDate !== b.sessionDate) {
            return a.sessionDate < b.sessionDate ? -1 : 1
        }

        return sendPriority(a) - sendPriority(b)
    })
}

export function buildSendPlan(queue: OutboxOperation[]): SendStep[] {
    const pendingOperations = queue.filter((operation) => operation.status === 'pending')
    const sortedOperations = sortQueueForSending(pendingOperations)
    const sessionsAlreadyEnsured = new Set<string>()
    const steps: SendStep[] = []

    for (const operation of sortedOperations) {
        if (operation.kind === 'upsert_set' && !sessionsAlreadyEnsured.has(operation.sessionDate)) {
            steps.push({
                type: 'ensure_session',
                sessionDate: operation.sessionDate,
                planId: operation.planId,
                snapshot: operation.snapshot,
            })
            sessionsAlreadyEnsured.add(operation.sessionDate)
        }

        steps.push({ type: 'send_operation', operation })
    }

    return steps
}

export function nextBackoffDelayMs(previousDelayMs: number | null): number {
    if (previousDelayMs === null) {
        return BACKOFF_SCHEDULE_MS[0]
    }

    const currentIndex = BACKOFF_SCHEDULE_MS.indexOf(
        previousDelayMs as (typeof BACKOFF_SCHEDULE_MS)[number],
    )
    const nextIndex = currentIndex === -1 ? BACKOFF_SCHEDULE_MS.length - 1 : currentIndex + 1
    const cappedIndex = Math.min(nextIndex, BACKOFF_SCHEDULE_MS.length - 1)

    return BACKOFF_SCHEDULE_MS[cappedIndex]
}

export function classifyOutboxError(error: unknown): OutboxErrorClassification {
    const httpStatus = extractHttpStatus(error)
    if (httpStatus !== null) {
        return httpStatus >= 500 || httpStatus === 429 ? 'retry' : 'terminal'
    }

    const postgresErrorCode = extractPostgresErrorCode(error)
    if (postgresErrorCode !== null) {
        // Classe "23" do SQLSTATE é violação de restrição de integridade
        // (unique, not null, foreign key etc.): tentar de novo nunca resolve.
        return postgresErrorCode.startsWith('23') ? 'terminal' : 'retry'
    }

    if (isAbortOrTimeoutError(error) || isNetworkFailure(error)) {
        return 'retry'
    }

    return 'terminal'
}

function extractHttpStatus(error: unknown): number | null {
    if (typeof error !== 'object' || error === null || !('status' in error)) {
        return null
    }
    const statusValue = (error as { status: unknown }).status

    return typeof statusValue === 'number' ? statusValue : null
}

function extractPostgresErrorCode(error: unknown): string | null {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
        return null
    }
    const codeValue = (error as { code: unknown }).code

    return typeof codeValue === 'string' ? codeValue : null
}

function isAbortOrTimeoutError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false
    }

    return error.name === 'AbortError' || /timeout/i.test(error.message)
}

function isNetworkFailure(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false
    }

    return error instanceof TypeError || /network|fetch/i.test(error.message)
}

// Sobrepõe as séries ainda não confirmadas no servidor por cima das que já
// vieram de lá, pra quem está montando a tela nunca "voltar" pra uma série que
// o usuário já confirmou localmente, mesmo que o envio ainda não tenha
// chegado no banco.
export function overlayPendingSets(
    setsByKey: Map<string, WorkoutSetRow>,
    pendingOperations: OutboxOperation[],
    sessionDate: string,
): Map<string, WorkoutSetRow> {
    const overlaidSetsByKey = new Map(setsByKey)

    for (const operation of pendingOperations) {
        if (operation.kind !== 'upsert_set' || operation.sessionDate !== sessionDate) {
            continue
        }

        const key = setKey(operation.exerciseKey, operation.setIndex)
        overlaidSetsByKey.set(key, buildOverlaySetRow(operation, overlaidSetsByKey.get(key)))
    }

    return overlaidSetsByKey
}

export function buildOverlaySetRow(
    operation: UpsertSetOperation,
    existingServerSet: WorkoutSetRow | undefined,
): WorkoutSetRow {
    return {
        id: existingServerSet?.id ?? `pending:${operation.exerciseKey}:${operation.setIndex}`,
        session_id: existingServerSet?.session_id ?? 'pending',
        exercise_key: operation.exerciseKey,
        set_index: operation.setIndex,
        load_kg: operation.values.loadKg,
        reps: operation.values.reps,
        rir: operation.values.rir,
        note: operation.values.note,
        completed_at: operation.values.completedAt,
        skipped_at: operation.values.skippedAt,
        metric: operation.values.metric ?? null,
        duration_seconds: operation.values.durationSeconds ?? null,
        distance_m: operation.values.distanceM ?? null,
        updated_at: operation.enqueuedAt,
    }
}

// Mesma ideia de overlayPendingSets para as quedas de drop set: a lista que
// ainda está na fila vence a que veio do servidor. Escrita sem `drops` não
// diz nada sobre as quedas e mantém o que já havia.
export function overlayPendingDrops(
    dropsBySetKey: Map<string, OutboxDropValues[]>,
    pendingOperations: OutboxOperation[],
    sessionDate: string,
): Map<string, OutboxDropValues[]> {
    const overlaidDropsBySetKey = new Map(dropsBySetKey)

    for (const operation of pendingOperations) {
        if (operation.kind !== 'upsert_set' || operation.sessionDate !== sessionDate) {
            continue
        }
        if (operation.values.drops == null) {
            continue
        }

        overlaidDropsBySetKey.set(setKey(operation.exerciseKey, operation.setIndex), operation.values.drops)
    }

    return overlaidDropsBySetKey
}

// Inverso de buildOverlaySetRow: regrava a série exatamente como está, para
// quem só quer mudar as quedas dela sem tocar no resto.
export function setValuesFromRow(row: WorkoutSetRow): OutboxSetValues {
    return {
        loadKg: row.load_kg,
        reps: row.reps,
        rir: row.rir,
        note: row.note,
        completedAt: row.completed_at,
        skippedAt: row.skipped_at,
        metric: row.metric,
        durationSeconds: row.duration_seconds,
        distanceM: row.distance_m,
    }
}
