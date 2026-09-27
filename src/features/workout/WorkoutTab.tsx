import { useEffect, useRef, useState } from 'react'

import { getCurrentCycle } from '@/features/cycle/api'
import { CycleStatusBadge } from '@/features/cycle/CycleStatusBadge'
import { StartCycleForm } from '@/features/cycle/StartCycleForm'
import type { WorkoutCycleRow } from '@/features/cycle/types'
import { getActivePlan, type ActivePlan } from '@/features/workout/api'
import { ImportWorkoutPlan } from '@/features/workout/ImportWorkoutPlan'
import { WorkoutSessionView } from '@/features/workout/WorkoutSessionView'
import { useSelectedDate } from '@/contexts/SelectedDateContext'

type ActivePanel = 'import_plan' | 'start_cycle' | null

export function WorkoutTab() {
    const { selectedDate } = useSelectedDate()
    const [activePlan, setActivePlan] = useState<ActivePlan | null>(null)
    const [cycle, setCycle] = useState<WorkoutCycleRow | null>(null)
    const [isLoadingPlan, setIsLoadingPlan] = useState(true)
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [activePanel, setActivePanel] = useState<ActivePanel>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    async function reloadActivePlan() {
        setIsLoadingPlan(true)
        const [nextActivePlan, nextCycle] = await Promise.all([getActivePlan(), getCurrentCycle()])
        setActivePlan(nextActivePlan)
        setCycle(nextCycle)
        setIsLoadingPlan(false)
        setActivePanel(null)
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
        return <p>Carregando plano...</p>
    }

    if (!activePlan) {
        return <ImportWorkoutPlan onImported={reloadActivePlan} />
    }

    if (activePanel === 'import_plan') {
        return <ImportWorkoutPlan onImported={reloadActivePlan} />
    }

    return (
        <div>
            <div className="workout-toolbar">
                <CycleStatusBadge cycle={cycle} referenceDate={selectedDate} />
                <div className="overflow-menu" ref={menuRef}>
                    <button
                        type="button"
                        className="icon-button"
                        aria-label="Mais ações"
                        onClick={() => setIsMenuOpen((previous) => !previous)}
                    >
                        ⋮
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
                                Importar novo plano
                            </button>
                            <button
                                type="button"
                                className="overflow-menu__item"
                                onClick={() => setActivePanel('start_cycle')}
                            >
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
            <WorkoutSessionView plan={activePlan.plan} planId={activePlan.planId} sessionDate={selectedDate} />
        </div>
    )
}
