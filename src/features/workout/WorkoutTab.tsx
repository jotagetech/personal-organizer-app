import { CalendarPlus, EllipsisVertical, FileUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { getCurrentCycle } from '@/features/cycle/api'
import { CycleStatusBadge } from '@/features/cycle/CycleStatusBadge'
import { StartCycleForm } from '@/features/cycle/StartCycleForm'
import type { WorkoutCycleRow } from '@/features/cycle/types'
import { getActivePlan, type ActivePlan } from '@/features/workout/api'
import { ImportWorkoutPlan } from '@/features/workout/ImportWorkoutPlan'
import { formatPlanWeekLabel, resolvePlanWeek } from '@/features/workout/planWeek'
import { WorkoutSessionView } from '@/features/workout/WorkoutSessionView'
import { useSelectedDate } from '@/contexts/SelectedDateContext'

type ActivePanel = 'import_plan' | 'start_cycle' | null

const MENU_ICON_SIZE = 22
const MENU_ITEM_ICON_SIZE = 18

export function WorkoutTab() {
    const { selectedDate } = useSelectedDate()
    const [activePlan, setActivePlan] = useState<ActivePlan | null>(null)
    const [cycle, setCycle] = useState<WorkoutCycleRow | null>(null)
    const [isLoadingPlan, setIsLoadingPlan] = useState(true)
    const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null)
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [activePanel, setActivePanel] = useState<ActivePanel>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    async function reloadActivePlan() {
        setIsLoadingPlan(true)
        setLoadErrorMessage(null)
        try {
            const [nextActivePlan, nextCycle] = await Promise.all([getActivePlan(), getCurrentCycle()])
            setActivePlan(nextActivePlan)
            setCycle(nextCycle)
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

    if (!activePlan) {
        return <ImportWorkoutPlan onImported={reloadActivePlan} />
    }

    if (activePanel === 'import_plan') {
        return <ImportWorkoutPlan onImported={reloadActivePlan} />
    }

    // A semana também entra na chave da sessão: iniciar um ciclo novo refaz o
    // treino ainda não gravado com as séries da semana certa.
    const planWeek = resolvePlanWeek(activePlan.plan, cycle?.start_date ?? null, selectedDate)

    return (
        <div>
            <div className="page-header page-header--compact">
                <div className="cycle-status">
                    <CycleStatusBadge cycle={cycle} referenceDate={selectedDate} />
                    {planWeek && (
                        <span className="cycle-status__week">
                            {formatPlanWeekLabel(planWeek.semana, planWeek.totalSemanas)}
                            {planWeek.descricao && ` · ${planWeek.descricao}`}
                        </span>
                    )}
                </div>
                <div className="overflow-menu" ref={menuRef}>
                    <button
                        type="button"
                        className="icon-button"
                        aria-label="Mais ações"
                        onClick={() => setIsMenuOpen((previous) => !previous)}
                    >
                        <EllipsisVertical size={MENU_ICON_SIZE} aria-hidden="true" />
                    </button>
                    {isMenuOpen && activePanel === null && (
                        <div className="overflow-menu__panel">
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
                        </div>
                    )}
                    {isMenuOpen && activePanel === 'start_cycle' && (
                        <div className="overflow-menu__panel">
                            <div className="overflow-menu__form">
                                <StartCycleForm
                                    onStarted={(newCycle) => {
                                        setCycle(newCycle)
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
            <WorkoutSessionView
                key={`${selectedDate}:${planWeek?.semana ?? ''}`}
                plan={activePlan.plan}
                planId={activePlan.planId}
                sessionDate={selectedDate}
                planWeek={planWeek}
            />
        </div>
    )
}
