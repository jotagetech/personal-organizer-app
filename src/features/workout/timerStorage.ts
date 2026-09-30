// Início dos cronômetros em localStorage: o timestamp sobrevive a fechar e
// reabrir o app, e o tempo decorrido é recalculado a partir dele. O passo do
// assistente em que o treino estava fica aqui também, pelo mesmo motivo.

import { parseIntervalTimer, type IntervalTimerState } from '@/features/workout/intervalTimer'
import {
    forgetWorkoutStep,
    parseSavedWorkoutSteps,
    rememberWorkoutStep,
    type SavedWorkoutStep,
} from '@/features/workout/sessionResume'
import {
    parseRestTimer,
    parseStopwatchRecord,
    type RestTimer,
    type StopwatchRecord,
} from '@/features/workout/workoutTimers'

const STOPWATCH_KEY = 'workout-timer:serie'
const REST_KEY = 'workout-timer:descanso'
const INTERVAL_KEY = 'workout-timer:intervalado'
const RESUME_KEY = 'workout-resume:passo'

function readItem(key: string): string | null {
    try {
        return window.localStorage.getItem(key)
    } catch {
        return null
    }
}

function writeItem(key: string, value: string | null): void {
    try {
        if (value === null) {
            window.localStorage.removeItem(key)
        } else {
            window.localStorage.setItem(key, value)
        }
    } catch {
        // armazenamento indisponível: o timer segue só em memória
    }
}

export function loadStopwatch(sessionDate: string, setKey: string): StopwatchRecord | null {
    const record = parseStopwatchRecord(readItem(STOPWATCH_KEY), Date.now())
    if (!record || record.sessionDate !== sessionDate || record.setKey !== setKey) {
        return null
    }

    return record
}

export function saveStopwatch(record: StopwatchRecord | null): void {
    writeItem(STOPWATCH_KEY, record === null ? null : JSON.stringify(record))
}

export function loadRestTimer(sessionDate: string): RestTimer | null {
    const timer = parseRestTimer(readItem(REST_KEY), Date.now())

    return timer && timer.sessionDate === sessionDate ? timer : null
}

export function saveRestTimer(timer: RestTimer | null): void {
    writeItem(REST_KEY, timer === null ? null : JSON.stringify(timer))
}

// Um intervalado por vez: começar outro substitui o anterior.
export function loadIntervalTimer(sessionDate: string, exerciseKey: string): IntervalTimerState | null {
    const timer = parseIntervalTimer(readItem(INTERVAL_KEY), Date.now())
    if (!timer || timer.sessionDate !== sessionDate || timer.exerciseKey !== exerciseKey) {
        return null
    }

    return timer
}

export function saveIntervalTimer(timer: IntervalTimerState | null): void {
    writeItem(INTERVAL_KEY, timer === null ? null : JSON.stringify(timer))
}

export function clearIntervalTimer(sessionDate: string, exerciseKey: string): void {
    if (loadIntervalTimer(sessionDate, exerciseKey)) {
        saveIntervalTimer(null)
    }
}

// Um registro só para todas as datas, já limitado às mais recentes pela regra
// pura; cada escrita reaproveita o que as outras datas tinham guardado.
export function loadSavedWorkoutStep(sessionDate: string): SavedWorkoutStep | null {
    const savedSteps = parseSavedWorkoutSteps(readItem(RESUME_KEY))
    const savedStep = savedSteps[sessionDate] ?? null

    return savedStep
}

export function saveWorkoutStep(sessionDate: string, savedStep: SavedWorkoutStep): void {
    const savedSteps = rememberWorkoutStep(parseSavedWorkoutSteps(readItem(RESUME_KEY)), sessionDate, savedStep)
    writeItem(RESUME_KEY, JSON.stringify(savedSteps))
}

export function clearWorkoutStep(sessionDate: string): void {
    const savedSteps = parseSavedWorkoutSteps(readItem(RESUME_KEY))
    if (!(sessionDate in savedSteps)) {
        return
    }
    writeItem(RESUME_KEY, JSON.stringify(forgetWorkoutStep(savedSteps, sessionDate)))
}

// Treino do dia excluído: some o passo guardado e qualquer cronômetro da data
// (descanso, série, intervalado). Devolve se havia descanso correndo nela,
// para quem chama cancelar também o push agendado dele.
export function clearWorkoutLocalStateForDate(sessionDate: string): { hadRestTimer: boolean } {
    const nowMs = Date.now()
    const hadRestTimer = loadRestTimer(sessionDate) !== null
    if (hadRestTimer) {
        saveRestTimer(null)
    }
    if (parseStopwatchRecord(readItem(STOPWATCH_KEY), nowMs)?.sessionDate === sessionDate) {
        saveStopwatch(null)
    }
    if (parseIntervalTimer(readItem(INTERVAL_KEY), nowMs)?.sessionDate === sessionDate) {
        saveIntervalTimer(null)
    }
    clearWorkoutStep(sessionDate)

    return { hadRestTimer }
}
