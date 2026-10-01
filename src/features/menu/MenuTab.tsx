import { BookOpen, ChevronRight, Download, Dumbbell, Link2, type LucideIcon } from 'lucide-react'
import { useState } from 'react'

import { useDayStatus } from '@/contexts/DayStatusContext'
import { useSelectedDate } from '@/contexts/SelectedDateContext'
import { SignOutSection } from '@/features/account/SignOutSection'
import { BodyWeightLog, SleepLog } from '@/features/bodyMetrics/BodyMetricLogs'
import { UnlinkedExercisesPanel } from '@/features/exerciseCatalog/UnlinkedExercisesPanel'
import { PeriodExportPanel } from '@/features/export/PeriodExportPanel'
import { FoodItemsCatalog } from '@/features/food/FoodItemsCatalog'
import { PushNotificationsSection } from '@/features/notifications/PushNotificationsSection'
import { formatDateLabel } from '@/features/shared/DateHeader'
import { StoredPlansPanel } from '@/features/workout/StoredPlansPanel'
import { todayInTimezone } from '@/lib/dateUtils'

type MenuToolKey = 'workout_plans' | 'exercise_history_names' | 'food_catalog' | 'period_export'
type MenuPanel = 'home' | MenuToolKey

type MenuTool = {
    key: MenuToolKey
    label: string
    description: string
    icon: LucideIcon
}

const TOOL_ICON_SIZE = 20
const CHEVRON_ICON_SIZE = 20

// Cada ferramenta ganha um painel próprio que ocupa a aba inteira; a lista
// da tela inicial é gerada daqui, então uma ferramenta nova só precisa de uma
// entrada nesta lista e de um caso em renderToolPanel.
const MENU_TOOLS: MenuTool[] = [
    {
        key: 'workout_plans',
        label: 'Planos de treino',
        description: 'Voltar para um plano já importado, sem o arquivo',
        icon: Dumbbell,
    },
    {
        key: 'exercise_history_names',
        label: 'Exercícios do histórico',
        description: 'Ligar nomes dos seus treinos aos exercícios do catálogo',
        icon: Link2,
    },
    {
        key: 'food_catalog',
        label: 'Catálogo de alimentos',
        description: 'Editar a nutrição dos alimentos cadastrados e da TACO',
        icon: BookOpen,
    },
    {
        key: 'period_export',
        label: 'Exportar período',
        description: 'Gerar um JSON com os registros de um período',
        icon: Download,
    },
]

export function MenuTab() {
    const [panel, setPanel] = useState<MenuPanel>('home')

    if (panel !== 'home') {
        return renderToolPanel(panel, () => setPanel('home'))
    }

    return <MenuHome onOpenTool={setPanel} />
}

function renderToolPanel(toolKey: MenuToolKey, onClose: () => void) {
    switch (toolKey) {
        case 'workout_plans':
            return <StoredPlansPanel onClose={onClose} />
        case 'exercise_history_names':
            return <UnlinkedExercisesPanel onClose={onClose} />
        case 'food_catalog':
            return <FoodItemsCatalog onClose={onClose} />
        case 'period_export':
            return <PeriodExportPanel onClose={onClose} />
    }
}

function MenuHome({ onOpenTool }: { onOpenTool: (toolKey: MenuToolKey) => void }) {
    const { selectedDate } = useSelectedDate()
    const { refreshDayStatus } = useDayStatus()
    const isViewingToday = selectedDate === todayInTimezone()

    return (
        <div>
            <div className="page-header">
                <h2 className="page-title">Menu</h2>
            </div>
            <section className="menu-section">
                <div className="menu-section__header">
                    <h3 className="section-title">Registros do dia</h3>
                    <p className="menu-section__subtitle">
                        {formatDateLabel(selectedDate)}
                        {isViewingToday ? ' (hoje)' : ''}
                    </p>
                </div>
                <BodyWeightLog entryDate={selectedDate} onChanged={refreshDayStatus} />
                <SleepLog entryDate={selectedDate} onChanged={refreshDayStatus} />
            </section>
            <section className="menu-section">
                <div className="menu-section__header">
                    <h3 className="section-title">Ferramentas</h3>
                </div>
                <div className="menu-list">
                    {MENU_TOOLS.map((tool) => (
                        <button
                            key={tool.key}
                            type="button"
                            className="menu-list__item"
                            onClick={() => onOpenTool(tool.key)}
                        >
                            <span className="menu-list__icon" aria-hidden="true">
                                <tool.icon size={TOOL_ICON_SIZE} />
                            </span>
                            <span className="menu-list__text">
                                <span className="menu-list__label">{tool.label}</span>
                                <span className="menu-list__description">{tool.description}</span>
                            </span>
                            <ChevronRight className="menu-list__chevron" size={CHEVRON_ICON_SIZE} aria-hidden="true" />
                        </button>
                    ))}
                </div>
            </section>
            <PushNotificationsSection />
            <SignOutSection />
        </div>
    )
}
