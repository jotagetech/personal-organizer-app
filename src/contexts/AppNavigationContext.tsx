import { createContext, useContext, useState, type ReactNode } from 'react'

import type { AppTab } from '@/features/shared/BottomNav'

type AppNavigationContextValue = {
    activeTab: AppTab
    goToTab: (nextTab: AppTab) => void
}

const AppNavigationContext = createContext<AppNavigationContextValue | null>(null)

export function AppNavigationProvider({ children }: { children: ReactNode }) {
    const [activeTab, setActiveTab] = useState<AppTab>('rotina')

    const contextValue: AppNavigationContextValue = { activeTab, goToTab: setActiveTab }

    return (
        <AppNavigationContext.Provider value={contextValue}>
            {children}
        </AppNavigationContext.Provider>
    )
}

export function useAppNavigation(): AppNavigationContextValue {
    const contextValue = useContext(AppNavigationContext)
    if (!contextValue) {
        throw new Error('useAppNavigation precisa estar dentro de um AppNavigationProvider')
    }

    return contextValue
}
