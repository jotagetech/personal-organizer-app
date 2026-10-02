import { isSetResolved } from '@/features/workout/sessionProgress'
import type { WorkoutSessionRow, WorkoutSetRow } from '@/features/workout/types'

const MS_PER_SECOND = 1000

// Estado completo da pausa: pausedAt é o início da pausa em andamento (nulo
// com o treino correndo) e pausedSeconds o total das pausas já encerradas.
// É gravado sempre inteiro, nunca como incremento, para que reenviar a mesma
// escrita dê sempre o mesmo resultado.
export type SessionPauseState = {
    pausedAt: string | null
    pausedSeconds: number
}

export const RUNNING_PAUSE_STATE: SessionPauseState = { pausedAt: null, pausedSeconds: 0 }

export type SessionPauseColumns = Pick<WorkoutSessionRow, 'paused_at' | 'paused_seconds'>

function timeOf(iso: string): number {
    return new Date(iso).getTime()
}

function nonNegativeSeconds(value: number | undefined): number {
    const isUsable = typeof value === 'number' && Number.isFinite(value) && value > 0

    return isUsable ? Math.floor(value) : 0
}

export function pauseStateFromSession(session: SessionPauseColumns): SessionPauseState {
    const pauseState: SessionPauseState = {
        pausedAt: session.paused_at ?? null,
        pausedSeconds: nonNegativeSeconds(session.paused_seconds),
    }

    return pauseState
}

export function isPaused(pauseState: SessionPauseState): boolean {
    return pauseState.pausedAt !== null
}

// Pausar de novo uma sessão já pausada não muda nada: o início da pausa é o
// primeiro toque.
export function pauseAt(pauseState: SessionPauseState, pausedAtIso: string): SessionPauseState {
    if (isPaused(pauseState)) {
        return pauseState
    }

    return { pausedAt: pausedAtIso, pausedSeconds: pauseState.pausedSeconds }
}

// Retomar fecha a pausa em andamento e soma a duração dela ao total. Um
// relógio do aparelho que voltou para trás não gera pausa negativa.
export function resumeAt(pauseState: SessionPauseState, resumedAtIso: string): SessionPauseState {
    if (pauseState.pausedAt === null) {
        return pauseState
    }

    const closedPauseSeconds = secondsBetween(pauseState.pausedAt, timeOf(resumedAtIso))
    return { pausedAt: null, pausedSeconds: pauseState.pausedSeconds + closedPauseSeconds }
}

function millisecondsBetween(startIso: string, endMs: number): number {
    const elapsedMs = endMs - timeOf(startIso)
    const isUsable = Number.isFinite(elapsedMs) && elapsedMs > 0
    const usableMs = isUsable ? elapsedMs : 0

    return usableMs
}

function secondsBetween(startIso: string, endMs: number): number {
    const elapsedSeconds = Math.floor(millisecondsBetween(startIso, endMs) / MS_PER_SECOND)

    return elapsedSeconds
}

// Tempo pausado até o instante pedido, contando a pausa em andamento, que
// termina no máximo nele.
export function pausedSecondsUntil(pauseState: SessionPauseState, untilMs: number): number {
    const ongoingSeconds = pauseState.pausedAt === null ? 0 : secondsBetween(pauseState.pausedAt, untilMs)

    return nonNegativeSeconds(pauseState.pausedSeconds) + ongoingSeconds
}

// Tempo de treino efetivo entre o início e o instante pedido. Com a pausa em
// andamento o valor para de crescer, então o relógio fica congelado sem
// depender de nenhum contador em memória. A conta é feita em milissegundos e
// arredondada uma vez só: arredondar o total e a pausa em andamento cada um
// por si faria o relógio pausado oscilar 1 s, porque as frações de segundo
// do início do treino e do início da pausa viram o segundo em momentos
// diferentes.
export function activeSecondsBetween(startedAtIso: string, untilMs: number, pauseState: SessionPauseState): number {
    const totalMs = millisecondsBetween(startedAtIso, untilMs)
    const ongoingPauseMs = pauseState.pausedAt === null ? 0 : millisecondsBetween(pauseState.pausedAt, untilMs)
    const closedPauseMs = nonNegativeSeconds(pauseState.pausedSeconds) * MS_PER_SECOND
    const activeMs = Math.max(0, totalMs - ongoingPauseMs - closedPauseMs)
    const activeSeconds = Math.floor(activeMs / MS_PER_SECOND)

    return activeSeconds
}

// Cancelar o início só faz sentido enquanto nada do treino foi registrado;
// depois da primeira série concluída ou pulada, o treino só pode ser pausado.
export function canCancelStart(sets: Iterable<WorkoutSetRow>): boolean {
    for (const set of sets) {
        if (isSetResolved(set)) {
            return false
        }
    }

    return true
}
