import { Play, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { playBeep, unlockAudio } from '@/features/workout/timerDevice'
import { useNow, useWakeLock } from '@/features/workout/timerHooks'
import { loadStopwatch, saveStopwatch } from '@/features/workout/timerStorage'
import {
    elapsedSeconds,
    formatClock,
    stopwatchPhase,
    type StopwatchPhase,
} from '@/features/workout/workoutTimers'

const ACTION_ICON_SIZE = 22

type SetStopwatchProps = {
    sessionDate: string
    setKey: string
    targetMin: number
    targetMax: number
    targetText: string
    onStop: (seconds: number) => void
}

const PHASE_MESSAGE: Record<StopwatchPhase, string> = {
    antes_do_minimo: 'Segure até o mínimo',
    na_faixa: 'Na faixa da meta',
    passou_do_maximo: 'Meta máxima atingida, pode parar',
}

// Cronômetro da série de tempo: conta para cima, avisa ao chegar no mínimo e
// no máximo da meta e, ao parar, devolve os segundos para o campo de tempo.
export function SetStopwatch({ sessionDate, setKey, targetMin, targetMax, targetText, onStop }: SetStopwatchProps) {
    const [startedAtMs, setStartedAtMs] = useState<number | null>(
        () => loadStopwatch(sessionDate, setKey)?.startedAtMs ?? null,
    )
    const isRunning = startedAtMs !== null
    const nowMs = useNow(isRunning)
    useWakeLock(isRunning)

    const elapsed = startedAtMs === null ? 0 : elapsedSeconds(startedAtMs, nowMs)
    const phase = stopwatchPhase(elapsed, targetMin, targetMax)
    // Ao retomar um cronômetro já avançado, as fases que ficaram para trás não
    // tocam de novo: o bipe marca só a passagem vista com a tela aberta.
    const lastPhaseRef = useRef<StopwatchPhase>(phase)

    useEffect(() => {
        if (!isRunning || phase === lastPhaseRef.current) {
            return
        }
        lastPhaseRef.current = phase
        playBeep(phase === 'passou_do_maximo' ? 'limite' : 'faixa')
    }, [isRunning, phase])

    function handleStart() {
        unlockAudio()
        const startedAt = Date.now()
        lastPhaseRef.current = stopwatchPhase(0, targetMin, targetMax)
        saveStopwatch({ sessionDate, setKey, startedAtMs: startedAt })
        setStartedAtMs(startedAt)
    }

    function handleStop() {
        const finalSeconds = startedAtMs === null ? 0 : elapsedSeconds(startedAtMs, Date.now())
        saveStopwatch(null)
        setStartedAtMs(null)
        onStop(finalSeconds)
    }

    if (!isRunning) {
        return (
            <button type="button" className="primary-button stopwatch__start" onClick={handleStart}>
                <Play size={ACTION_ICON_SIZE} aria-hidden="true" />
                Iniciar
            </button>
        )
    }

    return (
        <div className={`stopwatch stopwatch--${phase}`} role="timer" aria-label="Cronômetro da série">
            <span className="stopwatch__clock">{formatClock(elapsed)}</span>
            <span className="stopwatch__target">meta {targetText}</span>
            <span className="stopwatch__message" aria-live="polite">
                {PHASE_MESSAGE[phase]}
            </span>
            <button type="button" className="secondary-button stopwatch__stop" onClick={handleStop}>
                <Square size={ACTION_ICON_SIZE} aria-hidden="true" />
                Parar
            </button>
        </div>
    )
}
