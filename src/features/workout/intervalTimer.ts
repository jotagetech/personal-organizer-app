// Lógica pura do timer guiado do cardio intervalado. Como nos outros
// cronômetros, nada soma ticks: o estado guarda quando a fase atual começou e
// qualquer leitura recalcula a partir de Date.now(). Assim, depois de o iPhone
// suspender a aba ou de o app ser reaberto, as fases que terminaram nesse
// meio tempo são aplicadas de uma vez, cada uma no instante exato em que
// terminaria.

import { isFreshTimestamp, isNonNegativeNumber, parseJsonObject } from '@/features/workout/workoutTimers'

export type IntervalTimerConfig = {
    rounds: number
    workMinSeconds: number
    workMaxSeconds: number
    recoveryMinSeconds: number
    recoveryMaxSeconds: number
}

export type IntervalPhase = 'trabalho' | 'recuperacao' | 'concluido'

export type IntervalRoundStatus = 'feita' | 'pulada'

export type IntervalRoundResult = {
    status: IntervalRoundStatus
    workSeconds: number | null
    endedAtMs: number
}

// `roundIndex` é a rodada em trabalho ou, na recuperação, a que acabou de
// terminar. `results` tem uma entrada por rodada já resolvida, em ordem.
export type IntervalTimerState = {
    sessionDate: string
    exerciseKey: string
    config: IntervalTimerConfig
    phase: IntervalPhase
    roundIndex: number
    phaseStartedAtMs: number
    pausedAtMs: number | null
    results: IntervalRoundResult[]
}

// Com faixa de trabalho, a contagem vai primeiro até o mínimo e depois até o
// máximo, quando a fase termina sozinha.
export type WorkStage = 'antes_do_minimo' | 'na_faixa'

export type IntervalTimerView = {
    phase: IntervalPhase
    roundNumber: number
    totalRounds: number
    remainingSeconds: number
    elapsedSeconds: number
    workStage: WorkStage
    hasWorkRange: boolean
    isPaused: boolean
    doneRounds: number
    skippedRounds: number
}

export type IntervalBeep = 'trabalho' | 'recuperacao' | 'faixa' | 'limite' | 'contagem'

const COUNTDOWN_TICK_SECONDS = 3

export function intervalConfigFrom(prescription: {
    rodadas: number
    trabalho_segundos_min: number
    trabalho_segundos_max: number
    recuperacao_segundos_min: number
    recuperacao_segundos_max: number
}): IntervalTimerConfig {
    return {
        rounds: prescription.rodadas,
        workMinSeconds: prescription.trabalho_segundos_min,
        workMaxSeconds: prescription.trabalho_segundos_max,
        recoveryMinSeconds: prescription.recuperacao_segundos_min,
        recoveryMaxSeconds: prescription.recuperacao_segundos_max,
    }
}

export function startIntervalTimer(
    sessionDate: string,
    exerciseKey: string,
    config: IntervalTimerConfig,
    nowMs: number,
): IntervalTimerState {
    return {
        sessionDate,
        exerciseKey,
        config,
        phase: 'trabalho',
        roundIndex: 0,
        phaseStartedAtMs: nowMs,
        pausedAtMs: null,
        results: [],
    }
}

// Pausado, o relógio fica parado no instante da pausa.
function clockMs(state: IntervalTimerState, nowMs: number): number {
    return state.pausedAtMs ?? nowMs
}

function phaseElapsedMs(state: IntervalTimerState, nowMs: number): number {
    return Math.max(0, clockMs(state, nowMs) - state.phaseStartedAtMs)
}

function startWork(state: IntervalTimerState, roundIndex: number, atMs: number): IntervalTimerState {
    return { ...state, phase: 'trabalho', roundIndex, phaseStartedAtMs: atMs }
}

// Depois da última rodada não há recuperação: o bloco termina ali.
function afterRound(state: IntervalTimerState, result: IntervalRoundResult, atMs: number): IntervalTimerState {
    const results = [...state.results, result]
    if (results.length >= state.config.rounds) {
        return { ...state, phase: 'concluido', results, phaseStartedAtMs: atMs }
    }
    if (state.config.recoveryMaxSeconds > 0) {
        return { ...state, phase: 'recuperacao', results, phaseStartedAtMs: atMs }
    }

    return startWork({ ...state, results }, state.roundIndex + 1, atMs)
}

// Aplica as trocas de fase automáticas vencidas até `nowMs`. Devolve o mesmo
// objeto quando nada mudou, para quem chama saber se precisa gravar.
export function syncIntervalTimer(state: IntervalTimerState, nowMs: number): IntervalTimerState {
    let current = state
    const maxTransitions = state.config.rounds * 2 + 1

    for (let transition = 0; transition < maxTransitions; transition += 1) {
        if (current.phase === 'concluido' || current.pausedAtMs !== null) {
            break
        }
        const phaseSeconds =
            current.phase === 'trabalho' ? current.config.workMaxSeconds : current.config.recoveryMaxSeconds
        const phaseEndMs = current.phaseStartedAtMs + phaseSeconds * 1000
        if (nowMs < phaseEndMs) {
            break
        }
        current =
            current.phase === 'trabalho'
                ? afterRound(
                      current,
                      { status: 'feita', workSeconds: current.config.workMaxSeconds, endedAtMs: phaseEndMs },
                      phaseEndMs,
                  )
                : startWork(current, current.roundIndex + 1, phaseEndMs)
    }

    return current
}

// Toques do usuário valem mesmo com o timer pausado: a rodada termina no
// instante da pausa, e a fase seguinte começa agora, já rodando.

// Trabalho encerrado à mão conta o que foi feito, limitado ao máximo da faixa.
export function endWorkPhase(state: IntervalTimerState, nowMs: number): IntervalTimerState {
    const synced = syncIntervalTimer(state, nowMs)
    if (synced.phase !== 'trabalho') {
        return synced
    }
    const workSeconds = Math.min(synced.config.workMaxSeconds, Math.floor(phaseElapsedMs(synced, nowMs) / 1000))
    const result: IntervalRoundResult = { status: 'feita', workSeconds, endedAtMs: clockMs(synced, nowMs) }

    return afterRound({ ...synced, pausedAtMs: null }, result, nowMs)
}

export function skipRound(state: IntervalTimerState, nowMs: number): IntervalTimerState {
    const synced = syncIntervalTimer(state, nowMs)
    if (synced.phase !== 'trabalho') {
        return synced
    }
    const result: IntervalRoundResult = { status: 'pulada', workSeconds: null, endedAtMs: clockMs(synced, nowMs) }

    return afterRound({ ...synced, pausedAtMs: null }, result, nowMs)
}

export function startNextRoundNow(state: IntervalTimerState, nowMs: number): IntervalTimerState {
    const synced = syncIntervalTimer(state, nowMs)
    if (synced.phase !== 'recuperacao') {
        return synced
    }

    return startWork({ ...synced, pausedAtMs: null }, synced.roundIndex + 1, nowMs)
}

export function pauseIntervalTimer(state: IntervalTimerState, nowMs: number): IntervalTimerState {
    const synced = syncIntervalTimer(state, nowMs)
    if (synced.phase === 'concluido' || synced.pausedAtMs !== null) {
        return synced
    }

    return { ...synced, pausedAtMs: nowMs }
}

// Retomar empurra o início da fase pelo tempo parado, então o que faltava
// continua faltando.
export function resumeIntervalTimer(state: IntervalTimerState, nowMs: number): IntervalTimerState {
    if (state.pausedAtMs === null) {
        return state
    }
    const pausedMs = Math.max(0, nowMs - state.pausedAtMs)

    return { ...state, pausedAtMs: null, phaseStartedAtMs: state.phaseStartedAtMs + pausedMs }
}

// Encerrar antes: a rodada em trabalho conta como feita se durou ao menos um
// segundo, e as que não começaram ficam puladas.
export function finishIntervalTimer(state: IntervalTimerState, nowMs: number): IntervalTimerState {
    const synced = syncIntervalTimer(state, nowMs)
    if (synced.phase === 'concluido') {
        return synced
    }
    const atMs = clockMs(synced, nowMs)
    const results = [...synced.results]
    if (synced.phase === 'trabalho') {
        const workSeconds = Math.min(synced.config.workMaxSeconds, Math.floor(phaseElapsedMs(synced, nowMs) / 1000))
        results.push(
            workSeconds >= 1
                ? { status: 'feita', workSeconds, endedAtMs: atMs }
                : { status: 'pulada', workSeconds: null, endedAtMs: atMs },
        )
    }
    while (results.length < synced.config.rounds) {
        results.push({ status: 'pulada', workSeconds: null, endedAtMs: atMs })
    }

    return { ...synced, phase: 'concluido', results, pausedAtMs: null, phaseStartedAtMs: atMs }
}

function remainingSecondsUntil(targetSeconds: number, elapsedMs: number): number {
    return Math.max(0, Math.ceil((targetSeconds * 1000 - elapsedMs) / 1000))
}

// Na recuperação, `roundNumber` já é a próxima rodada, que é o que importa
// para quem está esperando.
export function intervalTimerView(state: IntervalTimerState, nowMs: number): IntervalTimerView {
    const { config } = state
    const elapsedMs = phaseElapsedMs(state, nowMs)
    const hasWorkRange = config.workMinSeconds < config.workMaxSeconds
    const workStage: WorkStage = elapsedMs >= config.workMinSeconds * 1000 ? 'na_faixa' : 'antes_do_minimo'
    const doneRounds = state.results.filter((result) => result.status === 'feita').length
    const skippedRounds = state.results.length - doneRounds

    let remainingSeconds = 0
    if (state.phase === 'trabalho') {
        const target = hasWorkRange && workStage === 'antes_do_minimo' ? config.workMinSeconds : config.workMaxSeconds
        remainingSeconds = remainingSecondsUntil(target, elapsedMs)
    } else if (state.phase === 'recuperacao') {
        remainingSeconds = remainingSecondsUntil(config.recoveryMaxSeconds, elapsedMs)
    }

    return {
        phase: state.phase,
        roundNumber: Math.min(config.rounds, state.phase === 'recuperacao' ? state.roundIndex + 2 : state.roundIndex + 1),
        totalRounds: config.rounds,
        remainingSeconds,
        elapsedSeconds: Math.floor(elapsedMs / 1000),
        workStage,
        hasWorkRange,
        isPaused: state.pausedAtMs !== null,
        doneRounds,
        skippedRounds,
    }
}

// Bipe para a mudança entre duas leituras vistas com a tela aberta: começo do
// trabalho, começo da recuperação, fim do bloco, mínimo da faixa de trabalho
// atingido e os três últimos segundos da recuperação.
export function intervalBeepBetween(previous: IntervalTimerView, next: IntervalTimerView): IntervalBeep | null {
    if (next.isPaused) {
        return null
    }
    const changedRound = previous.roundNumber !== next.roundNumber
    if (previous.phase !== next.phase || changedRound) {
        if (next.phase === 'trabalho') {
            return 'trabalho'
        }
        if (next.phase === 'recuperacao') {
            return 'recuperacao'
        }
        return 'limite'
    }
    if (
        next.phase === 'trabalho' &&
        next.hasWorkRange &&
        previous.workStage === 'antes_do_minimo' &&
        next.workStage === 'na_faixa'
    ) {
        return 'faixa'
    }
    if (
        next.phase === 'recuperacao' &&
        next.remainingSeconds !== previous.remainingSeconds &&
        next.remainingSeconds > 0 &&
        next.remainingSeconds <= COUNTDOWN_TICK_SECONDS
    ) {
        return 'contagem'
    }

    return null
}

function isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function parseConfig(value: unknown): IntervalTimerConfig | null {
    if (typeof value !== 'object' || value === null) {
        return null
    }
    const data = value as Record<string, unknown>
    if (
        !isPositiveInteger(data.rounds) ||
        !isNonNegativeNumber(data.workMinSeconds) ||
        !isNonNegativeNumber(data.workMaxSeconds) ||
        !isNonNegativeNumber(data.recoveryMinSeconds) ||
        !isNonNegativeNumber(data.recoveryMaxSeconds)
    ) {
        return null
    }

    return {
        rounds: data.rounds,
        workMinSeconds: data.workMinSeconds,
        workMaxSeconds: data.workMaxSeconds,
        recoveryMinSeconds: data.recoveryMinSeconds,
        recoveryMaxSeconds: data.recoveryMaxSeconds,
    }
}

function parseRoundResult(value: unknown): IntervalRoundResult | null {
    if (typeof value !== 'object' || value === null) {
        return null
    }
    const data = value as Record<string, unknown>
    const isValidStatus = data.status === 'feita' || data.status === 'pulada'
    const isValidSeconds = data.workSeconds === null || isNonNegativeNumber(data.workSeconds)
    if (!isValidStatus || !isValidSeconds || !isNonNegativeNumber(data.endedAtMs)) {
        return null
    }

    return {
        status: data.status as IntervalRoundStatus,
        workSeconds: data.workSeconds as number | null,
        endedAtMs: data.endedAtMs,
    }
}

const INTERVAL_PHASES: readonly IntervalPhase[] = ['trabalho', 'recuperacao', 'concluido']

// O que vem do localStorage é dado externo: qualquer campo fora do formato
// descarta o timer em vez de montar um estado impossível.
export function parseIntervalTimer(raw: string | null, nowMs: number): IntervalTimerState | null {
    const data = parseJsonObject(raw)
    if (!data || typeof data.sessionDate !== 'string' || typeof data.exerciseKey !== 'string') {
        return null
    }
    const config = parseConfig(data.config)
    const phase = INTERVAL_PHASES.find((candidate) => candidate === data.phase)
    const pausedAtMs = data.pausedAtMs === null ? null : data.pausedAtMs
    const lastActivityMs = pausedAtMs ?? data.phaseStartedAtMs
    if (
        !config ||
        !phase ||
        !Number.isInteger(data.roundIndex) ||
        (data.roundIndex as number) < 0 ||
        (data.roundIndex as number) >= config.rounds ||
        !isNonNegativeNumber(data.phaseStartedAtMs) ||
        (pausedAtMs !== null && !isNonNegativeNumber(pausedAtMs)) ||
        !isFreshTimestamp(lastActivityMs, nowMs) ||
        !Array.isArray(data.results)
    ) {
        return null
    }
    const results = data.results.map(parseRoundResult)
    if (results.some((result) => result === null) || results.length > config.rounds) {
        return null
    }

    return {
        sessionDate: data.sessionDate,
        exerciseKey: data.exerciseKey,
        config,
        phase,
        roundIndex: data.roundIndex as number,
        phaseStartedAtMs: data.phaseStartedAtMs,
        pausedAtMs: pausedAtMs as number | null,
        results: results as IntervalRoundResult[],
    }
}
