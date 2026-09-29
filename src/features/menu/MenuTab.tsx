import { useState } from 'react'

import { useDayStatus } from '@/contexts/DayStatusContext'
import { useSelectedDate } from '@/contexts/SelectedDateContext'
import { BodyWeightLog, SleepLog } from '@/features/bodyMetrics/BodyMetricLogs'
import { FoodItemsCatalog } from '@/features/food/FoodItemsCatalog'
import { formatDateLabel } from '@/features/shared/DateHeader'
import { todayInTimezone } from '@/lib/dateUtils'

type MenuToolKey = 'food_catalog'
type MenuPanel = 'home' | MenuToolKey

type MenuTool = {
    key: MenuToolKey
    label: string
    description: string
}

// Cada ferramenta ganha um painel próprio que ocupa a aba inteira; a lista
// da tela inicial é gerada daqui, então uma ferramenta nova só precisa de uma
// entrada nesta lista e de um caso em renderToolPanel.
const MENU_TOOLS: MenuTool[] = [
    {
        key: 'food_catalog',
        label: 'Catálogo de alimentos',
        description: 'Editar a nutrição dos alimentos cadastrados e da TACO',
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
        case 'food_catalog':
            return <FoodItemsCatalog onClose={onClose} />
    }
}

function MenuHome({ onOpenTool }: { onOpenTool: (toolKey: MenuToolKey) => void }) {
    const { selectedDate } = useSelectedDate()
    const { refreshDayStatus } = useDayStatus()
    const isViewingToday = selectedDate === todayInTimezone()

    return (
        <div>
            <h2 className="menu-section__title">Registros do dia</h2>
            <p className="menu-section__subtitle">
                {formatDateLabel(selectedDate)}
                {isViewingToday ? ' (hoje)' : ''}
            </p>
            <BodyWeightLog entryDate={selectedDate} onChanged={refreshDayStatus} />
            <SleepLog entryDate={selectedDate} onChanged={refreshDayStatus} />
            <h2 className="menu-section__title">Ferramentas</h2>
            <div className="menu-list">
                {MENU_TOOLS.map((tool) => (
                    <button
                        key={tool.key}
                        type="button"
                        className="menu-list__item"
                        onClick={() => onOpenTool(tool.key)}
                    >
                        <span className="menu-list__label">{tool.label}</span>
                        <span className="menu-list__description">{tool.description}</span>
                    </button>
                ))}
            </div>
        </div>
    )
}
