// Início dos cronômetros em localStorage: o timestamp sobrevive a fechar e
// reabrir o app, e o tempo decorrido é recalculado a partir dele.

import { parseIntervalTimer, type IntervalTimerState } from '@/features/workout/intervalTimer'
import {
    parseRestTimer,
    parseStopwatchRecord,
    type RestTimer,
    type StopwatchRecord,
} from '@/features/workout/workoutTimers'

const STOPWATCH_KEY = 'workout-timer:serie'
const REST_KEY = 'workout-timer:descanso'
const INTERVAL_KEY = 'workout-timer:intervalado'

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
