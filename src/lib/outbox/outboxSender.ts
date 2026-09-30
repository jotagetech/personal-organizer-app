// Uma passada de envio da fila. As chamadas ao servidor chegam por um
// transporte injetado e a fila por leitura e escrita da versão mais recente,
// para as regras de corrida (o que mudou na fila durante o envio) poderem ser
// testadas sem rede nem React.

import {
    buildSendPlan,
    classifyOutboxError,
    hasSessionDeletion,
    isSessionCreatingOperation,
    markOperationAttempt,
    naturalKeyOf,
    removeSentOperation,
    replaceSentOperation,
    type OutboxOperation,
    type SendStep,
    type SessionPauseValues,
    type UpsertSetOperation,
} from '@/lib/outbox/outboxQueue'
import type { WorkoutSnapshotExercise } from '@/features/workout/types'

export type EnsureSessionStep = Extract<SendStep, { type: 'ensure_session' }>

export type OutboxTransport = {
    // Cria a sessão se ela ainda não existe e devolve o id dela.
    ensureSession: (step: EnsureSessionStep) => Promise<string>
    findSessionId: (sessionDate: string) => Promise<string | null>
    upsertSet: (sessionId: string, operation: UpsertSetOperation) => Promise<void>
    recordSessionStart: (sessionId: string, startedAt: string) => Promise<void>
    appendSessionExercise: (sessionId: string, exercise: WorkoutSnapshotExercise) => Promise<void>
    recordSessionPause: (sessionId: string, pause: SessionPauseValues) => Promise<void>
    clearSessionStart: (sessionId: string) => Promise<void>
    finishSession: (sessionId: string, finishedAt: string) => Promise<void>
    deleteSession: (sessionDate: string) => Promise<void>
}

export type OutboxQueueAccess = {
    read: () => OutboxOperation[]
    write: (nextQueue: OutboxOperation[]) => void
    // A operação a caminho do servidor agora: cancelar o início precisa saber
    // se ele pode estar chegando lá neste instante.
    setInFlight: (operation: OutboxOperation | null) => void
}

function isStillQueued(queue: OutboxOperation[], operation: OutboxOperation): boolean {
    const naturalKey = naturalKeyOf(operation)

    return queue.some((queuedOperation) => naturalKeyOf(queuedOperation) === naturalKey)
}

function hasSessionCreatingOperationFor(queue: OutboxOperation[], sessionDate: string): boolean {
    return queue.some((operation) => isSessionCreatingOperation(operation) && operation.sessionDate === sessionDate)
}

// Nem toda finalização de sessão está acompanhada de uma série pendente na
// mesma leva de envio (a última série pode ter sido confirmada numa leva
// anterior); nesse caso a sessão já existe e só falta descobrir o id dela.
async function resolveSessionId(
    sessionDate: string,
    sessionIdByDate: Map<string, string>,
    transport: OutboxTransport,
): Promise<string> {
    const cachedSessionId = sessionIdByDate.get(sessionDate)
    if (cachedSessionId) {
        return cachedSessionId
    }

    const existingSessionId = await transport.findSessionId(sessionDate)
    if (!existingSessionId) {
        throw new Error('Sessão não encontrada para finalizar')
    }

    sessionIdByDate.set(sessionDate, existingSessionId)
    return existingSessionId
}

// Sem sessão no servidor não há início para desfazer: o cancelamento conta
// como enviado em vez de virar falha.
async function sendStartCancellation(
    sessionDate: string,
    sessionIdByDate: Map<string, string>,
    transport: OutboxTransport,
): Promise<void> {
    const sessionId = sessionIdByDate.get(sessionDate) ?? (await transport.findSessionId(sessionDate))
    if (!sessionId) {
        return
    }

    sessionIdByDate.set(sessionDate, sessionId)
    await transport.clearSessionStart(sessionId)
}

async function sendSessionOperation(
    operation: Exclude<OutboxOperation, { kind: 'delete_session' | 'cancel_session_start' }>,
    sessionId: string,
    transport: OutboxTransport,
): Promise<void> {
    if (operation.kind === 'upsert_set') {
        await transport.upsertSet(sessionId, operation)
    } else if (operation.kind === 'start_session') {
        await transport.recordSessionStart(sessionId, operation.enqueuedAt)
    } else if (operation.kind === 'add_extra_exercise') {
        await transport.appendSessionExercise(sessionId, operation.exercise)
    } else if (operation.kind === 'pause_session' || operation.kind === 'resume_session') {
        await transport.recordSessionPause(sessionId, operation.pause)
    } else {
        // A fila pode ficar horas sem sinal: a hora de fim é a do momento em
        // que o treino terminou, não a do envio.
        await transport.finishSession(sessionId, operation.enqueuedAt)
    }
}

// Uma exclusão que entrou na fila durante a passada (depois de o plano ser
// montado) segura o resto da data: o que o plano ainda tinha dela foi
// descartado, e uma operação nova com a mesma chave só vale depois de a
// exclusão chegar ao servidor, na próxima passada.
function isWaitingForDeletion(queue: OutboxOperation[], step: SendStep): boolean {
    if (step.type === 'send_operation' && step.operation.kind === 'delete_session') {
        return false
    }
    const sessionDate = step.type === 'ensure_session' ? step.sessionDate : step.operation.sessionDate

    return hasSessionDeletion(queue, sessionDate)
}

// O plano é montado uma vez por passada, mas a fila continua mudando durante
// o envio: o que saiu dela nesse meio tempo (início cancelado, falha
// descartada, treino do dia excluído) não é mais enviado. Devolve se alguma
// operação chegou ao servidor.
export async function runSendPass(access: OutboxQueueAccess, transport: OutboxTransport): Promise<boolean> {
    const sessionIdByDate = new Map<string, string>()
    const blockedDates = new Set<string>()
    let madeProgress = false

    const sendPlan = buildSendPlan(access.read())
    for (const step of sendPlan) {
        if (isWaitingForDeletion(access.read(), step)) {
            continue
        }

        if (step.type === 'ensure_session') {
            if (blockedDates.has(step.sessionDate) || !hasSessionCreatingOperationFor(access.read(), step.sessionDate)) {
                continue
            }
            try {
                sessionIdByDate.set(step.sessionDate, await transport.ensureSession(step))
            } catch {
                blockedDates.add(step.sessionDate)
            }
            continue
        }

        const { operation } = step
        if (blockedDates.has(operation.sessionDate) || !isStillQueued(access.read(), operation)) {
            continue
        }

        access.setInFlight(operation)
        try {
            if (operation.kind === 'delete_session') {
                await transport.deleteSession(operation.sessionDate)
                sessionIdByDate.delete(operation.sessionDate)
            } else if (operation.kind === 'cancel_session_start') {
                await sendStartCancellation(operation.sessionDate, sessionIdByDate, transport)
            } else {
                const sessionId = await resolveSessionId(operation.sessionDate, sessionIdByDate, transport)
                await sendSessionOperation(operation, sessionId, transport)
            }

            madeProgress = true
            access.write(removeSentOperation(access.read(), operation))
        } catch (sendError) {
            const classification = classifyOutboxError(sendError)
            const attemptedOperation = markOperationAttempt(operation, classification)
            access.write(replaceSentOperation(access.read(), operation, attemptedOperation))
            // O que vem depois de uma exclusão que não chegou ao servidor
            // cairia na sessão antiga, então a data para por aqui.
            if (classification === 'retry' || operation.kind === 'delete_session') {
                blockedDates.add(operation.sessionDate)
            }
        } finally {
            access.setInFlight(null)
        }
    }

    return madeProgress
}
