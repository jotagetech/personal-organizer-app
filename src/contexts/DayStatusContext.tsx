import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { useOutbox } from '@/contexts/OutboxContext'
import { useSelectedDate } from '@/contexts/SelectedDateContext'
import { useUndoableActions } from '@/contexts/UndoableActionContext'
import { fetchRoutineIndicatorForDate } from '@/features/routine/routineIndicator'
import { fetchDaySignals } from '@/features/shared/daySignals'
import { deriveTabIndicators, EMPTY_TAB_INDICATORS, type TabIndicators } from '@/features/shared/tabIndicators'
import { workoutDayDeletionId } from '@/features/workout/workoutDayDeletion'
import { hasSessionDeletion } from '@/lib/outbox/outboxQueue'

// Descobrir se havia treino previsto pro dia exigiria ler o plano ativo
// inteiro a cada troca de data, duplicando uma busca que a aba Treino já faz
// sozinha. Sem essa confirmação, o indicador de treino nunca soa alarme
// perto de um dia sem nenhum registro, só reflete o que já foi salvo de fato.
const PLANNED_WORKOUT_TODAY = false

type DayStatusContextValue = {
    indicators: TabIndicators
    refreshDayStatus: () => void
}

const DayStatusContext = createContext<DayStatusContextValue | null>(null)

export function DayStatusProvider({ children }: { children: ReactNode }) {
    const { selectedDate } = useSelectedDate()
    const { getOperationsForDate } = useOutbox()
    const { isPendingDeletion } = useUndoableActions()
    const [indicators, setIndicators] = useState<TabIndicators>(EMPTY_TAB_INDICATORS)
    const [refreshToken, setRefreshToken] = useState(0)
    // O treino do dia excluído (na janela de desfazer ou ainda na fila, sem
    // sinal) já não conta no indicador, mesmo com o servidor ainda tendo a
    // sessão.
    const isWorkoutDeletionQueued = hasSessionDeletion(getOperationsForDate(selectedDate), selectedDate)
    const isWorkoutDeleted = isPendingDeletion(workoutDayDeletionId(selectedDate)) || isWorkoutDeletionQueued
    const wasWorkoutDeletionQueuedRef = useRef(isWorkoutDeletionQueued)

    // Indicador é informação de conveniência: uma leitura que falha não trava
    // a tela nem aparece como erro, só deixa o indicador desatualizado até a
    // próxima tentativa.
    const loadIndicators = useCallback(async (date: string) => {
        try {
            const signals = await fetchDaySignals(date)
            const routineIndicator = await fetchRoutineIndicatorForDate(date, signals)
            setIndicators({ ...deriveTabIndicators(signals, PLANNED_WORKOUT_TODAY), rotina: routineIndicator })
        } catch {
            // sem tratamento: ver comentário acima
        }
    }, [])

    useEffect(() => {
        setIndicators(EMPTY_TAB_INDICATORS)
    }, [selectedDate])

    useEffect(() => {
        void loadIndicators(selectedDate)
    }, [selectedDate, refreshToken, loadIndicators])

    // Quando a exclusão sai da fila (chegou ao servidor), o indicador volta a
    // ser o que o servidor diz, lido de novo.
    useEffect(() => {
        const wasQueued = wasWorkoutDeletionQueuedRef.current
        wasWorkoutDeletionQueuedRef.current = isWorkoutDeletionQueued
        if (wasQueued && !isWorkoutDeletionQueued) {
            setRefreshToken((token) => token + 1)
        }
    }, [isWorkoutDeletionQueued])

    const refreshDayStatus = useCallback(() => {
        setRefreshToken((token) => token + 1)
    }, [])

    const contextValue = useMemo<DayStatusContextValue>(() => {
        const visibleIndicators: TabIndicators = isWorkoutDeleted ? { ...indicators, treino: 'none' } : indicators

        return { indicators: visibleIndicators, refreshDayStatus }
    }, [indicators, isWorkoutDeleted, refreshDayStatus])

    return <DayStatusContext.Provider value={contextValue}>{children}</DayStatusContext.Provider>
}

export function useDayStatus(): DayStatusContextValue {
    const contextValue = useContext(DayStatusContext)
    if (!contextValue) {
        throw new Error('useDayStatus precisa estar dentro de um DayStatusProvider')
    }

    return contextValue
}
