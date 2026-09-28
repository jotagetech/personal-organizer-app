import type { DaySignals, WorkoutSignal } from '@/features/shared/daySignals'

export type TabIndicatorKind = 'none' | 'pending' | 'done'

export type TabIndicators = {
    treino: TabIndicatorKind
    alimentacao: TabIndicatorKind
    resultados: TabIndicatorKind
}

export const EMPTY_TAB_INDICATORS: TabIndicators = {
    treino: 'none',
    alimentacao: 'none',
    resultados: 'none',
}

// Lógica pura (sem chamada de rede), pra o indicador de cada aba refletir os
// sinais do dia selecionado sem repetir a leitura desses sinais em cada lugar
// que precisa deles.
export function deriveTabIndicators(signals: DaySignals, plannedWorkoutToday: boolean): TabIndicators {
    return {
        treino: deriveWorkoutIndicator(signals.workout, plannedWorkoutToday),
        alimentacao: signals.foodEntryCount > 0 ? 'done' : 'none',
        resultados: signals.bodyWeightLogged && signals.sleepLogged ? 'none' : 'pending',
    }
}

function deriveWorkoutIndicator(workout: WorkoutSignal, plannedWorkoutToday: boolean): TabIndicatorKind {
    if (workout === 'finished') {
        return 'done'
    }
    if (workout === 'in_progress') {
        return 'pending'
    }

    // Sem treino registrado: só soa alarme quando dá pra confirmar que havia
    // treino previsto pro dia, pra não marcar como pendente um dia de
    // descanso do plano.
    return plannedWorkoutToday ? 'pending' : 'none'
}
