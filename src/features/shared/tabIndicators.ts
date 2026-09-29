import type { DaySignals, WorkoutSignal } from '@/features/shared/daySignals'

export type TabIndicatorKind = 'none' | 'pending' | 'done'

// A aba de rotina entra com o próprio indicador (calculado à parte, ver
// features/routine/routineIndicator.ts) porque depende de dados que essa
// aba não lê (os templates de rotina e os registros do dia), então não dá
// pra derivar a partir só de DaySignals como as outras.
export type TabIndicators = {
    rotina: TabIndicatorKind
    treino: TabIndicatorKind
    alimentacao: TabIndicatorKind
    resultados: TabIndicatorKind
    menu: TabIndicatorKind
}

export const EMPTY_TAB_INDICATORS: TabIndicators = {
    rotina: 'none',
    treino: 'none',
    alimentacao: 'none',
    resultados: 'none',
    menu: 'none',
}

// Lógica pura (sem chamada de rede), pra o indicador de cada aba refletir os
// sinais do dia selecionado sem repetir a leitura desses sinais em cada lugar
// que precisa deles.
export function deriveTabIndicators(
    signals: DaySignals,
    plannedWorkoutToday: boolean,
): Omit<TabIndicators, 'rotina'> {
    return {
        treino: deriveWorkoutIndicator(signals.workout, plannedWorkoutToday),
        alimentacao: signals.foodEntryCount > 0 ? 'done' : 'none',
        resultados: 'none',
        menu: signals.bodyWeightLogged && signals.sleepLogged ? 'none' : 'pending',
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
