import { useDayStatus } from '@/contexts/DayStatusContext'
import type { TabIndicatorKind } from '@/features/shared/tabIndicators'

export type AppTab = 'rotina' | 'treino' | 'alimentacao' | 'resultados' | 'menu'

const TABS: { key: AppTab; label: string }[] = [
    { key: 'rotina', label: 'Rotina' },
    { key: 'treino', label: 'Treino' },
    { key: 'alimentacao', label: 'Comida' },
    { key: 'resultados', label: 'Resultados' },
    { key: 'menu', label: 'Menu' },
]

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
                return (
                    <button
                        key={tab.key}
                        type="button"
                        className={tabClassName(activeTab === tab.key)}
                        aria-label={tabAriaLabel(tab.label, indicatorKind)}
                        onClick={() => onSelectTab(tab.key)}
                    >
                        {tab.label}
                        <TabIndicatorDot kind={indicatorKind} />
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

function TabIndicatorDot({ kind }: { kind: TabIndicatorKind }) {
    if (kind === 'none') {
        return null
    }

    const modifierClassName =
        kind === 'done' ? 'bottom-nav__indicator--done' : 'bottom-nav__indicator--pending'
    const symbol = kind === 'done' ? '✓' : '●'

    return (
        <span className={`bottom-nav__indicator ${modifierClassName}`} aria-hidden="true">
            {symbol}
        </span>
    )
}
