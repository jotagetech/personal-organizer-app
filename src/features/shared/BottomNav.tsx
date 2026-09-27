export type AppTab = 'treino' | 'alimentacao'

type BottomNavProps = {
    activeTab: AppTab
    onSelectTab: (tab: AppTab) => void
}

export function BottomNav({ activeTab, onSelectTab }: BottomNavProps) {
    return (
        <nav className="bottom-nav">
            <button
                type="button"
                className={tabClassName(activeTab === 'treino')}
                onClick={() => onSelectTab('treino')}
            >
                Treino
            </button>
            <button
                type="button"
                className={tabClassName(activeTab === 'alimentacao')}
                onClick={() => onSelectTab('alimentacao')}
            >
                Alimentação
            </button>
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
