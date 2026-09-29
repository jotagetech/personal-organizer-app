import { Play, Timer } from 'lucide-react'

import { unlockAudio } from '@/features/workout/timerDevice'
import { useNow } from '@/features/workout/timerHooks'
import { elapsedSecondsBetween, formatElapsedClock } from '@/features/workout/workoutTimers'

const ACTION_ICON_SIZE = 22
const CLOCK_ICON_SIZE = 18

type SessionClockProps = {
    startedAt: string | null
    finishedAt: string | null
    onStart: () => void
}

// Topo do treino: antes de começar, o botão que marca o início; depois, o
// tempo decorrido desde ele. O valor sai sempre do timestamp de início, então
// continua certo depois de sair da aba, bloquear a tela ou reabrir o app. Sem
// wake lock aqui: manter a tela acesa o treino inteiro gastaria bateria à toa.
export function SessionClock({ startedAt, finishedAt, onStart }: SessionClockProps) {
    if (!startedAt) {
        return <SessionStartButton onStart={onStart} />
    }
    if (finishedAt) {
        return <FinishedSessionClock startedAt={startedAt} finishedAt={finishedAt} />
    }

    return <RunningSessionClock startedAt={startedAt} />
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

function RunningSessionClock({ startedAt }: { startedAt: string }) {
    const nowMs = useNow(true)
    const elapsedClock = formatElapsedClock(elapsedSecondsBetween(startedAt, nowMs))

    return (
        <div className="session-clock" role="timer" aria-label="Tempo de treino">
            <Timer className="session-clock__icon" size={CLOCK_ICON_SIZE} aria-hidden="true" />
            <span className="session-clock__label">Tempo de treino</span>
            <span className="session-clock__time" aria-live="off">
                {elapsedClock}
            </span>
        </div>
    )
}

function FinishedSessionClock({ startedAt, finishedAt }: { startedAt: string; finishedAt: string }) {
    const totalClock = formatElapsedClock(elapsedSecondsBetween(startedAt, new Date(finishedAt).getTime()))

    return (
        <div className="session-clock session-clock--finished" aria-label="Tempo total do treino">
            <Timer className="session-clock__icon" size={CLOCK_ICON_SIZE} aria-hidden="true" />
            <span className="session-clock__label">Tempo total</span>
            <span className="session-clock__time">{totalClock}</span>
        </div>
    )
}
