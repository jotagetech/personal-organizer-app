import { Plus, SkipForward } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { playBeep } from '@/features/workout/timerDevice'
import { useNow, useWakeLock } from '@/features/workout/timerHooks'
import {
    REST_EXTENSION_SECONDS,
    formatClock,
    restPhase,
    restRemainingSeconds,
    restTotalSeconds,
    type RestPhase,
    type RestTimer,
} from '@/features/workout/workoutTimers'

const ACTION_ICON_SIZE = 24

type RestPanelProps = {
    timer: RestTimer
    nextStepLabel: string
    onExtend: () => void
    onFinish: () => void
}

const PHASE_LABEL: Record<RestPhase, string> = {
    aguardando_minimo: 'Descanso',
    na_faixa: 'Pode voltar',
    terminado: 'Descanso concluído',
}

// Ocupa o lugar do card da série: enquanto o descanso corre não há como
// confirmar a próxima série sem antes pular ou esperar o fim.
export function RestPanel({ timer, nextStepLabel, onExtend, onFinish }: RestPanelProps) {
    const nowMs = useNow(true)
    const phase = restPhase(timer, nowMs)
    const remaining = restRemainingSeconds(timer, nowMs)
    const totalSeconds = restTotalSeconds(timer)
    const elapsedPercent = totalSeconds > 0 ? Math.min(1, 1 - remaining / totalSeconds) * 100 : 100
    useWakeLock(phase !== 'terminado')

    const onFinishRef = useRef(onFinish)
    onFinishRef.current = onFinish

    // O painel se fecha sozinho ao terminar. Só apita quando a passagem para
    // "terminado" acontece com ele na tela: um descanso que já tinha acabado
    // ao reabrir o app fecha em silêncio.
    const lastPhaseRef = useRef<RestPhase>(phase)
    useEffect(() => {
        const hasJustFinished = phase === 'terminado' && lastPhaseRef.current !== 'terminado'
        lastPhaseRef.current = phase
        if (hasJustFinished) {
            playBeep('limite')
        }
        if (phase === 'terminado') {
            onFinishRef.current()
        }
    }, [phase])

    return (
        <section className={`card rest-panel rest-panel--${phase}`} role="timer" aria-label="Descanso">
            <span className="rest-panel__label">{PHASE_LABEL[phase]}</span>
            <span className="rest-panel__clock" aria-live="off">
                {formatClock(remaining)}
            </span>
            <div className="rest-panel__track" aria-hidden="true">
                <span className="rest-panel__fill" style={{ width: `${elapsedPercent}%` }} />
            </div>
            <p className="rest-panel__next">
                <span className="rest-panel__next-kicker">A seguir</span>
                {nextStepLabel}
            </p>
            <div className="rest-panel__actions">
                <button type="button" className="rest-panel__button" onClick={onExtend}>
                    <Plus size={ACTION_ICON_SIZE} aria-hidden="true" />
                    {REST_EXTENSION_SECONDS} s
                </button>
                <button type="button" className="rest-panel__button rest-panel__button--primary" onClick={onFinish}>
                    <SkipForward size={ACTION_ICON_SIZE} aria-hidden="true" />
                    Pular
                </button>
            </div>
        </section>
    )
}
