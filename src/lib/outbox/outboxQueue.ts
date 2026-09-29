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

// Os campos opcionais existem para séries de tempo, distância, drop set e
// rodadas de intervalado. Ausentes, a série é gravada como repetições; `drops`
// ausente ou null não mexe nas quedas já salvas, enquanto uma lista (mesmo
// vazia) substitui todas. `rpe` ausente fica fora da escrita, para séries
// comuns nunca dependerem da coluna.
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
    rpe?: number | null
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

// Início do treino: enqueuedAt é a hora em que o usuário começou, e é ela que
// vai para started_at, por mais que o envio demore. Leva os dados da sessão
// como a série, porque o treino pode começar antes de qualquer série existir.
export type StartSessionOperation = {
    kind: 'start_session'
    sessionDate: string
    planId: string
    snapshot: WorkoutSnapshot
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

// Pausar e retomar levam o estado completo da pausa, calculado no aparelho com
// a hora de cada toque, e não um incremento: reenviar a mesma escrita depois
// de uma resposta perdida grava exatamente o mesmo valor. As duas dividem a
// chave de agrupamento, então pausar e retomar várias vezes sem sinal deixa
// só o estado mais recente na fila.
export type SessionPauseValues = {
    pausedAt: string | null
    pausedSeconds: number
}

type SessionPauseOperationOf<Kind extends string> = {
    kind: Kind
    sessionDate: string
    pause: SessionPauseValues
    enqueuedAt: string
    attempts: number
    status: OutboxOperationStatus
}

export type PauseSessionOperation = SessionPauseOperationOf<'pause_session'>
export type ResumeSessionOperation = SessionPauseOperationOf<'resume_session'>
export type SessionPauseOperation = PauseSessionOperation | ResumeSessionOperation

// Desfaz no servidor um início que pode já ter chegado lá. Um início que
// nunca saiu do aparelho é cancelado só tirando ele da fila, sem esta
// operação (ver cancelSessionStart).
export type CancelSessionStartOperation = {
    kind: 'cancel_session_start'
    sessionDate: string
    enqueuedAt: string
    attempts: number
    status: OutboxOperationStatus
}

export type OutboxOperation =
    | UpsertSetOperation
    | StartSessionOperation
    | PauseSessionOperation
    | ResumeSessionOperation
    | CancelSessionStartOperation
    | FinishSessionOperation

// Operações que conseguem criar a sessão do dia sozinhas, sem depender de uma
// sessão já confirmada no servidor.
export type SessionCreatingOperation = UpsertSetOperation | StartSessionOperation

export type OutboxErrorClassification = 'retry' | 'terminal'

export type SendStep =
    | { type: 'ensure_session'; sessionDate: string; planId: string; snapshot: WorkoutSnapshot }
    | { type: 'send_operation'; operation: OutboxOperation }

export const BACKOFF_SCHEDULE_MS = [5000, 15000, 30000, 60000] as const

// Chave de agrupamento natural: uma nova operação para a mesma série, para o
// mesmo início ou para a mesma finalização de sessão substitui a anterior,
// então autosaves repetidos nunca acumulam mais de uma entrada pendente.
export function naturalKeyOf(operation: OutboxOperation): string {
    if (operation.kind === 'upsert_set') {
        return `upsert_set:${operation.sessionDate}:${operation.exerciseKey}:${operation.setIndex}`
    }
    if (operation.kind === 'pause_session' || operation.kind === 'resume_session') {
        return `session_pause:${operation.sessionDate}`
    }

    return `${operation.kind}:${operation.sessionDate}`
}

export function isSessionCreatingOperation(operation: OutboxOperation): operation is SessionCreatingOperation {
    const createsSession = operation.kind === 'upsert_set' || operation.kind === 'start_session'

    return createsSession
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

// O treino começa uma vez só: um novo início ainda pendente (troca do treino
// escolhido antes de a sessão existir no servidor, por exemplo) atualiza os
// dados da sessão, mas mantém a hora do primeiro.
function keepEarliestStart(existing: OutboxOperation, replacement: OutboxOperation): OutboxOperation {
    if (existing.kind !== 'start_session' || replacement.kind !== 'start_session') {
        return replacement
    }
    const enqueuedAt = existing.enqueuedAt < replacement.enqueuedAt ? existing.enqueuedAt : replacement.enqueuedAt

    return { ...replacement, enqueuedAt }
}

function mergeReplacement(existing: OutboxOperation, replacement: OutboxOperation): OutboxOperation {
    const mergedOperation = keepEarliestStart(existing, carryOverPendingDrops(existing, replacement))

    return mergedOperation
}

export function enqueueOperation(queue: OutboxOperation[], operation: OutboxOperation): OutboxOperation[] {
    const naturalKey = naturalKeyOf(operation)
    const existingIndex = queue.findIndex((existing) => naturalKeyOf(existing) === naturalKey)

    if (existingIndex === -1) {
        return [...queue, operation]
    }

    const nextQueue = [...queue]
    nextQueue[existingIndex] = mergeReplacement(queue[existingIndex], operation)
    return nextQueue
}

export function enqueueOperations(queue: OutboxOperation[], operations: OutboxOperation[]): OutboxOperation[] {
    return operations.reduce(enqueueOperation, queue)
}

export function removeOperation(queue: OutboxOperation[], naturalKey: string): OutboxOperation[] {
    return queue.filter((operation) => naturalKeyOf(operation) !== naturalKey)
}

// O envio é assíncrono e a fila continua aceitando escritas durante ele: uma
// digitação nova da mesma série substitui a operação que está a caminho do
// servidor. O resultado do envio só vale para a versão exata que foi enviada;
// se ela já foi substituída, a versão nova fica na fila, intacta, para o
// próximo ciclo.
export function removeSentOperation(queue: OutboxOperation[], sentOperation: OutboxOperation): OutboxOperation[] {
    const remainingQueue = queue.filter((operation) => operation !== sentOperation)

    return remainingQueue
}

export function replaceSentOperation(
    queue: OutboxOperation[],
    sentOperation: OutboxOperation,
    updatedOperation: OutboxOperation,
): OutboxOperation[] {
    const nextQueue = queue.map((operation) => (operation === sentOperation ? updatedOperation : operation))

    return nextQueue
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

// Dentro da mesma data, o início vai antes da pausa, das séries e da
// finalização, na ordem em que as coisas aconteceram no treino. O
// cancelamento de um início anterior vem antes de tudo: com ele ainda na
// fila, um início novo só vale depois de o antigo ter sido desfeito.
const SEND_PRIORITY_BY_KIND: Record<OutboxOperation['kind'], number> = {
    cancel_session_start: 0,
    start_session: 1,
    pause_session: 2,
    resume_session: 2,
    upsert_set: 3,
    finish_session: 4,
}

function sendPriority(operation: OutboxOperation): number {
    return SEND_PRIORITY_BY_KIND[operation.kind]
}

export function sortQueueForSending(queue: OutboxOperation[]): OutboxOperation[] {
    return [...queue].sort((a, b) => {
        if (a.sessionDate !== b.sessionDate) {
            return a.sessionDate < b.sessionDate ? -1 : 1
        }

        return sendPriority(a) - sendPriority(b)
    })
}

// Uma sessão sem id real ainda (nunca confirmada no servidor) não pode ser
// referenciada por id em cada operação da fila, então o início e a série
// carregam os dados pra recriar a sessão (idempotente via upsert) antes de
// serem enviados. Sessões já garantidas na mesma passada de envio não
// precisam ser repetidas.
export function buildSendPlan(queue: OutboxOperation[]): SendStep[] {
    const pendingOperations = queue.filter((operation) => operation.status === 'pending')
    const sortedOperations = sortQueueForSending(pendingOperations)
    const sessionsAlreadyEnsured = new Set<string>()
    const steps: SendStep[] = []

    for (const operation of sortedOperations) {
        if (isSessionCreatingOperation(operation) && !sessionsAlreadyEnsured.has(operation.sessionDate)) {
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

// Enquanto o início não chega ao servidor, é a hora guardada na fila que a
// tela usa para o contador do treino; o mesmo vale para a finalização.
export function findPendingStartedAt(operations: OutboxOperation[], sessionDate: string): string | null {
    const startOperation = operations.find(
        (operation) => operation.kind === 'start_session' && operation.sessionDate === sessionDate,
    )
    const pendingStartedAt = startOperation?.enqueuedAt ?? null

    return pendingStartedAt
}

// Estado da pausa ainda não confirmado no servidor; vence o que veio de lá,
// porque é sempre mais recente.
export function findPendingPauseState(operations: OutboxOperation[], sessionDate: string): SessionPauseValues | null {
    const pauseOperation = operations.find(
        (operation): operation is SessionPauseOperation =>
            (operation.kind === 'pause_session' || operation.kind === 'resume_session') &&
            operation.sessionDate === sessionDate,
    )
    const pendingPauseState = pauseOperation?.pause ?? null

    return pendingPauseState
}

export function hasPendingStartCancellation(operations: OutboxOperation[], sessionDate: string): boolean {
    const hasCancellation = operations.some(
        (operation) => operation.kind === 'cancel_session_start' && operation.sessionDate === sessionDate,
    )

    return hasCancellation
}

// Com um cancelamento ainda na fila, o início e a pausa que vieram do servidor
// já foram desfeitos no aparelho e não valem mais; só um início novo, também
// pendente, conta.
export function resolveEffectiveStartedAt(
    serverStartedAt: string | null,
    operations: OutboxOperation[],
    sessionDate: string,
): string | null {
    const pendingStartedAt = findPendingStartedAt(operations, sessionDate)
    if (hasPendingStartCancellation(operations, sessionDate)) {
        return pendingStartedAt
    }

    return serverStartedAt ?? pendingStartedAt
}

export function resolveEffectivePauseState(
    serverPauseState: SessionPauseValues,
    operations: OutboxOperation[],
    sessionDate: string,
): SessionPauseValues {
    const pendingPauseState = findPendingPauseState(operations, sessionDate)
    if (pendingPauseState) {
        return pendingPauseState
    }
    if (hasPendingStartCancellation(operations, sessionDate)) {
        return { pausedAt: null, pausedSeconds: 0 }
    }

    return serverPauseState
}

function isStartOrPauseOf(operation: OutboxOperation, sessionDate: string): boolean {
    const isStartOrPause =
        operation.sessionDate === sessionDate &&
        (operation.kind === 'start_session' || operation.kind === 'pause_session' || operation.kind === 'resume_session')

    return isStartOrPause
}

// Um início que nunca tentou sair do aparelho (sem tentativa registrada e
// sem estar a caminho do servidor agora) pode ser desfeito só tirando ele da
// fila junto com a pausa, sem mandar início e cancelamento em sequência. Se
// ele já foi tentado, a resposta pode ter se perdido com a escrita feita,
// então o cancelamento vai para o servidor; o mesmo quando o início já saiu
// da fila. Um cancelamento anterior ainda pendente continua valendo.
export function cancelSessionStart(
    queue: OutboxOperation[],
    sessionDate: string,
    cancelledAt: string,
    inFlightOperation: OutboxOperation | null,
): OutboxOperation[] {
    const pendingStart = queue.find(
        (operation) => operation.kind === 'start_session' && operation.sessionDate === sessionDate,
    )
    const isStartInFlight =
        pendingStart !== undefined &&
        inFlightOperation !== null &&
        naturalKeyOf(inFlightOperation) === naturalKeyOf(pendingStart)
    const startNeverLeftDevice = pendingStart !== undefined && pendingStart.attempts === 0 && !isStartInFlight
    const queueWithoutStart = queue.filter((operation) => !isStartOrPauseOf(operation, sessionDate))

    if (startNeverLeftDevice) {
        return queueWithoutStart
    }

    const cancelOperation: CancelSessionStartOperation = {
        kind: 'cancel_session_start',
        sessionDate,
        enqueuedAt: cancelledAt,
        attempts: 0,
        status: 'pending',
    }
    return enqueueOperation(queueWithoutStart, cancelOperation)
}

export function findPendingFinishedAt(operations: OutboxOperation[], sessionDate: string): string | null {
    const finishOperation = operations.find(
        (operation) => operation.kind === 'finish_session' && operation.sessionDate === sessionDate,
    )
    const pendingFinishedAt = finishOperation?.enqueuedAt ?? null

    return pendingFinishedAt
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
        rpe: operation.values.rpe !== undefined ? operation.values.rpe : (existingServerSet?.rpe ?? null),
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
