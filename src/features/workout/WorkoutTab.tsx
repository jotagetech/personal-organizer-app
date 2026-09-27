import { useEffect, useState } from 'react'

import { getActivePlan, type ActivePlan } from '@/features/workout/api'
import { ImportWorkoutPlan } from '@/features/workout/ImportWorkoutPlan'
import { WorkoutSessionView } from '@/features/workout/WorkoutSessionView'
import { useSelectedDate } from '@/contexts/SelectedDateContext'

export function WorkoutTab() {
    const { selectedDate } = useSelectedDate()
    const [activePlan, setActivePlan] = useState<ActivePlan | null>(null)
    const [isLoadingPlan, setIsLoadingPlan] = useState(true)
    const [isImportPanelOpen, setIsImportPanelOpen] = useState(false)

    async function reloadActivePlan() {
        setIsLoadingPlan(true)
        const nextActivePlan = await getActivePlan()
        setActivePlan(nextActivePlan)
        setIsLoadingPlan(false)
        setIsImportPanelOpen(false)
    }

    useEffect(() => {
        void reloadActivePlan()
    }, [])

    if (isLoadingPlan) {
        return <p>Carregando plano...</p>
    }

    if (!activePlan) {
        return <ImportWorkoutPlan onImported={reloadActivePlan} />
    }

    if (isImportPanelOpen) {
        return <ImportWorkoutPlan onImported={reloadActivePlan} />
    }

    return (
        <div>
            <WorkoutSessionView plan={activePlan.plan} planId={activePlan.planId} sessionDate={selectedDate} />
            <button
                type="button"
                className="secondary-button"
                style={{ marginTop: 8 }}
                onClick={() => setIsImportPanelOpen(true)}
            >
                Importar outro plano
            </button>
        </div>
    )
}
