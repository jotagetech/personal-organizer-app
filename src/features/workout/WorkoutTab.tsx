import { CalendarPlus, EllipsisVertical, FilePen, FilePlus2, FileUp, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { listCycles } from '@/features/cycle/api'
import { CycleStatusBadge } from '@/features/cycle/CycleStatusBadge'
import { buildPlanWeekText } from '@/features/cycle/cycleStatusText'
import { cycleForDate } from '@/features/cycle/cycleTimeline'
import { StartCycleForm } from '@/features/cycle/StartCycleForm'
import type { WorkoutCycleRow } from '@/features/cycle/types'
import { getActivePlan, type ActivePlan } from '@/features/workout/api'
import type { BuilderOrigin } from '@/features/workout/builder/builderDraft'
import { PlanBuilder } from '@/features/workout/builder/PlanBuilder'
import { ImportWorkoutPlan } from '@/features/workout/ImportWorkoutPlan'
import { resolvePlanWeek } from '@/features/workout/planWeek'
import { resolveRecordingLock } from '@/features/workout/recordableDate'
import {
    commitWorkoutDayDeletion,
    WORKOUT_DAY_DELETION_LABEL,
    workoutDayDeletionId,
} from '@/features/workout/workoutDayDeletion'
import { WorkoutSessionView } from '@/features/workout/WorkoutSessionView'
import { useDayStatus } from '@/contexts/DayStatusContext'
import { useOutbox } from '@/contexts/OutboxContext'
import { useSelectedDate } from '@/contexts/SelectedDateContext'
import { useUndoableActions } from '@/contexts/UndoableActionContext'
import { todayInTimezone } from '@/lib/dateUtils'

type ActivePanel = 'import_plan' | 'start_cycle' | 'plan_builder' | null

const MENU_ICON_SIZE = 22
const MENU_ITEM_ICON_SIZE = 18

export function WorkoutTab() {
    const { selectedDate } = useSelectedDate()
    const { deleteSession } = useOutbox()
    const { refreshDayStatus } = useDayStatus()
    const { scheduleDeletion, isPendingDeletion } = useUndoableActions()
    const [activePlan, setActivePlan] = useState<ActivePlan | null>(null)
    const [cycles, setCycles] = useState<WorkoutCycleRow[]>([])
    const [isLoadingPlan, setIsLoadingPlan] = useState(true)
    const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null)
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [isConfirmingDayDeletion, setIsConfirmingDayDeletion] = useState(false)
    const [activePanel, setActivePanel] = useState<ActivePanel>(null)
    const [builderOrigin, setBuilderOrigin] = useState<BuilderOrigin>('novo')
    const [savedPlanMessage, setSavedPlanMessage] = useState<string | null>(null)
    const [hasRecordedWorkout, setHasRecordedWorkout] = useState(false)
    // Remonta a tela do treino depois de a exclusão ser efetivada, para ela
    // recarregar a data do zero em vez de continuar com o estado antigo.
    const [sessionViewGeneration, setSessionViewGeneration] = useState(0)
    const menuRef = useRef<HTMLDivElement>(null)
    const isWorkoutDayDeletionPending = isPendingDeletion(workoutDayDeletionId(selectedDate))

    function openPlanBuilder(origin: BuilderOrigin) {
        setBuilderOrigin(origin)
        setActivePanel('plan_builder')
        setIsMenuOpen(false)
        setSavedPlanMessage(null)
    }

    function handleDeleteWorkoutDay() {
        const sessionDate = selectedDate
        setIsMenuOpen(false)
        setIsConfirmingDayDeletion(false)
        scheduleDeletion({
            id: workoutDayDeletionId(sessionDate),
            label: WORKOUT_DAY_DELETION_LABEL,
            commit: async () => {
                commitWorkoutDayDeletion(sessionDate, deleteSession)
                setSessionViewGeneration((generation) => generation + 1)
                refreshDayStatus()
            },
        })
    }

    async function reloadCycles() {
        try {
            setCycles(await listCycles())
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : 'Falha ao carregar o ciclo'
            setLoadErrorMessage(message)
        }
    }

    async function reloadActivePlan() {
        setIsLoadingPlan(true)
        setLoadErrorMessage(null)
        try {
            const [nextActivePlan, nextCycles] = await Promise.all([getActivePlan(), listCycles()])
            setActivePlan(nextActivePlan)
            setCycles(nextCycles)
            setActivePanel(null)
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : 'Falha ao carregar o plano'
            setLoadErrorMessage(message)
        } finally {
            setIsLoadingPlan(false)
        }
    }

    useEffect(() => {
        void reloadActivePlan()
    }, [])

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false)
                setIsConfirmingDayDeletion(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    if (isLoadingPlan) {
        return <p className="text-muted">Carregando plano...</p>
    }

    if (loadErrorMessage) {
        return (
            <div className="error-list">
                Falha ao carregar: {loadErrorMessage}
                <button
                    type="button"
                    className="secondary-button error-list__retry"
                    onClick={reloadActivePlan}
                >
                    Tentar de novo
                </button>
            </div>
        )
    }

    if (activePanel === 'plan_builder') {
        return (
            <PlanBuilder
                origin={builderOrigin}
                activePlan={activePlan?.plan ?? null}
                onClose={() => setActivePanel(null)}
                onSaved={(message) => {
                    setSavedPlanMessage(message)
                    void reloadActivePlan()
                }}
            />
        )
    }

    if (!activePlan) {
        return (
            <>
                <div className="card">
                    <h2 className="section-title">Montar plano no app</h2>
                    <p className="text-small text-secondary import-plan__hint">
                        Monte os treinos, exercícios e séries direto na tela, sem escrever JSON.
                    </p>
                    <button type="button" className="primary-button full-width" onClick={() => openPlanBuilder('novo')}>
                        <FilePlus2 size={MENU_ITEM_ICON_SIZE} aria-hidden="true" />
                        Criar plano
                    </button>
                </div>
                <ImportWorkoutPlan activePlanName={null} onImported={reloadActivePlan} />
            </>
        )
    }

    if (activePanel === 'import_plan') {
        return (
            <ImportWorkoutPlan
                activePlanName={activePlan.plan.nome}
                onImported={reloadActivePlan}
                onCancel={() => setActivePanel(null)}
            />
        )
    }

    // A semana também entra na chave da sessão: iniciar um ciclo novo refaz o
    // treino ainda não gravado com as séries da semana certa.
    const cycleOnDate = cycleForDate(cycles, selectedDate)
    const planWeek = resolvePlanWeek(activePlan.plan, cycleOnDate?.cycle.start_date ?? null, selectedDate)
    const recordingLock = resolveRecordingLock(selectedDate, todayInTimezone(), isWorkoutDayDeletionPending)

    return (
        <div>
            <div className="page-header page-header--compact">
                <div className="cycle-status">
                    <CycleStatusBadge cycles={cycles} referenceDate={selectedDate} />
                    {planWeek && (
                        <span className="cycle-status__week">{buildPlanWeekText(planWeek)}</span>
                    )}
                </div>
                <div className="overflow-menu" ref={menuRef}>
                    <button
                        type="button"
                        className="icon-button"
                        aria-label="Mais ações"
                        onClick={() => {
                            setIsMenuOpen((previous) => !previous)
                            setIsConfirmingDayDeletion(false)
                        }}
                    >
                        <EllipsisVertical size={MENU_ICON_SIZE} aria-hidden="true" />
                    </button>
                    {isMenuOpen && activePanel === null && isConfirmingDayDeletion && (
                        <div className="overflow-menu__panel">
                            <div className="overflow-menu__confirm">
                                <span>Excluir o treino deste dia? Séries, exercícios extras e avaliação são apagados.</span>
                                <div className="form-actions">
                                    <button
                                        type="button"
                                        className="secondary-button"
                                        onClick={() => setIsConfirmingDayDeletion(false)}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        className="primary-button overflow-menu__confirm-danger"
                                        onClick={handleDeleteWorkoutDay}
                                    >
                                        Excluir
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    {isMenuOpen && activePanel === null && !isConfirmingDayDeletion && (
                        <div className="overflow-menu__panel">
                            <button
                                type="button"
                                className="overflow-menu__item"
                                onClick={() => openPlanBuilder('edicao')}
                            >
                                <FilePen size={MENU_ITEM_ICON_SIZE} aria-hidden="true" />
                                Editar plano atual
                            </button>
                            <button
                                type="button"
                                className="overflow-menu__item"
                                onClick={() => openPlanBuilder('novo')}
                            >
                                <FilePlus2 size={MENU_ITEM_ICON_SIZE} aria-hidden="true" />
                                Criar plano
                            </button>
                            <button
                                type="button"
                                className="overflow-menu__item"
                                onClick={() => {
                                    setActivePanel('import_plan')
                                    setIsMenuOpen(false)
                                }}
                            >
                                <FileUp size={MENU_ITEM_ICON_SIZE} aria-hidden="true" />
                                Importar novo plano
                            </button>
                            <button
                                type="button"
                                className="overflow-menu__item"
                                onClick={() => setActivePanel('start_cycle')}
                            >
                                <CalendarPlus size={MENU_ITEM_ICON_SIZE} aria-hidden="true" />
                                Iniciar novo ciclo
                            </button>
                            {hasRecordedWorkout && !isWorkoutDayDeletionPending && (
                                <button
                                    type="button"
                                    className="overflow-menu__item overflow-menu__item--danger"
                                    onClick={() => setIsConfirmingDayDeletion(true)}
                                >
                                    <Trash2 size={MENU_ITEM_ICON_SIZE} aria-hidden="true" />
                                    Excluir treino do dia
                                </button>
                            )}
                        </div>
                    )}
                    {isMenuOpen && activePanel === 'start_cycle' && (
                        <div className="overflow-menu__panel">
                            <div className="overflow-menu__form">
                                <StartCycleForm
                                    onStarted={() => {
                                        void reloadCycles()
                                        setActivePanel(null)
                                        setIsMenuOpen(false)
                                    }}
                                    onCancel={() => setActivePanel(null)}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {savedPlanMessage && <p className="save-status">{savedPlanMessage}</p>}
            <WorkoutSessionView
                key={`${selectedDate}:${planWeek?.semana ?? ''}:${recordingLock ?? ''}:${sessionViewGeneration}`}
                plan={activePlan.plan}
                planId={activePlan.planId}
                sessionDate={selectedDate}
                planWeek={planWeek}
                recordingLock={recordingLock}
                onRecordedWorkoutChange={setHasRecordedWorkout}
            />
        </div>
    )
}
