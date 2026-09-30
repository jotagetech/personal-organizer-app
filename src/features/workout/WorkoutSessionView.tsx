import {
    ArrowLeftRight,
    CalendarClock,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Minus,
    Plus,
    Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { AddExtraExercisePanel } from '@/features/workout/AddExtraExercisePanel'

import { finishSession, getSessionForDate, replaceSessionWorkout } from '@/features/workout/api'
import { DropSetStepRow } from '@/features/workout/DropSetStepRow'
import { appendExtraExercise } from '@/features/workout/extraExercises'
import { ExerciseSetRow } from '@/features/workout/ExerciseSetRow'
import { IntervalStep } from '@/features/workout/IntervalStep'
import { recordingLockNotice, type RecordingLock } from '@/features/workout/recordableDate'
import { RestTimerBar } from '@/features/workout/RestTimerBar'
import { decideRestPushAction, planRestPush, type RestPushPlan } from '@/features/workout/restPush'
import { SessionClock } from '@/features/workout/SessionClock'
import { groupDropsBySetKey } from '@/features/workout/setDrops'
import type { PlanWeek } from '@/features/workout/planWeek'
import { planDefaultRest, snapshotSetRest } from '@/features/workout/restPrescription'
import { exerciseTags } from '@/features/workout/setPresentation'
import { buildWorkoutSnapshot } from '@/features/workout/snapshot'
import { buildSavedWorkoutStep, restoreWorkoutStep, type SavedWorkoutStep } from '@/features/workout/sessionResume'
import {
    clearWorkoutStep,
    loadRestTimer,
    loadSavedWorkoutStep,
    saveRestTimer,
    saveWorkoutStep,
} from '@/features/workout/timerStorage'
import {
    extendRestTimer,
    REST_EXTENSION_SECONDS,
    shouldStartRest,
    startRestTimer,
    type RestTimer,
} from '@/features/workout/workoutTimers'
import {
    setKey,
    type WorkoutSessionRow,
    type WorkoutSetDropRow,
    type WorkoutSetRow,
    type WorkoutSnapshot,
    type WorkoutSnapshotExercise,
} from '@/features/workout/types'
import { deriveSessionActiveWindow } from '@/features/workout/sessionDuration'
import {
    canCancelStart,
    pauseAt,
    pauseStateFromSession,
    resumeAt as resumePauseAt,
    RUNNING_PAUSE_STATE,
    type SessionPauseState,
} from '@/features/workout/sessionPause'
import {
    buildSkipValuesForRemainingSets,
    findFirstIncompletePosition,
    findNextUnresolvedPosition,
    firstUnresolvedSetInExercise,
    isFirstStep,
    isIntervalExercise,
    isOnlyUnresolvedExercise,
    isOnlyUnresolvedSet,
    mainStepOf,
    nextStepWithinSet,
    retreatStep,
    setStatusOf,
    summarizeExerciseProgress,
    type ExerciseProgress,
    type StepPosition,
    type WizardStep,
} from '@/features/workout/sessionProgress'
import { WorkoutFinishPanel } from '@/features/workout/WorkoutFinishPanel'
import { suggestWorkoutForWeekday } from '@/features/workout/workoutSelection'
import { useDayStatus } from '@/contexts/DayStatusContext'
import { useOutbox } from '@/contexts/OutboxContext'
import { cancelRestPush, scheduleRestPush } from '@/features/notifications/pushApi'
import {
    applyPendingExtraExercises,
    buildOverlaySetRow,
    findPendingFinishedAt,
    findPendingPauseState,
    findPendingStartedAt,
    overlayPendingDrops,
    overlayPendingSets,
    resolveEffectivePauseState,
    resolveEffectiveStartedAt,
    resolvePendingSnapshot,
    type OutboxDropValues,
    type OutboxOperation,
} from '@/lib/outbox/outboxQueue'
import { weekdayOfIsoDate, type IsoDate } from '@/lib/dateUtils'
import type { Workout, WorkoutPlan } from '@/lib/workoutPlanSchema'

const BUTTON_ICON_SIZE = 18
const FIRST_POSITION: StepPosition = { exerciseIndex: 0, setIndexInExercise: 0 }
const STATUS_ICON_SIZE = 14
const STATUS_ICON_STROKE = 3

type WorkoutSessionViewProps = {
    plan: WorkoutPlan
    planId: string
    sessionDate: IsoDate
    planWeek: PlanWeek | null
    // Com trava, a tela mostra o treino para consulta e nada registra; em
    // 'excluindo' ela também ignora o que a data tinha, como se o dia estivesse
    // vazio, sem tocar em nada guardado, para o desfazer voltar intacto.
    recordingLock: RecordingLock
    // Avisa quem monta a tela se a data tem treino registrado (no servidor ou
    // só na fila), que é quando excluir o treino do dia faz sentido.
    onRecordedWorkoutChange: (hasRecordedWorkout: boolean) => void
}

export function WorkoutSessionView({
    plan,
    planId,
    sessionDate,
    planWeek,
    recordingLock,
    onRecordedWorkoutChange,
}: WorkoutSessionViewProps) {
    const outbox = useOutbox()
    const { refreshDayStatus } = useDayStatus()
    const [isLoading, setIsLoading] = useState(true)
    const [session, setSession] = useState<WorkoutSessionRow | null>(null)
    const [snapshot, setSnapshot] = useState<WorkoutSnapshot | null>(null)
    const [setsByKey, setSetsByKey] = useState<Map<string, WorkoutSetRow>>(new Map())
    const [workoutChoices, setWorkoutChoices] = useState<Workout[] | null>(null)
    const [position, setPosition] = useState<StepPosition | null>(null)
    // Com a série concluída, o assistente pode estar numa das quedas dela;
    // null é a própria série.
    const [dropPosition, setDropPosition] = useState<number | null>(null)
    const [dropsBySetKey, setDropsBySetKey] = useState<Map<string, OutboxDropValues[]>>(new Map())
    const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null)
    const [reloadToken, setReloadToken] = useState(0)
    const [isSwitchingWorkout, setIsSwitchingWorkout] = useState(false)
    const [switchWorkoutErrorMessage, setSwitchWorkoutErrorMessage] = useState<string | null>(null)
    const [isExercisePickerOpen, setIsExercisePickerOpen] = useState(false)
    const [isAddingExercise, setIsAddingExercise] = useState(false)
    const canRecord = recordingLock === null
    const isShowingDeletedDay = recordingLock === 'excluindo'
    const [restTimer, setRestTimer] = useState<RestTimer | null>(() =>
        isShowingDeletedDay ? null : loadRestTimer(sessionDate),
    )
    // Início e fim do treino como a tela enxerga: o que veio do servidor ou,
    // enquanto o envio não acontece, a hora guardada na fila. Ficam aqui
    // porque a sessão carregada não é recarregada depois de cada envio.
    const [startedAt, setStartedAt] = useState<string | null>(null)
    const [finishedAt, setFinishedAt] = useState<string | null>(null)
    // A pausa também fica numa ref: confirmar a última série retoma e
    // finaliza no mesmo toque, e a finalização precisa ver a pausa já
    // encerrada, não o estado da renderização anterior.
    const [pauseState, setPauseState] = useState<SessionPauseState>(RUNNING_PAUSE_STATE)
    const pauseStateRef = useRef<SessionPauseState>(RUNNING_PAUSE_STATE)
    // Último push de descanso mandado ao servidor por esta tela; undefined
    // enquanto ela não mandou nenhum.
    const lastRestPushPlanRef = useRef<RestPushPlan | null | undefined>(undefined)
    const isPaused = pauseState.pausedAt !== null

    function updateRestTimer(nextTimer: RestTimer | null) {
        saveRestTimer(nextTimer)
        setRestTimer(nextTimer)
    }

    function updatePauseState(nextPauseState: SessionPauseState) {
        pauseStateRef.current = nextPauseState
        setPauseState(nextPauseState)
    }

    useEffect(() => {
        let isCancelled = false

        async function load() {
            setIsLoading(true)
            setLoadErrorMessage(null)
            try {
                if (isShowingDeletedDay) {
                    showSuggestedWorkout(null)
                    return
                }

                const savedStep = loadSavedWorkoutStep(sessionDate)
                const existing = await fetchSessionUnlessDeleted()
                if (isCancelled) {
                    return
                }

                if (existing) {
                    await applyExistingSession(existing.session, existing.sets, existing.drops, savedStep)
                    return
                }

                // Uma sessão nunca sincronizada ainda no servidor (o dia inteiro
                // foi registrado sem sinal) não aparece em getSessionForDate; o
                // treino em andamento continua vindo da própria fila de envio,
                // inclusive quando só o início foi marcado ou um extra foi
                // acrescentado e nenhuma série existe ainda.
                const pendingOperationsForDate = outbox.getOperationsForDate(sessionDate)
                const pendingSnapshot = resolvePendingSnapshot(pendingOperationsForDate, sessionDate)
                if (pendingSnapshot) {
                    resumeFromPendingOperations(pendingSnapshot, pendingOperationsForDate, savedStep)
                    return
                }

                showSuggestedWorkout(savedStep)
            } catch (loadError) {
                if (isCancelled) {
                    return
                }
                const message = loadError instanceof Error ? loadError.message : 'Falha ao carregar treino'
                setLoadErrorMessage(message)
            } finally {
                if (!isCancelled) {
                    setIsLoading(false)
                }
            }
        }

        void load()
        return () => {
            isCancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionDate, plan, reloadToken])

    // Uma exclusão ainda na fila vale mais que o servidor: até ela chegar lá,
    // a sessão que ele devolve já foi apagada no aparelho.
    async function fetchSessionUnlessDeleted(): Promise<Awaited<ReturnType<typeof getSessionForDate>>> {
        if (outbox.hasPendingSessionDeletion(sessionDate)) {
            return null
        }
        const existing = await getSessionForDate(sessionDate)
        if (outbox.hasPendingSessionDeletion(sessionDate)) {
            return null
        }

        return existing
    }

    // Nada gravado na data (nem no servidor nem na fila): o treino já
    // escolhido nela, que o passo guardado lembra, ou a sugestão do plano.
    function showSuggestedWorkout(savedStep: SavedWorkoutStep | null) {
        const savedWorkout = plan.treinos.find((workout) => workout.id === savedStep?.workoutKey)
        if (savedWorkout) {
            startUnsavedWorkout(savedWorkout, savedStep)
            return
        }

        const weekday = weekdayOfIsoDate(sessionDate)
        const suggestion = suggestWorkoutForWeekday(plan, weekday)
        if (suggestion.kind === 'single') {
            startUnsavedWorkout(suggestion.workout, null)
            return
        }

        setWorkoutChoices(suggestion.kind === 'choose_one' ? suggestion.workouts : suggestion.availableWorkouts)
        setSnapshot(null)
        setSession(null)
        setSetsByKey(new Map())
        setDropsBySetKey(new Map())
    }

    function goToSet(nextPosition: StepPosition | null) {
        setPosition(nextPosition)
        setDropPosition(null)
    }

    function goToStep(step: WizardStep) {
        setPosition(step.position)
        setDropPosition(step.dropPosition)
    }

    // Volta ao passo guardado quando ele ainda vale para este treino; sem ele,
    // segue a retomada pela primeira série pendente.
    function resumeAt(
        resumeSnapshot: WorkoutSnapshot,
        resumeSetsByKey: Map<string, WorkoutSetRow>,
        firstIncompletePosition: StepPosition,
        savedStep: SavedWorkoutStep | null,
    ) {
        const restoredStep = restoreWorkoutStep(resumeSnapshot, resumeSetsByKey, savedStep)
        goToStep(restoredStep ?? mainStepOf(firstIncompletePosition))
    }

    function resumeFromPendingOperations(
        pendingSnapshot: WorkoutSnapshot,
        operations: OutboxOperation[],
        savedStep: SavedWorkoutStep | null,
    ) {
        const overlaidSetsByKey = overlayPendingSets(new Map(), operations, sessionDate)
        const isFinishPending = operations.some((operation) => operation.kind === 'finish_session')
        const firstIncompletePosition = findFirstIncompletePosition(pendingSnapshot, overlaidSetsByKey)

        setSnapshot(pendingSnapshot)
        setSession(null)
        setSetsByKey(overlaidSetsByKey)
        setDropsBySetKey(new Map())
        setWorkoutChoices(null)
        setStartedAt(findPendingStartedAt(operations, sessionDate))
        updatePauseState(findPendingPauseState(operations, sessionDate) ?? RUNNING_PAUSE_STATE)
        setFinishedAt(findPendingFinishedAt(operations, sessionDate))
        if (isFinishPending || firstIncompletePosition === null) {
            goToSet(null)
            return
        }
        resumeAt(pendingSnapshot, overlaidSetsByKey, firstIncompletePosition, savedStep)
    }

    async function applyExistingSession(
        existingSession: WorkoutSessionRow,
        sets: WorkoutSetRow[],
        dropRows: WorkoutSetDropRow[],
        savedStep: SavedWorkoutStep | null,
    ) {
        const nextSetsByKey = new Map<string, WorkoutSetRow>()
        for (const set of sets) {
            nextSetsByKey.set(setKey(set.exercise_key, set.set_index), set)
        }

        // Extras ainda na fila entram por cima do snapshot do servidor, como as
        // séries: a retomada, o progresso e a finalização já contam com eles.
        const pendingOperationsForDate = outbox.getOperationsForDate(sessionDate)
        const overlaidSetsByKey = overlayPendingSets(nextSetsByKey, pendingOperationsForDate, sessionDate)
        const effectiveSnapshot = applyPendingExtraExercises(
            existingSession.workout_snapshot,
            pendingOperationsForDate,
            sessionDate,
        )

        setSession({ ...existingSession, workout_snapshot: effectiveSnapshot })
        setStartedAt(resolveEffectiveStartedAt(existingSession.started_at ?? null, pendingOperationsForDate, sessionDate))
        updatePauseState(
            resolveEffectivePauseState(pauseStateFromSession(existingSession), pendingOperationsForDate, sessionDate),
        )
        setFinishedAt(existingSession.finished_at ?? findPendingFinishedAt(pendingOperationsForDate, sessionDate))
        setSnapshot(effectiveSnapshot)
        setSetsByKey(overlaidSetsByKey)
        setDropsBySetKey(groupDropsBySetKey(sets, dropRows))
        setWorkoutChoices(null)

        const resumePosition = findFirstIncompletePosition(effectiveSnapshot, overlaidSetsByKey)
        if (resumePosition === null) {
            goToSet(null)
        } else {
            resumeAt(effectiveSnapshot, overlaidSetsByKey, resumePosition, savedStep)
        }

        const allSetsAlreadyResolved = resumePosition === null
        if (allSetsAlreadyResolved && !existingSession.finished_at && canRecord) {
            // Fechar o treino só ao reabrir a data não pode carimbar a hora da
            // reabertura: o fim real é a última série concluída, quando existe.
            const activeWindow = deriveSessionActiveWindow(Array.from(overlaidSetsByKey.values()))
            const finishedSession = await finishSession(existingSession.id, activeWindow?.endIso)
            setSession({ ...finishedSession, workout_snapshot: effectiveSnapshot })
            setFinishedAt(finishedSession.finished_at)
            resumeWorkoutAt(finishedSession.finished_at ?? new Date().toISOString())
            refreshDayStatus()
        }
    }

    function startUnsavedWorkout(workout: Workout, savedStep: SavedWorkoutStep | null) {
        const nextSnapshot = buildWorkoutSnapshot(workout, planWeek, planDefaultRest(plan))
        showUnsavedSnapshot(nextSnapshot, savedStep)
    }

    function showUnsavedSnapshot(nextSnapshot: WorkoutSnapshot, savedStep: SavedWorkoutStep | null) {
        setSnapshot(nextSnapshot)
        setSession(null)
        setSetsByKey(new Map())
        setDropsBySetKey(new Map())
        setWorkoutChoices(null)
        resumeAt(nextSnapshot, new Map(), FIRST_POSITION, savedStep)
    }

    // A sessão carregada fica nula quando ela ainda não existia ao abrir a
    // data, mesmo depois de o início ou uma série terem chegado ao servidor.
    // Antes de trocar o treino é preciso saber se ela já existe lá, senão a
    // troca ficaria só no aparelho e o servidor continuaria com o treino
    // antigo. Sem nada feito na data não há o que procurar; sem sinal, a troca
    // segue local como antes.
    async function findSessionCreatedMeanwhile(): Promise<WorkoutSessionRow | null> {
        const hasExtraExercise = snapshot?.exercicios.some((exercicio) => exercicio.extra === true) ?? false
        const hasAnythingRecorded = startedAt !== null || currentEffectiveSetsByKey().size > 0 || hasExtraExercise
        if (!hasAnythingRecorded) {
            return null
        }
        try {
            const existing = await fetchSessionUnlessDeleted()
            const createdSession = existing?.session ?? null
            return createdSession
        } catch {
            return null
        }
    }

    async function resolveCurrentSession(): Promise<WorkoutSessionRow | null> {
        if (session) {
            return session
        }
        setIsSwitchingWorkout(true)
        try {
            const createdSession = await findSessionCreatedMeanwhile()
            return createdSession
        } finally {
            setIsSwitchingWorkout(false)
        }
    }

    // Um início ainda na fila leva o snapshot do treino que vai criar a
    // sessão; trocar de treino antes do envio atualiza esse snapshot e mantém
    // a hora do início.
    function switchUnsavedWorkout(workout: Workout) {
        const nextSnapshot = buildWorkoutSnapshot(workout, planWeek, planDefaultRest(plan))
        outbox.discardPendingExtraExercises(sessionDate)
        // O timer guardado é um só para o app inteiro: só é zerado quando é o
        // desta data, para consultar outro dia não fechar o descanso de hoje.
        if (restTimer) {
            updateRestTimer(null)
        }
        showUnsavedSnapshot(nextSnapshot, null)
        if (startedAt) {
            outbox.enqueueStartSession({ sessionDate, planId, snapshot: nextSnapshot, startedAt })
        }
    }

    async function handleChooseWorkout(workout: Workout) {
        if (isShowingDeletedDay) {
            return
        }
        const currentSession = await resolveCurrentSession()
        if (!currentSession) {
            switchUnsavedWorkout(workout)
            return
        }
        if (!canRecord) {
            return
        }

        const confirmedDiscard = window.confirm(
            'Trocar o treino descarta os registros já feitos nesta data. Continuar?',
        )
        if (!confirmedDiscard) {
            return
        }

        const nextSnapshot = buildWorkoutSnapshot(workout, planWeek, planDefaultRest(plan))
        setIsSwitchingWorkout(true)
        setSwitchWorkoutErrorMessage(null)

        try {
            const updatedSession = await replaceSessionWorkout({
                sessionId: currentSession.id,
                planId,
                snapshot: nextSnapshot,
            })
            outbox.discardPendingExtraExercises(sessionDate)
            updateRestTimer(null)
            setSnapshot(nextSnapshot)
            setSession(updatedSession)
            setSetsByKey(new Map())
            setDropsBySetKey(new Map())
            setWorkoutChoices(null)
            goToSet(FIRST_POSITION)
        } catch (switchError) {
            const message =
                switchError instanceof Error ? switchError.message : 'Falha ao trocar o treino'
            setSwitchWorkoutErrorMessage(message)
        } finally {
            setIsSwitchingWorkout(false)
        }
    }

    function handleRequestSwitchWorkout() {
        setWorkoutChoices(plan.treinos)
    }

    function handleLocalSetSaved(row: WorkoutSetRow) {
        const key = setKey(row.exercise_key, row.set_index)
        setSetsByKey((previous) => {
            const next = new Map(previous)
            next.set(key, row)
            return next
        })
        if (row.skipped_at) {
            forgetLocalDrops([key])
        }
    }

    // Como as séries, as quedas confirmadas no aparelho ficam guardadas aqui
    // além da fila: depois que o envio termina e sai da fila, é daqui que a
    // tela continua mostrando o que foi digitado.
    function handleLocalDropsSaved(key: string, drops: OutboxDropValues[]) {
        setDropsBySetKey((previous) => new Map(previous).set(key, drops))
    }

    function forgetLocalDrops(keys: string[]) {
        setDropsBySetKey((previous) => {
            const next = new Map(previous)
            keys.forEach((key) => next.delete(key))
            return next
        })
    }

    function currentEffectiveSetsByKey(): Map<string, WorkoutSetRow> {
        return overlayPendingSets(setsByKey, outbox.getOperationsForDate(sessionDate), sessionDate)
    }

    function moveToNextUnresolved(resolvedSetsByKey: Map<string, WorkoutSetRow>) {
        if (!snapshot || !position) {
            return
        }

        const nextPosition = findNextUnresolvedPosition(snapshot, resolvedSetsByKey, position)
        goToSet(nextPosition)
        setIsExercisePickerOpen(false)

        if (nextPosition === null && canRecord) {
            const nowIso = new Date().toISOString()
            // Treino finalizado nunca fica pausado, por qualquer caminho que
            // tenha chegado à última série.
            resumeWorkoutAt(nowIso)
            updateRestTimer(null)
            setFinishedAt(nowIso)
            outbox.enqueueFinishSession(sessionDate, nowIso)
            refreshDayStatus()
        }
    }

    function startWorkoutAt(startIso: string) {
        if (!snapshot || !canRecord) {
            return
        }
        setStartedAt(startIso)
        outbox.enqueueStartSession({ sessionDate, planId, snapshot, startedAt: startIso })
    }

    function handleStartWorkout() {
        startWorkoutAt(new Date().toISOString())
    }

    function handlePauseWorkout() {
        if (!startedAt || finishedAt || !canRecord) {
            return
        }
        const pausedAtIso = new Date().toISOString()
        const nextPauseState = pauseAt(pauseStateRef.current, pausedAtIso)
        if (nextPauseState === pauseStateRef.current) {
            return
        }
        updatePauseState(nextPauseState)
        outbox.enqueuePauseSession(sessionDate, nextPauseState, pausedAtIso)
    }

    function resumeWorkoutAt(resumedAtIso: string) {
        if (!canRecord) {
            return
        }
        const nextPauseState = resumePauseAt(pauseStateRef.current, resumedAtIso)
        if (nextPauseState === pauseStateRef.current) {
            return
        }
        updatePauseState(nextPauseState)
        outbox.enqueueResumeSession(sessionDate, nextPauseState, resumedAtIso)
    }

    function handleResumeWorkout() {
        resumeWorkoutAt(new Date().toISOString())
    }

    // Volta para antes de "Iniciar treino". Só existe enquanto nenhuma série
    // foi resolvida: depois disso o treino já aconteceu e só pode ser pausado.
    function handleCancelStart() {
        if (!startedAt || !canCancelStart(currentEffectiveSetsByKey().values()) || !canRecord) {
            return
        }
        const confirmedCancel = window.confirm('Cancelar o início do treino? O relógio volta para antes de iniciar.')
        if (!confirmedCancel) {
            return
        }

        setStartedAt(null)
        updatePauseState(RUNNING_PAUSE_STATE)
        setSession((previous) =>
            previous ? { ...previous, started_at: null, paused_at: null, paused_seconds: 0 } : previous,
        )
        outbox.cancelSessionStart(sessionDate, new Date().toISOString())
    }

    // Resolver uma série sem ter tocado em "Iniciar treino" começa o treino
    // naquele momento, para a duração nunca ficar sem início; com o treino
    // pausado, retoma nele, porque houve treino a partir dali.
    function ensureWorkoutRunning() {
        const nowIso = new Date().toISOString()
        if (!startedAt) {
            startWorkoutAt(nowIso)
            return
        }
        resumeWorkoutAt(nowIso)
    }

    // O estado (setsByKey e a fila) ainda não reflete a série recém-salva
    // neste mesmo tick, então a próxima posição é calculada sobre um mapa que
    // já inclui a linha devolvida pela série.
    function mergeSavedRow(row: WorkoutSetRow): Map<string, WorkoutSetRow> {
        return new Map(currentEffectiveSetsByKey()).set(setKey(row.exercise_key, row.set_index), row)
    }

    function handleSetResolved(row: WorkoutSetRow) {
        moveToNextUnresolved(mergeSavedRow(row))
    }

    function handleSetSkipped(row: WorkoutSetRow) {
        ensureWorkoutRunning()
        handleSetResolved(row)
    }

    // Série com drop set segue para a primeira queda antes de sair dela; a
    // série já fica concluída aqui, então fechar o app no meio das quedas não
    // perde a série principal.
    function handleSetConfirmed(row: WorkoutSetRow) {
        if (!snapshot || !position) {
            return
        }
        ensureWorkoutRunning()

        const nextStep = nextStepWithinSet(snapshot, mainStepOf(position))
        if (nextStep) {
            setDropPosition(nextStep.dropPosition)
            setIsExercisePickerOpen(false)
            return
        }

        startRestAfterSet(mergeSavedRow(row), position)
        handleSetResolved(row)
    }

    // Quedas intermediárias de um drop set são feitas sem pausa: o descanso
    // começa só quando a série termina por inteiro (última queda confirmada ou
    // quedas restantes puladas).
    function startRestAfterSet(resolvedSetsByKey: Map<string, WorkoutSetRow>, confirmedPosition: StepPosition) {
        if (!snapshot) {
            return
        }
        const exercicio = snapshot.exercicios[confirmedPosition.exerciseIndex]
        const confirmedSet = exercicio.series[confirmedPosition.setIndexInExercise]
        const rest = snapshotSetRest(exercicio, confirmedSet)
        if (rest === null) {
            return
        }
        const hasNextUnresolvedSet =
            findNextUnresolvedPosition(snapshot, resolvedSetsByKey, confirmedPosition) !== null
        if (!shouldStartRest(rest.min, rest.max, hasNextUnresolvedSet)) {
            return
        }
        updateRestTimer(startRestTimer(sessionDate, rest.min, rest.max, Date.now()))
    }

    function handleDropConfirmed() {
        if (!snapshot || !position) {
            return
        }
        ensureWorkoutRunning()

        const nextStep = nextStepWithinSet(snapshot, { position, dropPosition })
        if (nextStep) {
            setDropPosition(nextStep.dropPosition)
            return
        }

        startRestAfterSet(currentEffectiveSetsByKey(), position)
        moveToNextUnresolved(currentEffectiveSetsByKey())
    }

    function handleSkipRemainingDrops() {
        ensureWorkoutRunning()
        if (position) {
            startRestAfterSet(currentEffectiveSetsByKey(), position)
        }
        moveToNextUnresolved(currentEffectiveSetsByKey())
    }

    function handleSkipExercise(row: WorkoutSetRow) {
        if (!snapshot || !position) {
            return
        }

        const exercicio = snapshot.exercicios.find((candidate) => candidate.exercise_key === row.exercise_key)
        if (!exercicio) {
            return
        }

        skipRemainingSetsOf(exercicio, mergeSavedRow(row))
    }

    function handleSkipIntervalExercise() {
        if (!snapshot || !position) {
            return
        }

        skipRemainingSetsOf(snapshot.exercicios[position.exerciseIndex], currentEffectiveSetsByKey())
    }

    function skipRemainingSetsOf(exercicio: WorkoutSnapshotExercise, mergedSetsByKey: Map<string, WorkoutSetRow>) {
        if (!snapshot || !canRecord) {
            return
        }

        const skipValues = buildSkipValuesForRemainingSets(exercicio, mergedSetsByKey, new Date().toISOString())
        if (skipValues.length === 0) {
            moveToNextUnresolved(mergedSetsByKey)
            return
        }

        const unitLabel = isIntervalExercise(exercicio) ? 'rodadas' : 'séries'
        const confirmedSkip = window.confirm(`Pular as ${skipValues.length} ${unitLabel} restantes de ${exercicio.nome}?`)
        if (!confirmedSkip) {
            return
        }

        const upsertInputs = skipValues.map(({ setIndex, values }) => ({
            sessionDate,
            planId,
            snapshot,
            exerciseKey: exercicio.exercise_key,
            setIndex,
            values,
        }))
        ensureWorkoutRunning()
        outbox.enqueueUpsertSets(upsertInputs)

        const enqueuedAt = new Date().toISOString()
        const skippedRows = upsertInputs.map((input) => {
            const key = setKey(input.exerciseKey, input.setIndex)
            const skippedRow = buildOverlaySetRow(
                { kind: 'upsert_set', ...input, enqueuedAt, attempts: 0, status: 'pending' },
                mergedSetsByKey.get(key),
            )
            mergedSetsByKey.set(key, skippedRow)
            return skippedRow
        })

        rememberLocalRows(skippedRows)
        forgetLocalDrops(skippedRows.map((skippedRow) => setKey(skippedRow.exercise_key, skippedRow.set_index)))
        moveToNextUnresolved(mergedSetsByKey)
    }

    function rememberLocalRows(rows: WorkoutSetRow[]) {
        setSetsByKey((previous) => {
            const next = new Map(previous)
            for (const row of rows) {
                next.set(setKey(row.exercise_key, row.set_index), row)
            }
            return next
        })
    }

    // Todas as rodadas chegam juntas da conferência; o bloco não tem descanso
    // próprio depois dele, então o assistente segue direto.
    function handleIntervalConfirmed(rows: WorkoutSetRow[]) {
        ensureWorkoutRunning()
        const mergedSetsByKey = new Map(currentEffectiveSetsByKey())
        for (const row of rows) {
            mergedSetsByKey.set(setKey(row.exercise_key, row.set_index), row)
        }
        rememberLocalRows(rows)
        moveToNextUnresolved(mergedSetsByKey)
    }

    function handleSelectExercise(exerciseIndex: number) {
        if (!snapshot) {
            return
        }
        goToSet(firstUnresolvedSetInExercise(snapshot, currentEffectiveSetsByKey(), exerciseIndex))
        setIsExercisePickerOpen(false)
    }

    // O extra entra só no snapshot desta sessão, no fim da lista, e o
    // assistente vai direto para a primeira série dele. Não inicia o treino:
    // isso continua sendo o toque em "Iniciar treino" ou a primeira série
    // resolvida.
    function handleAddExtraExercise(exercise: WorkoutSnapshotExercise) {
        if (!snapshot || finishedAt || session?.finished_at || !canRecord) {
            return
        }
        const nextSnapshot = appendExtraExercise(snapshot, exercise)
        setIsAddingExercise(false)
        setIsExercisePickerOpen(false)
        if (nextSnapshot === snapshot) {
            return
        }

        setSnapshot(nextSnapshot)
        setSession((previous) => (previous ? { ...previous, workout_snapshot: nextSnapshot } : previous))
        outbox.enqueueAddExtraExercise({ sessionDate, planId, snapshot: nextSnapshot, exercise })
        goToSet({ exerciseIndex: nextSnapshot.exercicios.length - 1, setIndexInExercise: 0 })
    }

    function handleGoBack() {
        if (!snapshot || !position) {
            return
        }
        const previousStep = retreatStep(snapshot, currentEffectiveSetsByKey(), { position, dropPosition })
        setPosition(previousStep.position)
        setDropPosition(previousStep.dropPosition)
    }

    // O push de fim de descanso acompanha o timer: começar agenda, "+15 s"
    // remarca, e pular, fechar, finalizar, pausar ou trocar de treino (todos
    // zeram o timer ou pausam) cancelam. Quando o descanso começa, a posição
    // já é a da próxima série, que dá o nome do exercício no aviso.
    useEffect(() => {
        if (isLoading || isShowingDeletedDay) {
            return
        }
        const nextExercise = snapshot && position ? snapshot.exercicios[position.exerciseIndex] : undefined
        const nextExerciseName = nextExercise?.nome ?? null
        const nextPlan = planRestPush(restTimer, isPaused, nextExerciseName)
        const action = decideRestPushAction(lastRestPushPlanRef.current, nextPlan, Date.now())
        lastRestPushPlanRef.current = nextPlan
        if (action.kind === 'schedule') {
            scheduleRestPush(action.plan)
        } else if (action.kind === 'cancel') {
            cancelRestPush()
        }
    }, [isLoading, isShowingDeletedDay, restTimer, isPaused, snapshot, position])

    // O passo atual fica guardado a cada mudança, para sair da aba (ou fechar
    // o app) e voltar na mesma tela. Com o treino concluído não há passo, e o
    // registro da data é apagado; trocar de treino grava o passo do novo.
    useEffect(() => {
        if (isLoading || isShowingDeletedDay || !snapshot || workoutChoices) {
            return
        }
        if (!position) {
            clearWorkoutStep(sessionDate)
            return
        }
        saveWorkoutStep(sessionDate, buildSavedWorkoutStep(snapshot, { position, dropPosition }))
    }, [isLoading, isShowingDeletedDay, snapshot, workoutChoices, position, dropPosition, sessionDate])

    // Treino terminado antes de a sessão ter sido criada no servidor (o dia
    // inteiro foi feito sem sinal): o painel de finalização depende do id real
    // da sessão, então observa a fila até o envio confirmar e revelar esse id.
    useEffect(() => {
        if (!snapshot || position || session || isShowingDeletedDay) {
            return
        }

        let isCancelled = false

        async function refreshSessionAfterSync() {
            try {
                const existing = await fetchSessionUnlessDeleted()
                if (!isCancelled && existing) {
                    setSession(existing.session)
                }
            } catch {
                // mantém o estado otimista de treino concluído; a próxima
                // mudança na fila de envio tenta buscar de novo
            }
        }

        void refreshSessionAfterSync()
        return () => {
            isCancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [snapshot, position, session, sessionDate, isShowingDeletedDay, outbox.pendingCount])

    const hasExtraExercise = snapshot?.exercicios.some((exercicio) => exercicio.extra === true) ?? false
    const hasRecordedWorkout =
        !isLoading &&
        !isShowingDeletedDay &&
        (session !== null ||
            startedAt !== null ||
            finishedAt !== null ||
            setsByKey.size > 0 ||
            hasExtraExercise ||
            outbox.getOperationsForDate(sessionDate).some((operation) => operation.kind !== 'delete_session'))
    useEffect(() => {
        onRecordedWorkoutChange(hasRecordedWorkout)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasRecordedWorkout])

    const lockNotice = recordingLockNotice(recordingLock)
    const lockNoticeBanner = lockNotice ? (
        <p className="workout-lock-notice" role="status">
            {isShowingDeletedDay ? (
                <Trash2 size={BUTTON_ICON_SIZE} aria-hidden="true" />
            ) : (
                <CalendarClock size={BUTTON_ICON_SIZE} aria-hidden="true" />
            )}
            <span>{lockNotice}</span>
        </p>
    ) : null
    // Trocar o treino só no aparelho não cria sessão; com uma já gravada, a
    // troca reescreve o servidor e fica de fora enquanto houver trava.
    const canSwitchWorkout = canRecord || (recordingLock === 'futuro' && session === null)

    if (isLoading) {
        return <p className="text-muted">Carregando treino...</p>
    }

    if (loadErrorMessage) {
        return (
            <div className="error-list">
                Falha ao carregar treino: {loadErrorMessage}
                <button
                    type="button"
                    className="secondary-button error-list__retry"
                    onClick={() => setReloadToken((token) => token + 1)}
                >
                    Tentar de novo
                </button>
            </div>
        )
    }

    if (workoutChoices) {
        return (
            <div>
                {lockNoticeBanner}
                <h2 className="page-title workout-choice__title">Escolha o treino para este dia</h2>
                {switchWorkoutErrorMessage && <div className="error-list">{switchWorkoutErrorMessage}</div>}
                <div className="menu-list">
                    {workoutChoices.map((workout) => (
                        <button
                            key={workout.id}
                            type="button"
                            className="menu-list__item workout-choice__item"
                            disabled={isSwitchingWorkout || isShowingDeletedDay}
                            onClick={() => handleChooseWorkout(workout)}
                        >
                            <span className="menu-list__text workout-choice__name">{workout.nome}</span>
                            <ChevronRight className="menu-list__chevron" size={BUTTON_ICON_SIZE} aria-hidden="true" />
                        </button>
                    ))}
                </div>
            </div>
        )
    }

    if (!snapshot) {
        return <p className="text-muted">Nenhum treino disponível no plano ativo.</p>
    }

    const pendingOperationsForDate = outbox.getOperationsForDate(sessionDate)
    const effectiveSetsByKey = overlayPendingSets(setsByKey, pendingOperationsForDate, sessionDate)
    const effectiveDropsByKey = overlayPendingDrops(dropsBySetKey, pendingOperationsForDate, sessionDate)

    const effectiveFinishedAt = session?.finished_at ?? finishedAt

    if (session?.finished_at || !position) {
        return (
            <div>
                {lockNoticeBanner}
                <WorkoutSnapshotHeader
                    nome={snapshot.nome}
                    canSwitch={canSwitchWorkout}
                    onRequestSwitchWorkout={handleRequestSwitchWorkout}
                />
                {startedAt && effectiveFinishedAt && (
                    <SessionClock
                        startedAt={startedAt}
                        finishedAt={effectiveFinishedAt}
                        pauseState={pauseState}
                        canCancelStart={false}
                        onStart={handleStartWorkout}
                        onPause={handlePauseWorkout}
                        onResume={handleResumeWorkout}
                        onCancelStart={handleCancelStart}
                    />
                )}
                {session ? (
                    <WorkoutFinishPanel
                        session={withLocalSessionTimes(session, startedAt, effectiveFinishedAt, pauseState)}
                        sessionDate={sessionDate}
                        sets={Array.from(effectiveSetsByKey.values())}
                        dropsBySetKey={effectiveDropsByKey}
                        onSessionUpdated={setSession}
                    />
                ) : (
                    <p className="save-status">Treino concluído no aparelho, sincronizando com o servidor...</p>
                )}
            </div>
        )
    }

    const currentExercicio = snapshot.exercicios[position.exerciseIndex]
    const currentInterval = isIntervalExercise(currentExercicio) ? currentExercicio.intervalado : null
    const currentSet = currentExercicio.series[position.setIndexInExercise]
    const currentSetKey = setKey(currentExercicio.exercise_key, currentSet.set_index)
    const currentSetRow = effectiveSetsByKey.get(currentSetKey)
    // Quedas só existem depois da série concluída; se ela deixou de estar
    // (pulo desfeito em outra aba, por exemplo), o passo volta para a série.
    const isOnDropStep = dropPosition !== null && setStatusOf(currentSetRow) === 'completed'
    const currentStep: WizardStep = { position, dropPosition: isOnDropStep ? dropPosition : null }
    const isFinalUnresolvedSet = isOnlyUnresolvedSet(snapshot, effectiveSetsByKey, position)
    const segmentStatuses = snapshot.exercicios.flatMap((exercicio) =>
        exercicio.series.map((serie) =>
            setStatusOf(effectiveSetsByKey.get(setKey(exercicio.exercise_key, serie.set_index))),
        ),
    )

    return (
        <div>
            {lockNoticeBanner}
            <WorkoutSnapshotHeader
                nome={snapshot.nome}
                canSwitch={canSwitchWorkout}
                onRequestSwitchWorkout={handleRequestSwitchWorkout}
            />
            {/* Um fieldset desativado desliga de uma vez todo botão e campo de
                dentro, inclusive os dos cronômetros e do intervalado. */}
            <fieldset className="workout-lock" disabled={!canRecord}>
                <SessionClock
                    startedAt={startedAt}
                    finishedAt={null}
                    pauseState={pauseState}
                    canCancelStart={canCancelStart(effectiveSetsByKey.values())}
                    onStart={handleStartWorkout}
                    onPause={handlePauseWorkout}
                    onResume={handleResumeWorkout}
                    onCancelStart={handleCancelStart}
                />
            </fieldset>
            <ExercisePicker
                progress={summarizeExerciseProgress(snapshot, effectiveSetsByKey)}
                currentExerciseIndex={position.exerciseIndex}
                isOpen={isExercisePickerOpen}
                onToggle={() => {
                    setIsExercisePickerOpen((isOpen) => !isOpen)
                    setIsAddingExercise(false)
                }}
                onSelect={handleSelectExercise}
                canAddExercise={canRecord}
                onRequestAddExercise={() => setIsAddingExercise(true)}
                addExercisePanel={
                    isAddingExercise && canRecord ? (
                        <AddExtraExercisePanel
                            plan={plan}
                            planWeek={planWeek}
                            sessionDate={sessionDate}
                            todaySnapshot={snapshot}
                            onAdd={handleAddExtraExercise}
                            onCancel={() => setIsAddingExercise(false)}
                        />
                    ) : null
                }
            />
            {restTimer && (
                <RestTimerBar
                    timer={restTimer}
                    onExtend={() => updateRestTimer(extendRestTimer(restTimer, REST_EXTENSION_SECONDS))}
                    onDismiss={() => updateRestTimer(null)}
                />
            )}
            <fieldset className="workout-lock" disabled={!canRecord}>
                <section className="card set-card">
                    <div className="set-card__eyebrow">
                        <span>
                            Exercício {position.exerciseIndex + 1} de {snapshot.exercicios.length}
                        </span>
                        <span className={isOnDropStep ? 'set-card__set-count set-card__set-count--drop' : 'set-card__set-count'}>
                            {setCountLabel(currentExercicio, position, isOnDropStep ? currentStep.dropPosition : null)}
                        </span>
                    </div>
                    <h3 className="set-card__exercise-name">{currentExercicio.nome}</h3>
                    <ExerciseDetails exercicio={currentExercicio} />
                    <div className="progress-track">
                        {segmentStatuses.map((status, segmentIndex) => (
                            <span key={segmentIndex} className={PROGRESS_SEGMENT_CLASS_BY_STATUS[status]} />
                        ))}
                    </div>
                    {currentInterval ? (
                        <IntervalStep
                            key={currentExercicio.exercise_key}
                            sessionDate={sessionDate}
                            planId={planId}
                            snapshot={snapshot}
                            exercicio={currentExercicio}
                            interval={currentInterval}
                            setsByKey={effectiveSetsByKey}
                            confirmLabel={
                                isOnlyUnresolvedExercise(snapshot, effectiveSetsByKey, position.exerciseIndex)
                                    ? 'Confirmar e finalizar treino'
                                    : 'Confirmar rodadas'
                            }
                            onConfirmed={handleIntervalConfirmed}
                            onSkipExercise={handleSkipIntervalExercise}
                        />
                    ) : isOnDropStep && currentSetRow && currentStep.dropPosition !== null ? (
                        <DropSetStepRow
                            key={`${currentSetKey}:queda:${currentStep.dropPosition}`}
                            sessionDate={sessionDate}
                            planId={planId}
                            snapshot={snapshot}
                            exercicio={currentExercicio}
                            serie={currentSet}
                            dropPosition={currentStep.dropPosition}
                            parentSet={currentSetRow}
                            drops={effectiveDropsByKey.get(currentSetKey) ?? []}
                            confirmLabel={dropConfirmLabel(
                                currentStep.dropPosition === currentSet.quedas.length - 1,
                                findNextUnresolvedPosition(snapshot, effectiveSetsByKey, position) === null,
                            )}
                            onConfirmed={handleDropConfirmed}
                            onSkipRemainingDrops={handleSkipRemainingDrops}
                            onLocalDropsSave={(drops) => handleLocalDropsSaved(currentSetKey, drops)}
                        />
                    ) : (
                        <ExerciseSetRow
                            key={currentSetKey}
                            sessionDate={sessionDate}
                            planId={planId}
                            snapshot={snapshot}
                            exercicio={currentExercicio}
                            serie={currentSet}
                            existingSet={currentSetRow}
                            confirmLabel={
                                isFinalUnresolvedSet && currentSet.quedas.length === 0
                                    ? 'Confirmar e finalizar treino'
                                    : 'Confirmar'
                            }
                            onConfirmed={handleSetConfirmed}
                            onSkipped={handleSetSkipped}
                            onSkipExercise={handleSkipExercise}
                            onLocalSave={handleLocalSetSaved}
                        />
                    )}
                </section>
            </fieldset>
            {!isFirstStep(currentStep) && (
                <button type="button" className="ghost-button" onClick={handleGoBack}>
                    <ChevronLeft size={BUTTON_ICON_SIZE} aria-hidden="true" />
                    Voltar
                </button>
            )}
        </div>
    )
}

// O painel de finalização mede a duração pela sessão; enquanto início e fim
// ainda estão só no aparelho, eles entram por cima do que veio do servidor.
// A pausa da tela já junta o servidor e a fila, então vale sempre ela.
function withLocalSessionTimes(
    session: WorkoutSessionRow,
    startedAt: string | null,
    finishedAt: string | null,
    pauseState: SessionPauseState,
): WorkoutSessionRow {
    const sessionWithTimes: WorkoutSessionRow = {
        ...session,
        started_at: session.started_at ?? startedAt,
        paused_at: pauseState.pausedAt,
        paused_seconds: pauseState.pausedSeconds,
        finished_at: session.finished_at ?? finishedAt,
    }

    return sessionWithTimes
}

function setCountLabel(
    exercicio: WorkoutSnapshotExercise,
    position: StepPosition,
    dropPosition: number | null,
): string {
    if (isIntervalExercise(exercicio)) {
        return `Intervalado · ${exercicio.series.length} rodadas`
    }
    if (dropPosition !== null) {
        const dropCount = exercicio.series[position.setIndexInExercise].quedas.length
        return `Série ${position.setIndexInExercise + 1} · Queda ${dropPosition + 1} de ${dropCount}`
    }

    return `Série ${position.setIndexInExercise + 1} de ${exercicio.series.length}`
}

function dropConfirmLabel(isLastDrop: boolean, isWorkoutOtherwiseDone: boolean): string {
    if (!isLastDrop) {
        return 'Confirmar queda'
    }

    return isWorkoutOtherwiseDone ? 'Confirmar e finalizar treino' : 'Confirmar'
}

// Etiquetas e observações do plano ficam no card, acima dos campos, e valem
// para a série e para as quedas do mesmo jeito.
function ExerciseDetails({ exercicio }: { exercicio: WorkoutSnapshotExercise }) {
    const tags = exercicio.intervalado
        ? [exercicio.intervalado.modalidade]
        : exerciseTags(exercicio.equipamento, exercicio.por_lado)
    if (tags.length === 0 && !exercicio.observacoes) {
        return null
    }

    return (
        <div className="set-card__details">
            {tags.length > 0 && (
                <div className="set-card__tags">
                    {tags.map((tag) => (
                        <span key={tag} className="set-card__tag">
                            {tag}
                        </span>
                    ))}
                </div>
            )}
            {exercicio.observacoes && <p className="set-card__observations">{exercicio.observacoes}</p>}
        </div>
    )
}

const PROGRESS_SEGMENT_CLASS_BY_STATUS = {
    completed: 'progress-track__segment progress-track__segment--done',
    skipped: 'progress-track__segment progress-track__segment--skipped',
    pending: 'progress-track__segment',
} as const

type ExercisePickerProps = {
    progress: ExerciseProgress[]
    currentExerciseIndex: number
    isOpen: boolean
    onToggle: () => void
    onSelect: (exerciseIndex: number) => void
    canAddExercise: boolean
    onRequestAddExercise: () => void
    // Com o painel aberto, ele ocupa o lugar do botão de adicionar no fim da
    // lista.
    addExercisePanel: ReactNode
}

function ExercisePicker({
    progress,
    currentExerciseIndex,
    isOpen,
    onToggle,
    onSelect,
    canAddExercise,
    onRequestAddExercise,
    addExercisePanel,
}: ExercisePickerProps) {
    return (
        <div className="exercise-picker">
            <button type="button" className="exercise-picker__toggle" aria-expanded={isOpen} onClick={onToggle}>
                <span>
                    Exercícios{' '}
                    <span className="exercise-picker__count">
                        {currentExerciseIndex + 1} de {progress.length}
                    </span>
                </span>
                {isOpen ? (
                    <ChevronUp size={BUTTON_ICON_SIZE} aria-hidden="true" />
                ) : (
                    <ChevronDown size={BUTTON_ICON_SIZE} aria-hidden="true" />
                )}
            </button>
            {isOpen && (
                <div className="exercise-picker__list">
                    {progress.map((exercise) => (
                        <button
                            key={exercise.exerciseIndex}
                            type="button"
                            className={exercisePickerItemClass(exercise, currentExerciseIndex)}
                            aria-current={exercise.exerciseIndex === currentExerciseIndex ? 'step' : undefined}
                            onClick={() => onSelect(exercise.exerciseIndex)}
                        >
                            <ExerciseStatusMarker exercise={exercise} />
                            <span className="exercise-picker__name">
                                {exercise.nome}
                                {exercise.isExtra && <span className="exercise-picker__extra-tag">extra</span>}
                            </span>
                            <span className="exercise-picker__status">{formatExerciseStatus(exercise)}</span>
                        </button>
                    ))}
                    {addExercisePanel ? (
                        <div className="exercise-picker__add-panel">{addExercisePanel}</div>
                    ) : (
                        <button
                            type="button"
                            className="exercise-picker__add"
                            disabled={!canAddExercise}
                            onClick={onRequestAddExercise}
                        >
                            <Plus size={BUTTON_ICON_SIZE} aria-hidden="true" />
                            Adicionar exercício
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

function exercisePickerItemClass(exercise: ExerciseProgress, currentExerciseIndex: number): string {
    const classNames = ['exercise-picker__item']
    if (exercise.exerciseIndex === currentExerciseIndex) {
        classNames.push('exercise-picker__item--current')
    }
    if (exercise.skipped === exercise.total) {
        classNames.push('exercise-picker__item--skipped')
    } else if (exercise.completed + exercise.skipped === exercise.total) {
        classNames.push('exercise-picker__item--done')
    }

    return classNames.join(' ')
}

function ExerciseStatusMarker({ exercise }: { exercise: ExerciseProgress }) {
    if (exercise.skipped === exercise.total) {
        return (
            <span className="exercise-picker__marker exercise-picker__marker--skipped">
                <Minus size={STATUS_ICON_SIZE} strokeWidth={STATUS_ICON_STROKE} aria-hidden="true" />
            </span>
        )
    }
    if (exercise.completed + exercise.skipped === exercise.total) {
        return (
            <span className="exercise-picker__marker exercise-picker__marker--done">
                <Check size={STATUS_ICON_SIZE} strokeWidth={STATUS_ICON_STROKE} aria-hidden="true" />
            </span>
        )
    }
    const markerNumber = exercise.exerciseIndex + 1

    return <span className="exercise-picker__marker">{markerNumber}</span>
}

function formatExerciseStatus(exercise: ExerciseProgress): string {
    if (exercise.skipped === exercise.total) {
        return 'pulado'
    }
    if (exercise.completed === exercise.total) {
        return 'feito'
    }
    const skippedSuffix = exercise.skipped > 0 ? ` · ${exercise.skipped} pulada(s)` : ''

    return `${exercise.completed}/${exercise.total}${skippedSuffix}`
}

function WorkoutSnapshotHeader({
    nome,
    canSwitch,
    onRequestSwitchWorkout,
}: {
    nome: string
    canSwitch: boolean
    onRequestSwitchWorkout: () => void
}) {
    return (
        <div className="page-header">
            <h2 className="page-title workout-header__name">{nome}</h2>
            <button
                type="button"
                className="secondary-button workout-header__switch"
                disabled={!canSwitch}
                onClick={onRequestSwitchWorkout}
            >
                <ArrowLeftRight size={BUTTON_ICON_SIZE} aria-hidden="true" />
                Trocar treino
            </button>
        </div>
    )
}
