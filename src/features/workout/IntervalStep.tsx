import { Check, ChevronsRight, Pause, Play, SkipForward, Square, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useOutbox } from '@/contexts/OutboxContext'
import { SaveStatusLabel } from '@/features/workout/ExerciseSetRow'
import {
    formatIntervalPrescription,
    formatIntervalSeconds,
    formatIntervalSecondsRange,
    formatRpeRange,
} from '@/features/workout/intervalPresentation'
import {
    buildIntervalRoundValues,
    canConfirmRounds,
    roundsFromRows,
    roundsFromTimer,
    rpeFromRows,
    type EditableRound,
} from '@/features/workout/intervalRounds'
import {
    endWorkPhase,
    finishIntervalTimer,
    intervalBeepBetween,
    intervalConfigFrom,
    intervalTimerView,
    pauseIntervalTimer,
    resumeIntervalTimer,
    skipRound,
    startIntervalTimer,
    startNextRoundNow,
    syncIntervalTimer,
    type IntervalTimerState,
    type IntervalTimerView,
} from '@/features/workout/intervalTimer'
import { isSetResolved } from '@/features/workout/sessionProgress'
import { playBeep, unlockAudio } from '@/features/workout/timerDevice'
import { useNow, useWakeLock } from '@/features/workout/timerHooks'
import { clearIntervalTimer, loadIntervalTimer, saveIntervalTimer } from '@/features/workout/timerStorage'
import {
    setKey,
    type WorkoutSetRow,
    type WorkoutSnapshot,
    type WorkoutSnapshotExercise,
    type WorkoutSnapshotInterval,
} from '@/features/workout/types'
import { formatClock } from '@/features/workout/workoutTimers'
import { buildOverlaySetRow, type UpsertSetOperation } from '@/lib/outbox/outboxQueue'
import { MAX_RPE, MIN_RPE } from '@/lib/workoutPlanSchema'

const ACTION_ICON_SIZE = 22
const SMALL_ICON_SIZE = 16
const CONFIRM_ICON_STROKE = 3
const RPE_OPTIONS = Array.from({ length: MAX_RPE - MIN_RPE + 1 }, (_value, offset) => MIN_RPE + offset)

type IntervalStepMode = 'inicio' | 'timer' | 'revisao'

type IntervalStepProps = {
    sessionDate: string
    planId: string
    snapshot: WorkoutSnapshot
    exercicio: WorkoutSnapshotExercise
    interval: WorkoutSnapshotInterval
    setsByKey: Map<string, WorkoutSetRow>
    confirmLabel: string
    onConfirmed: (rows: WorkoutSetRow[]) => void
    onSkipExercise: () => void
}

type InitialState = { mode: IntervalStepMode; timer: IntervalTimerState | null; rounds: EditableRound[] }

// Um timer guardado (fechar e reabrir o app no meio do bloco) tem prioridade;
// sem ele, um bloco já registrado abre direto na conferência.
function initialStateOf(
    sessionDate: string,
    exercicio: WorkoutSnapshotExercise,
    setsByKey: Map<string, WorkoutSetRow>,
): InitialState {
    const storedTimer = loadIntervalTimer(sessionDate, exercicio.exercise_key)
    if (storedTimer) {
        const synced = syncIntervalTimer(storedTimer, Date.now())
        if (synced.phase === 'concluido') {
            return { mode: 'revisao', timer: synced, rounds: roundsFromTimer(exercicio, synced.results) }
        }
        return { mode: 'timer', timer: synced, rounds: [] }
    }

    const hasAnyResolvedRound = exercicio.series.some((serie) =>
        isSetResolved(setsByKey.get(setKey(exercicio.exercise_key, serie.set_index))),
    )
    if (hasAnyResolvedRound) {
        return { mode: 'revisao', timer: null, rounds: roundsFromRows(exercicio, setsByKey) }
    }

    return { mode: 'inicio', timer: null, rounds: [] }
}

// Passo do assistente para o cardio intervalado: a prescrição, o timer guiado
// (trabalho e recuperação alternando sozinhos) e, no fim, a conferência das
// rodadas antes de gravar. Tudo cabe numa mão: alvos grandes e nenhum campo
// obrigatório durante o esforço.
export function IntervalStep({
    sessionDate,
    planId,
    snapshot,
    exercicio,
    interval,
    setsByKey,
    confirmLabel,
    onConfirmed,
    onSkipExercise,
}: IntervalStepProps) {
    const { enqueueUpsertSets, getOperationsForDate } = useOutbox()
    const exerciseKey = exercicio.exercise_key
    const [initialState] = useState(() => initialStateOf(sessionDate, exercicio, setsByKey))
    const [mode, setMode] = useState<IntervalStepMode>(initialState.mode)
    const [timer, setTimer] = useState<IntervalTimerState | null>(initialState.timer)
    const [rounds, setRounds] = useState<EditableRound[]>(initialState.rounds)
    const [rpe, setRpe] = useState<number | null>(() => rpeFromRows(exercicio, setsByKey))

    const isTimerRunning = mode === 'timer' && timer !== null && timer.pausedAtMs === null
    const nowMs = useNow(isTimerRunning)
    useWakeLock(isTimerRunning)

    const syncedTimer = timer === null ? null : syncIntervalTimer(timer, nowMs)
    const view = syncedTimer === null ? null : intervalTimerView(syncedTimer, nowMs)

    function updateTimer(nextTimer: IntervalTimerState | null) {
        saveIntervalTimer(nextTimer)
        setTimer(nextTimer)
        if (nextTimer?.phase === 'concluido') {
            setRounds(roundsFromTimer(exercicio, nextTimer.results))
            setMode('revisao')
        }
    }

    // As trocas automáticas de fase acontecem durante a leitura do relógio;
    // aqui elas viram estado e vão para o localStorage.
    useEffect(() => {
        if (timer !== null && syncedTimer !== null && syncedTimer !== timer) {
            updateTimer(syncedTimer)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [syncedTimer, timer])

    // Como nos outros cronômetros, o bipe marca só a passagem vista com a
    // tela aberta: ao retomar, as fases que ficaram para trás não tocam.
    const lastViewRef = useRef<IntervalTimerView | null>(view)
    useEffect(() => {
        if (!view) {
            lastViewRef.current = null
            return
        }
        const previousView = lastViewRef.current
        lastViewRef.current = view
        if (!previousView) {
            return
        }
        const beep = intervalBeepBetween(previousView, view)
        if (beep) {
            playBeep(beep)
        }
    }, [view])

    function applyToTimer(action: (state: IntervalTimerState, atMs: number) => IntervalTimerState) {
        if (!timer) {
            return
        }
        unlockAudio()
        updateTimer(action(timer, Date.now()))
    }

    function handleStart() {
        unlockAudio()
        updateTimer(startIntervalTimer(sessionDate, exerciseKey, intervalConfigFrom(interval), Date.now()))
        setMode('timer')
    }

    function handleManualEntry() {
        setRounds(roundsFromRows(exercicio, setsByKey))
        setMode('revisao')
    }

    function handleFinishEarly() {
        const confirmedFinish = window.confirm('Encerrar o intervalado agora? As rodadas que faltam ficam como puladas.')
        if (confirmedFinish) {
            applyToTimer(finishIntervalTimer)
        }
    }

    function handleRestart() {
        const confirmedRestart = window.confirm('Descartar esta conferência e voltar ao início do intervalado?')
        if (!confirmedRestart) {
            return
        }
        clearIntervalTimer(sessionDate, exerciseKey)
        setTimer(null)
        setRounds([])
        setMode('inicio')
    }

    function updateRound(setIndex: number, changes: Partial<EditableRound>) {
        setRounds((previous) => previous.map((round) => (round.setIndex === setIndex ? { ...round, ...changes } : round)))
    }

    // Rodada que volta a ser feita sem tempo nenhum recebe o alvo, para não
    // travar a confirmação num campo vazio.
    function handleToggleRound(round: EditableRound) {
        if (round.status === 'feita') {
            updateRound(round.setIndex, { status: 'pulada' })
            return
        }
        const secondsText = round.secondsText.trim() === '' ? String(interval.trabalho_segundos_max) : round.secondsText
        updateRound(round.setIndex, { status: 'feita', secondsText })
    }

    function handleConfirm() {
        if (!canConfirmRounds(rounds, rpe)) {
            return
        }
        unlockAudio()
        const nowIso = new Date().toISOString()
        const upsertInputs = buildIntervalRoundValues(exercicio, rounds, rpe, setsByKey, nowIso).map(
            ({ setIndex, values }) => ({ sessionDate, planId, snapshot, exerciseKey, setIndex, values }),
        )
        enqueueUpsertSets(upsertInputs)

        const savedRows = upsertInputs.map((input) =>
            buildOverlaySetRow(
                { kind: 'upsert_set', ...input, enqueuedAt: nowIso, attempts: 0, status: 'pending' },
                setsByKey.get(setKey(exerciseKey, input.setIndex)),
            ),
        )
        clearIntervalTimer(sessionDate, exerciseKey)
        onConfirmed(savedRows)
    }

    const pendingOperation = getOperationsForDate(sessionDate).find(
        (operation): operation is UpsertSetOperation =>
            operation.kind === 'upsert_set' && operation.exerciseKey === exerciseKey,
    )
    const hasEverSaved = exercicio.series.some((serie) => setsByKey.has(setKey(exerciseKey, serie.set_index)))
    const rpeTarget = formatRpeRange(interval.rpe_alvo_min, interval.rpe_alvo_max)

    return (
        <div className="set-card__body">
            <div className="set-card__targets">
                <span>
                    Meta <strong className="set-card__target-value">{formatIntervalPrescription(interval)}</strong>
                </span>
                {rpeTarget && <span>{rpeTarget} alvo</span>}
            </div>
            {mode === 'inicio' && (
                <IntervalStart
                    interval={interval}
                    onStart={handleStart}
                    onManualEntry={handleManualEntry}
                    onSkipExercise={onSkipExercise}
                />
            )}
            {mode === 'timer' && view && (
                <IntervalTimerPanel
                    view={view}
                    interval={interval}
                    onEndWork={() => applyToTimer(endWorkPhase)}
                    onSkipRound={() => applyToTimer(skipRound)}
                    onStartNextRound={() => applyToTimer(startNextRoundNow)}
                    onTogglePause={() => applyToTimer(view.isPaused ? resumeIntervalTimer : pauseIntervalTimer)}
                    onFinishEarly={handleFinishEarly}
                />
            )}
            {mode === 'revisao' && (
                <IntervalReview
                    rounds={rounds}
                    rpe={rpe}
                    rpeTarget={rpeTarget}
                    confirmLabel={confirmLabel}
                    canConfirm={canConfirmRounds(rounds, rpe)}
                    onSecondsChange={(setIndex, secondsText) => updateRound(setIndex, { secondsText })}
                    onToggleRound={handleToggleRound}
                    onRpeChange={setRpe}
                    onConfirm={handleConfirm}
                    onRestart={hasEverSaved ? null : handleRestart}
                />
            )}
            <SaveStatusLabel hasEverSaved={hasEverSaved} pendingOperation={pendingOperation} />
        </div>
    )
}

type IntervalStartProps = {
    interval: WorkoutSnapshotInterval
    onStart: () => void
    onManualEntry: () => void
    onSkipExercise: () => void
}

function IntervalStart({ interval, onStart, onManualEntry, onSkipExercise }: IntervalStartProps) {
    const hasWorkRange = interval.trabalho_segundos_min < interval.trabalho_segundos_max

    return (
        <div className="interval-start">
            <dl className="interval-start__plan">
                <div>
                    <dt>Rodadas</dt>
                    <dd>{interval.rodadas}</dd>
                </div>
                <div>
                    <dt>Trabalho</dt>
                    <dd>{formatIntervalSecondsRange(interval.trabalho_segundos_min, interval.trabalho_segundos_max)}</dd>
                </div>
                <div>
                    <dt>Recuperação</dt>
                    <dd>
                        {formatIntervalSecondsRange(interval.recuperacao_segundos_min, interval.recuperacao_segundos_max)}
                    </dd>
                </div>
            </dl>
            {hasWorkRange && (
                <p className="interval-start__hint">
                    Você encerra cada trabalho dentro da faixa: aviso no mínimo, troca sozinha no máximo.
                </p>
            )}
            <button type="button" className="primary-button interval-start__go" onClick={onStart}>
                <Play size={ACTION_ICON_SIZE} aria-hidden="true" />
                Iniciar
            </button>
            <div className="set-skip-actions">
                <button type="button" className="ghost-button" onClick={onManualEntry}>
                    <Check size={SMALL_ICON_SIZE} aria-hidden="true" />
                    Lançar sem timer
                </button>
                <button type="button" className="ghost-button" onClick={onSkipExercise}>
                    <ChevronsRight size={SMALL_ICON_SIZE} aria-hidden="true" />
                    Pular exercício
                </button>
            </div>
        </div>
    )
}

type IntervalTimerPanelProps = {
    view: IntervalTimerView
    interval: WorkoutSnapshotInterval
    onEndWork: () => void
    onSkipRound: () => void
    onStartNextRound: () => void
    onTogglePause: () => void
    onFinishEarly: () => void
}

function timerMessage(view: IntervalTimerView, interval: WorkoutSnapshotInterval): string {
    if (view.isPaused) {
        return 'Pausado'
    }
    if (view.phase === 'recuperacao') {
        return 'até a próxima rodada'
    }
    if (!view.hasWorkRange) {
        return `meta ${formatIntervalSeconds(interval.trabalho_segundos_max)}`
    }

    return view.workStage === 'antes_do_minimo'
        ? `até o mínimo de ${formatIntervalSeconds(interval.trabalho_segundos_min)}`
        : 'na faixa: encerre quando quiser'
}

function IntervalTimerPanel({
    view,
    interval,
    onEndWork,
    onSkipRound,
    onStartNextRound,
    onTogglePause,
    onFinishEarly,
}: IntervalTimerPanelProps) {
    const isWork = view.phase === 'trabalho'
    const isInRange = isWork && view.hasWorkRange && view.workStage === 'na_faixa'
    const panelClassNames = ['interval-timer', `interval-timer--${view.phase}`]
    if (isInRange) {
        panelClassNames.push('interval-timer--na-faixa')
    }
    if (view.isPaused) {
        panelClassNames.push('interval-timer--pausado')
    }

    return (
        <div className="interval-timer-panel">
            <div className={panelClassNames.join(' ')} role="timer" aria-label="Timer do intervalado">
                <span className="interval-timer__phase">{isWork ? 'Trabalho' : 'Recuperação'}</span>
                <span className="interval-timer__round">
                    {isWork ? 'Rodada' : 'Próxima'} {view.roundNumber} de {view.totalRounds}
                </span>
                <span className="interval-timer__clock" aria-live="off">
                    {formatClock(view.remainingSeconds)}
                </span>
                <span className="interval-timer__message" aria-live="polite">
                    {timerMessage(view, interval)}
                </span>
            </div>
            {isWork ? (
                <button
                    type="button"
                    className={isInRange ? 'primary-button interval-timer__main' : 'secondary-button interval-timer__main'}
                    onClick={onEndWork}
                >
                    <Square size={ACTION_ICON_SIZE} aria-hidden="true" />
                    {view.hasWorkRange ? 'Encerrar trabalho' : 'Encerrar rodada'}
                </button>
            ) : (
                <button type="button" className="primary-button interval-timer__main" onClick={onStartNextRound}>
                    <Play size={ACTION_ICON_SIZE} aria-hidden="true" />
                    Começar rodada {view.roundNumber} agora
                </button>
            )}
            <div className="interval-timer__actions">
                <button type="button" className="secondary-button interval-timer__action" onClick={onTogglePause}>
                    {view.isPaused ? (
                        <Play size={ACTION_ICON_SIZE} aria-hidden="true" />
                    ) : (
                        <Pause size={ACTION_ICON_SIZE} aria-hidden="true" />
                    )}
                    {view.isPaused ? 'Retomar' : 'Pausar'}
                </button>
                {isWork && (
                    <button type="button" className="secondary-button interval-timer__action" onClick={onSkipRound}>
                        <SkipForward size={ACTION_ICON_SIZE} aria-hidden="true" />
                        Pular rodada
                    </button>
                )}
            </div>
            <p className="interval-timer__tally">
                {view.doneRounds} {view.doneRounds === 1 ? 'feita' : 'feitas'}
                {view.skippedRounds > 0 && ` · ${view.skippedRounds} ${view.skippedRounds === 1 ? 'pulada' : 'puladas'}`}
            </p>
            <button type="button" className="ghost-button interval-timer__finish" onClick={onFinishEarly}>
                Encerrar intervalado
            </button>
        </div>
    )
}

type IntervalReviewProps = {
    rounds: EditableRound[]
    rpe: number | null
    rpeTarget: string | null
    confirmLabel: string
    canConfirm: boolean
    onSecondsChange: (setIndex: number, secondsText: string) => void
    onToggleRound: (round: EditableRound) => void
    onRpeChange: (rpe: number | null) => void
    onConfirm: () => void
    onRestart: (() => void) | null
}

function IntervalReview({
    rounds,
    rpe,
    rpeTarget,
    confirmLabel,
    canConfirm,
    onSecondsChange,
    onToggleRound,
    onRpeChange,
    onConfirm,
    onRestart,
}: IntervalReviewProps) {
    return (
        <div className="interval-review">
            <p className="interval-review__title">Confira as rodadas</p>
            <ul className="interval-review__rounds">
                {rounds.map((round) => {
                    const isDone = round.status === 'feita'
                    return (
                        <li
                            key={round.setIndex}
                            className={isDone ? 'interval-review__round' : 'interval-review__round interval-review__round--skipped'}
                        >
                            <span className="interval-review__label">Rodada {round.setIndex}</span>
                            <label className="interval-review__seconds">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    aria-label={`Trabalho da rodada ${round.setIndex} em segundos`}
                                    value={isDone ? round.secondsText : ''}
                                    disabled={!isDone}
                                    placeholder={isDone ? 'seg' : '-'}
                                    onChange={(event) => onSecondsChange(round.setIndex, event.target.value)}
                                />
                                <span>s</span>
                            </label>
                            <button
                                type="button"
                                className={isDone ? 'interval-review__toggle' : 'interval-review__toggle interval-review__toggle--skipped'}
                                aria-pressed={isDone}
                                onClick={() => onToggleRound(round)}
                            >
                                {isDone ? 'Feita' : 'Pulada'}
                            </button>
                        </li>
                    )
                })}
            </ul>
            <div className="interval-rpe">
                <p className="interval-rpe__label">
                    RPE do bloco (opcional){rpeTarget && <span className="interval-rpe__target"> · {rpeTarget} alvo</span>}
                </p>
                <div className="interval-rpe__options" role="group" aria-label="RPE do bloco">
                    {RPE_OPTIONS.map((option) => (
                        <button
                            key={option}
                            type="button"
                            className={option === rpe ? 'interval-rpe__option interval-rpe__option--selected' : 'interval-rpe__option'}
                            aria-pressed={option === rpe}
                            onClick={() => onRpeChange(option === rpe ? null : option)}
                        >
                            {option}
                        </button>
                    ))}
                </div>
            </div>
            <button type="button" className="primary-button set-card__confirm" disabled={!canConfirm} onClick={onConfirm}>
                <Check size={ACTION_ICON_SIZE} strokeWidth={CONFIRM_ICON_STROKE} aria-hidden="true" />
                {confirmLabel}
            </button>
            {onRestart && (
                <button type="button" className="ghost-button interval-review__restart" onClick={onRestart}>
                    <Undo2 size={SMALL_ICON_SIZE} aria-hidden="true" />
                    Descartar e recomeçar
                </button>
            )}
        </div>
    )
}
