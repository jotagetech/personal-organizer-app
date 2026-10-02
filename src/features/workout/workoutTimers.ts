// Lógica pura dos cronômetros da sessão. Todo tempo decorrido sai de
// timestamps: somar ticks de intervalo erra assim que o iPhone suspende a aba,
// e um timestamp guardado continua valendo depois de o app ser fechado.

export const REST_EXTENSION_SECONDS = 15
// Registros mais velhos que isso são de um treino esquecido, não de um timer
// que ainda faça sentido retomar.
const MAX_RECORD_AGE_MS = 3 * 60 * 60 * 1000

export type StopwatchPhase = 'antes_do_minimo' | 'na_faixa' | 'passou_do_maximo'

export type RestPhase = 'aguardando_minimo' | 'na_faixa' | 'terminado'

export type StopwatchRecord = {
    sessionDate: string
    setKey: string
    startedAtMs: number
}

export type RestTimer = {
    sessionDate: string
    startedAtMs: number
    minSeconds: number
    maxSeconds: number
    extraSeconds: number
}

export function elapsedSeconds(startedAtMs: number, nowMs: number): number {
    const elapsedMs = Math.max(0, nowMs - startedAtMs)

    return Math.floor(elapsedMs / 1000)
}

export function stopwatchPhase(elapsed: number, minSeconds: number, maxSeconds: number): StopwatchPhase {
    if (elapsed >= maxSeconds) {
        return 'passou_do_maximo'
    }
    if (elapsed >= minSeconds) {
        return 'na_faixa'
    }

    return 'antes_do_minimo'
}

// Série de tempo (prancha, isometria): o toque em Iniciar abre um preparo
// curto, para dar tempo de largar o celular e se posicionar, e só então a
// contagem regressiva da meta começa. O início guardado é o do toque, então o
// preparo também sobrevive a fechar e reabrir o app.
export const SET_PREP_SECONDS = 5

export type TimedSetStage = 'preparando' | 'contando' | 'terminado'

export type TimedSetClock = {
    stage: TimedSetStage
    prepRemainingSeconds: number
    elapsedSeconds: number
    remainingSeconds: number
}

export function timedSetClock(tappedAtMs: number, nowMs: number, targetSeconds: number): TimedSetClock {
    const countStartMs = tappedAtMs + SET_PREP_SECONDS * 1000
    const targetMs = targetSeconds * 1000
    const prepRemainingSeconds = Math.max(0, Math.ceil((countStartMs - nowMs) / 1000))
    const elapsedMs = Math.max(0, nowMs - countStartMs)
    const remainingSeconds = Math.max(0, Math.ceil((targetMs - elapsedMs) / 1000))
    const isPreparing = prepRemainingSeconds > 0
    const isFinished = !isPreparing && elapsedMs >= targetMs
    const stage: TimedSetStage = isPreparing ? 'preparando' : isFinished ? 'terminado' : 'contando'
    const clock = { stage, prepRemainingSeconds, elapsedSeconds: Math.floor(elapsedMs / 1000), remainingSeconds }

    return clock
}

export function restTotalSeconds(timer: RestTimer): number {
    return timer.maxSeconds + timer.extraSeconds
}

export function restRemainingSeconds(timer: RestTimer, nowMs: number): number {
    const elapsedMs = Math.max(0, nowMs - timer.startedAtMs)
    const remainingMs = restTotalSeconds(timer) * 1000 - elapsedMs

    return Math.max(0, Math.ceil(remainingMs / 1000))
}

export function restPhase(timer: RestTimer, nowMs: number): RestPhase {
    if (restRemainingSeconds(timer, nowMs) === 0) {
        return 'terminado'
    }
    if (nowMs - timer.startedAtMs >= timer.minSeconds * 1000) {
        return 'na_faixa'
    }

    return 'aguardando_minimo'
}

// O descanso vem depois de a série terminar por inteiro (a última queda, se
// houver drop set), e só quando ainda há série pela frente.
export function shouldStartRest(
    minSeconds: number | null,
    maxSeconds: number | null,
    hasNextUnresolvedSet: boolean,
): boolean {
    return minSeconds !== null && maxSeconds !== null && hasNextUnresolvedSet
}

export function startRestTimer(
    sessionDate: string,
    minSeconds: number,
    maxSeconds: number,
    nowMs: number,
): RestTimer {
    return { sessionDate, startedAtMs: nowMs, minSeconds, maxSeconds, extraSeconds: 0 }
}

export function extendRestTimer(timer: RestTimer, seconds: number): RestTimer {
    return { ...timer, extraSeconds: timer.extraSeconds + seconds }
}

export function formatClock(totalSeconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds))
    const minutes = Math.floor(safeSeconds / 60)
    const seconds = String(safeSeconds % 60).padStart(2, '0')

    return `${minutes}:${seconds}`
}

const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE

// Relógio do treino inteiro: m:ss como os outros cronômetros até completar uma
// hora, e h:mm:ss a partir dela, para a hora nunca virar "75:00".
export function formatElapsedClock(totalSeconds: number): string {
    const finiteSeconds = Number.isFinite(totalSeconds) ? totalSeconds : 0
    const safeSeconds = Math.max(0, Math.floor(finiteSeconds))
    if (safeSeconds < SECONDS_PER_HOUR) {
        const shortClock = formatClock(safeSeconds)
        return shortClock
    }
    const hours = Math.floor(safeSeconds / SECONDS_PER_HOUR)
    const minutes = String(Math.floor((safeSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)).padStart(2, '0')
    const seconds = String(safeSeconds % SECONDS_PER_MINUTE).padStart(2, '0')
    const longClock = `${hours}:${minutes}:${seconds}`

    return longClock
}

// Segundos entre dois instantes ISO; um horário ilegível conta como zero, em
// vez de mostrar NaN no relógio.
export function elapsedSecondsBetween(startIso: string, endMs: number): number {
    const startMs = new Date(startIso).getTime()
    const elapsed = Number.isFinite(startMs) ? elapsedSeconds(startMs, endMs) : 0

    return elapsed
}

export function parseJsonObject(raw: string | null): Record<string, unknown> | null {
    if (raw === null) {
        return null
    }
    try {
        const parsed: unknown = JSON.parse(raw)
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>
        }
    } catch {
        // valor corrompido no armazenamento vale como ausente
    }

    return null
}

export function isFreshTimestamp(value: unknown, nowMs: number): value is number {
    return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value <= nowMs + 1000 &&
        nowMs - value <= MAX_RECORD_AGE_MS
    )
}

export function isNonNegativeNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function parseStopwatchRecord(raw: string | null, nowMs: number): StopwatchRecord | null {
    const data = parseJsonObject(raw)
    if (
        !data ||
        typeof data.sessionDate !== 'string' ||
        typeof data.setKey !== 'string' ||
        !isFreshTimestamp(data.startedAtMs, nowMs)
    ) {
        return null
    }

    return { sessionDate: data.sessionDate, setKey: data.setKey, startedAtMs: data.startedAtMs }
}

export function parseRestTimer(raw: string | null, nowMs: number): RestTimer | null {
    const data = parseJsonObject(raw)
    if (
        !data ||
        typeof data.sessionDate !== 'string' ||
        !isFreshTimestamp(data.startedAtMs, nowMs) ||
        !isNonNegativeNumber(data.minSeconds) ||
        !isNonNegativeNumber(data.maxSeconds) ||
        !isNonNegativeNumber(data.extraSeconds)
    ) {
        return null
    }

    return {
        sessionDate: data.sessionDate,
        startedAtMs: data.startedAtMs,
        minSeconds: data.minSeconds,
        maxSeconds: data.maxSeconds,
        extraSeconds: data.extraSeconds,
    }
}
