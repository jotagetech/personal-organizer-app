import { Play, Square, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { playBeep, unlockAudio } from '@/features/workout/timerDevice'
import { useNow, useWakeLock } from '@/features/workout/timerHooks'
import { loadStopwatch, saveStopwatch } from '@/features/workout/timerStorage'
import {
    formatClock,
    SET_PREP_SECONDS,
    stopwatchPhase,
    timedSetClock,
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

function phaseMessage(phase: StopwatchPhase, targetMin: number): string {
    const messages: Record<StopwatchPhase, string> = {
        antes_do_minimo: `Segure até o mínimo de ${targetMin} s`,
        na_faixa: `Mínimo de ${targetMin} s batido! Siga até zerar ou pare`,
        passou_do_maximo: 'Meta atingida',
    }
    const message = messages[phase]

    return message
}

// Cronômetro da série de tempo: depois de Iniciar, um preparo de alguns
// segundos e então a contagem regressiva a partir da meta máxima. Avisa ao
// passar do mínimo, termina sozinho no zero e devolve os segundos feitos para
// o campo de tempo; Parar antes do zero devolve o que foi feito até ali.
export function SetStopwatch({ sessionDate, setKey, targetMin, targetMax, targetText, onStop }: SetStopwatchProps) {
    const [tappedAtMs, setTappedAtMs] = useState<number | null>(
        () => loadStopwatch(sessionDate, setKey)?.startedAtMs ?? null,
    )
    const isRunning = tappedAtMs !== null
    const nowMs = useNow(isRunning)
    useWakeLock(isRunning)

    const clock = tappedAtMs === null ? null : timedSetClock(tappedAtMs, nowMs, targetMax)
    const stage = clock?.stage ?? null
    const prepRemainingSeconds = clock?.prepRemainingSeconds ?? 0
    const phase = stopwatchPhase(clock?.elapsedSeconds ?? 0, targetMin, targetMax)
    // Ao reabrir um cronômetro já avançado, o que ficou para trás não toca de
    // novo: o bipe marca só a passagem vista com a tela aberta.
    const lastPhaseRef = useRef<StopwatchPhase>(phase)
    const lastPrepSecondRef = useRef<number>(prepRemainingSeconds)

    useEffect(() => {
        if (stage !== 'preparando' || prepRemainingSeconds === lastPrepSecondRef.current) {
            return
        }
        lastPrepSecondRef.current = prepRemainingSeconds
        playBeep('contagem')
    }, [stage, prepRemainingSeconds])

    useEffect(() => {
        if (stage === null || stage === 'preparando' || lastPrepSecondRef.current === 0) {
            return
        }
        lastPrepSecondRef.current = 0
        playBeep('trabalho')
    }, [stage])

    useEffect(() => {
        if (stage !== 'contando' || phase === lastPhaseRef.current) {
            return
        }
        lastPhaseRef.current = phase
        playBeep('faixa')
    }, [stage, phase])

    useEffect(() => {
        if (stage !== 'terminado') {
            return
        }
        playBeep('limite')
        finish(targetMax)
    }, [stage])

    function finish(seconds: number) {
        saveStopwatch(null)
        setTappedAtMs(null)
        onStop(seconds)
    }

    function handleStart() {
        unlockAudio()
        const tappedAt = Date.now()
        lastPhaseRef.current = stopwatchPhase(0, targetMin, targetMax)
        lastPrepSecondRef.current = SET_PREP_SECONDS
        playBeep('contagem')
        saveStopwatch({ sessionDate, setKey, startedAtMs: tappedAt })
        setTappedAtMs(tappedAt)
    }

    function handleCancelPrep() {
        saveStopwatch(null)
        setTappedAtMs(null)
    }

    if (!clock) {
        return (
            <button type="button" className="primary-button stopwatch__start" onClick={handleStart}>
                <Play size={ACTION_ICON_SIZE} aria-hidden="true" />
                Iniciar
            </button>
        )
    }

    if (clock.stage === 'preparando') {
        return (
            <div className="stopwatch stopwatch--preparando" role="timer" aria-label="Preparo da série">
                <span className="stopwatch__message">Prepare-se</span>
                <span className="stopwatch__clock" aria-live="assertive">
                    {clock.prepRemainingSeconds}
                </span>
                <span className="stopwatch__target">meta {targetText}</span>
                <button type="button" className="secondary-button stopwatch__stop" onClick={handleCancelPrep}>
                    <X size={ACTION_ICON_SIZE} aria-hidden="true" />
                    Cancelar
                </button>
            </div>
        )
    }

    return (
        <div className={`stopwatch stopwatch--${phase}`} role="timer" aria-label="Cronômetro da série">
            <span className="stopwatch__clock">{formatClock(clock.remainingSeconds)}</span>
            <span className="stopwatch__target">meta {targetText}</span>
            <span className="stopwatch__message" aria-live="polite">
                {phaseMessage(phase, targetMin)}
            </span>
            <button
                type="button"
                className="secondary-button stopwatch__stop"
                onClick={() => finish(clock.elapsedSeconds)}
            >
                <Square size={ACTION_ICON_SIZE} aria-hidden="true" />
                Parar
            </button>
        </div>
    )
}
