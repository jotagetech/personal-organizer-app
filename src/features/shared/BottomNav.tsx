import { ChartColumn, Check, Dumbbell, ListChecks, Menu, UtensilsCrossed, type LucideIcon } from 'lucide-react'

import { useDayStatus } from '@/contexts/DayStatusContext'
import type { TabIndicatorKind } from '@/features/shared/tabIndicators'

export type AppTab = 'rotina' | 'treino' | 'alimentacao' | 'resultados' | 'menu'

const TABS: { key: AppTab; label: string; icon: LucideIcon }[] = [
    { key: 'rotina', label: 'Rotina', icon: ListChecks },
    { key: 'treino', label: 'Treino', icon: Dumbbell },
    { key: 'alimentacao', label: 'Comida', icon: UtensilsCrossed },
    { key: 'resultados', label: 'Resultados', icon: ChartColumn },
    { key: 'menu', label: 'Menu', icon: Menu },
]

const TAB_ICON_SIZE = 22
const ACTIVE_TAB_ICON_STROKE = 2.4
const INACTIVE_TAB_ICON_STROKE = 2
const INDICATOR_CHECK_SIZE = 9
const INDICATOR_CHECK_STROKE = 4

type BottomNavProps = {
    activeTab: AppTab
    onSelectTab: (tab: AppTab) => void
}

export function BottomNav({ activeTab, onSelectTab }: BottomNavProps) {
    const { indicators } = useDayStatus()

    return (
        <nav className="bottom-nav">
            {TABS.map((tab) => {
                const indicatorKind = indicators[tab.key]
                const isActive = activeTab === tab.key
                const TabIcon = tab.icon
                return (
                    <button
                        key={tab.key}
                        type="button"
                        className={tabClassName(isActive)}
                        aria-label={tabAriaLabel(tab.label, indicatorKind)}
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => onSelectTab(tab.key)}
                    >
                        <span className="bottom-nav__icon">
                            <TabIcon
                                size={TAB_ICON_SIZE}
                                strokeWidth={isActive ? ACTIVE_TAB_ICON_STROKE : INACTIVE_TAB_ICON_STROKE}
                                aria-hidden="true"
                            />
                            <TabIndicatorDot kind={indicatorKind} />
                        </span>
                        <span className="bottom-nav__label">{tab.label}</span>
                    </button>
                )
            })}
        </nav>
    )
}

function tabClassName(isActive: boolean): string {
    const baseClassName = 'bottom-nav__tab'
    if (!isActive) {
        return baseClassName
    }

    return `${baseClassName} bottom-nav__tab--active`
}

function tabAriaLabel(label: string, indicatorKind: TabIndicatorKind): string {
    if (indicatorKind === 'done') {
        return `${label}, com registro no dia selecionado`
    }
    if (indicatorKind === 'pending') {
        return `${label}, com pendência no dia selecionado`
    }

    return label
}

// Concluído leva um check além da cor, pra não depender só de verde contra
// âmbar pra distinguir os dois estados.
function TabIndicatorDot({ kind }: { kind: TabIndicatorKind }) {
    if (kind === 'none') {
        return null
    }

    if (kind === 'done') {
        return (
            <span className="bottom-nav__indicator bottom-nav__indicator--done" aria-hidden="true">
                <Check size={INDICATOR_CHECK_SIZE} strokeWidth={INDICATOR_CHECK_STROKE} />
            </span>
        )
    }

    return <span className="bottom-nav__indicator bottom-nav__indicator--pending" aria-hidden="true" />
}
