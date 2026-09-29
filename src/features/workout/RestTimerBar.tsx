import { Plus, SkipForward } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { playBeep } from '@/features/workout/timerDevice'
import { useNow, useWakeLock } from '@/features/workout/timerHooks'
import {
    REST_EXTENSION_SECONDS,
    formatClock,
    restPhase,
    restRemainingSeconds,
    type RestPhase,
    type RestTimer,
} from '@/features/workout/workoutTimers'

const ACTION_ICON_SIZE = 18

type RestTimerBarProps = {
    timer: RestTimer
    onExtend: () => void
    onDismiss: () => void
}

const PHASE_LABEL: Record<RestPhase, string> = {
    aguardando_minimo: 'Descanso',
    na_faixa: 'Pode voltar',
    terminado: 'Descanso concluído',
}

// Faixa compacta acima da série: não bloqueia nada, então dá para seguir
// lançando o próximo exercício enquanto a contagem corre.
export function RestTimerBar({ timer, onExtend, onDismiss }: RestTimerBarProps) {
    const nowMs = useNow(true)
    const phase = restPhase(timer, nowMs)
    const remaining = restRemainingSeconds(timer, nowMs)
    useWakeLock(phase !== 'terminado')

    // Um descanso que já estava terminado ao reabrir o app não apita: o bipe
    // marca só a passagem para "terminado" vista com o timer na tela.
    const lastPhaseRef = useRef<RestPhase>(phase)
    useEffect(() => {
        if (phase === lastPhaseRef.current) {
            return
        }
        lastPhaseRef.current = phase
        if (phase === 'terminado') {
            playBeep('limite')
        }
    }, [phase])

    return (
        <div className={`rest-bar rest-bar--${phase}`} role="timer" aria-label="Descanso">
            <div className="rest-bar__info">
                <span className="rest-bar__label">{PHASE_LABEL[phase]}</span>
                <span className="rest-bar__clock" aria-live="off">
                    {formatClock(remaining)}
                </span>
            </div>
            {phase !== 'terminado' && (
                <button type="button" className="rest-bar__button" onClick={onExtend}>
                    <Plus size={ACTION_ICON_SIZE} aria-hidden="true" />
                    {REST_EXTENSION_SECONDS} s
                </button>
            )}
            <button type="button" className="rest-bar__button" onClick={onDismiss}>
                <SkipForward size={ACTION_ICON_SIZE} aria-hidden="true" />
                {phase === 'terminado' ? 'Fechar' : 'Pular'}
            </button>
        </div>
    )
}
