import { useState } from 'react'

import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { SelectedDateProvider } from '@/contexts/SelectedDateContext'
import { LoginPage } from '@/features/auth/LoginPage'
import { BottomNav, type AppTab } from '@/features/shared/BottomNav'
import { DateHeader } from '@/features/shared/DateHeader'
import { FoodTab } from '@/features/food/FoodTab'
import { WorkoutTab } from '@/features/workout/WorkoutTab'

export function App() {
    return (
        <AuthProvider>
            <AuthGate />
        </AuthProvider>
    )
}

function AuthGate() {
    const { session, isLoadingSession } = useAuth()

    if (isLoadingSession) {
        return <div className="app-content">Carregando...</div>
    }

    if (!session) {
        return <LoginPage />
    }

    return (
        <SelectedDateProvider>
            <AuthenticatedShell />
        </SelectedDateProvider>
    )
}

function AuthenticatedShell() {
    const [activeTab, setActiveTab] = useState<AppTab>('treino')

    return (
        <div className="app-shell">
            <DateHeader />
            <main className="app-content">
                {activeTab === 'treino' ? <WorkoutTab /> : <FoodTab />}
            </main>
            <BottomNav activeTab={activeTab} onSelectTab={setActiveTab} />
        </div>
    )
}
