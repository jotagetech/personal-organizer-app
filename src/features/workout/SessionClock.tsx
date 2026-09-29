import { Pause, Play, Timer, X } from 'lucide-react'

import { activeSecondsBetween, isPaused, type SessionPauseState } from '@/features/workout/sessionPause'
import { unlockAudio } from '@/features/workout/timerDevice'
import { useNow } from '@/features/workout/timerHooks'
import { formatElapsedClock } from '@/features/workout/workoutTimers'

const ACTION_ICON_SIZE = 22
const CLOCK_ICON_SIZE = 18
const CLOCK_BUTTON_ICON_SIZE = 18

type SessionClockProps = {
    startedAt: string | null
    finishedAt: string | null
    pauseState: SessionPauseState
    canCancelStart: boolean
    onStart: () => void
    onPause: () => void
    onResume: () => void
    onCancelStart: () => void
}

// Topo do treino: antes de começar, o botão que marca o início; depois, o
// tempo decorrido desde ele, sem as pausas. O valor sai sempre dos horários
// de início e de pausa, então continua certo (e parado, se pausado) depois
// de sair da aba, bloquear a tela ou reabrir o app. Sem wake lock aqui:
// manter a tela acesa o treino inteiro gastaria bateria à toa.
export function SessionClock({
    startedAt,
    finishedAt,
    pauseState,
    canCancelStart,
    onStart,
    onPause,
    onResume,
    onCancelStart,
}: SessionClockProps) {
    if (!startedAt) {
        return <SessionStartButton onStart={onStart} />
    }
    if (finishedAt) {
        return <FinishedSessionClock startedAt={startedAt} finishedAt={finishedAt} pauseState={pauseState} />
    }

    return (
        <>
            <RunningSessionClock startedAt={startedAt} pauseState={pauseState} onPause={onPause} onResume={onResume} />
            {canCancelStart && (
                <button type="button" className="secondary-button session-clock__cancel" onClick={onCancelStart}>
                    <X size={CLOCK_BUTTON_ICON_SIZE} aria-hidden="true" />
                    Cancelar início
                </button>
            )}
        </>
    )
}

function SessionStartButton({ onStart }: { onStart: () => void }) {
    // O toque também libera o áudio no iOS, para os bipes dos timers de
    // descanso e de série tocarem depois sem outro gesto.
    function handleStart() {
        unlockAudio()
        onStart()
    }

    return (
        <button type="button" className="primary-button session-clock__start" onClick={handleStart}>
            <Play size={ACTION_ICON_SIZE} aria-hidden="true" />
            Iniciar treino
        </button>
    )
}

type RunningSessionClockProps = {
    startedAt: string
    pauseState: SessionPauseState
    onPause: () => void
    onResume: () => void
}

// Pausado, o relógio continua batendo, mas o tempo efetivo não cresce mais
// depois do início da pausa, então o valor mostrado fica congelado.
function RunningSessionClock({ startedAt, pauseState, onPause, onResume }: RunningSessionClockProps) {
    const nowMs = useNow(true)
    const isSessionPaused = isPaused(pauseState)
    const elapsedClock = formatElapsedClock(activeSecondsBetween(startedAt, nowMs, pauseState))
    const clockClassName = isSessionPaused ? 'session-clock session-clock--paused' : 'session-clock'

    return (
        <div className={clockClassName} role="timer" aria-label="Tempo de treino">
            <Timer className="session-clock__icon" size={CLOCK_ICON_SIZE} aria-hidden="true" />
            <span className="session-clock__label">{isSessionPaused ? 'Pausado' : 'Tempo de treino'}</span>
            <span className="session-clock__time" aria-live="off">
                {elapsedClock}
            </span>
            {isSessionPaused ? (
                <button type="button" className="session-clock__button" onClick={onResume}>
                    <Play size={CLOCK_BUTTON_ICON_SIZE} aria-hidden="true" />
                    Retomar
                </button>
            ) : (
                <button type="button" className="session-clock__button" onClick={onPause}>
                    <Pause size={CLOCK_BUTTON_ICON_SIZE} aria-hidden="true" />
                    Pausar
                </button>
            )}
        </div>
    )
}

type FinishedSessionClockProps = {
    startedAt: string
    finishedAt: string
    pauseState: SessionPauseState
}

function FinishedSessionClock({ startedAt, finishedAt, pauseState }: FinishedSessionClockProps) {
    const totalSeconds = activeSecondsBetween(startedAt, new Date(finishedAt).getTime(), pauseState)
    const totalClock = formatElapsedClock(totalSeconds)

    return (
        <div className="session-clock session-clock--finished" aria-label="Tempo total do treino">
            <Timer className="session-clock__icon" size={CLOCK_ICON_SIZE} aria-hidden="true" />
            <span className="session-clock__label">Tempo total</span>
            <span className="session-clock__time">{totalClock}</span>
        </div>
    )
}
