export type AppTab = 'treino' | 'alimentacao' | 'resultados'

const TABS: { key: AppTab; label: string }[] = [
    { key: 'treino', label: 'Treino' },
    { key: 'alimentacao', label: 'Alimentação' },
    { key: 'resultados', label: 'Resultados' },
]

type BottomNavProps = {
    activeTab: AppTab
    onSelectTab: (tab: AppTab) => void
}

export function BottomNav({ activeTab, onSelectTab }: BottomNavProps) {
    return (
        <nav className="bottom-nav">
            {TABS.map((tab) => (
                <button
                    key={tab.key}
                    type="button"
                    className={tabClassName(activeTab === tab.key)}
                    onClick={() => onSelectTab(tab.key)}
                >
                    {tab.label}
                </button>
            ))}
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
