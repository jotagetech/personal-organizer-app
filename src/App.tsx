import { AppNavigationProvider, useAppNavigation } from '@/contexts/AppNavigationContext'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { DayStatusProvider } from '@/contexts/DayStatusContext'
import { OutboxProvider } from '@/contexts/OutboxContext'
import { SelectedDateProvider } from '@/contexts/SelectedDateContext'
import { UndoableActionProvider } from '@/contexts/UndoableActionContext'
import { LoginPage } from '@/features/auth/LoginPage'
import { BottomNav } from '@/features/shared/BottomNav'
import { DateHeader } from '@/features/shared/DateHeader'
import { UndoBar } from '@/features/shared/UndoBar'
import { FoodTab } from '@/features/food/FoodTab'
import { ResultsTab } from '@/features/results/ResultsTab'
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
        <AppNavigationProvider>
            <SelectedDateProvider>
                <DayStatusProvider>
                    <UndoableActionProvider>
                        <OutboxProvider>
                            <AuthenticatedShell />
                        </OutboxProvider>
                    </UndoableActionProvider>
                </DayStatusProvider>
            </SelectedDateProvider>
        </AppNavigationProvider>
    )
}

function AuthenticatedShell() {
    const { activeTab, goToTab } = useAppNavigation()

    return (
        <div className="app-shell">
            <DateHeader />
            <main className="app-content">
                {activeTab === 'treino' && <WorkoutTab />}
                {activeTab === 'alimentacao' && <FoodTab />}
                {activeTab === 'resultados' && <ResultsTab />}
            </main>
            <UndoBar />
            <BottomNav activeTab={activeTab} onSelectTab={goToTab} />
        </div>
    )
}
