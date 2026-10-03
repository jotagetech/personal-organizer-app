import { splitImportant } from '@/features/routine/categories'
import { countRoutineProgress, resolveRoutineForDate, type RoutineProgress } from '@/features/routine/resolveRoutine'
import type { RoutineData, RoutineRow } from '@/features/routine/types'
import type { DaySignals } from '@/features/shared/daySignals'
import type { IsoDate } from '@/lib/dateUtils'

export const ROUTINE_DAY_CARD_MAX_PENDING = 5

export type RoutineDayCardModel = {
    pending: RoutineRow[]
    progress: RoutineProgress
    hasWorkoutItem: boolean
}

// Lógica pura: as pendências que o card mostra. Importantes vêm primeiro e,
// dentro de cada grupo, vale a ordem da Rotina. Linha levada para outro dia
// e linha já feita ficam de fora.
export function pickRoutineDayCardPending(rows: RoutineRow[]): RoutineRow[] {
    const pendingRows = rows.filter((row) => row.state === 'pending')
    const { important, rest } = splitImportant(pendingRows)
    const picked = [...important, ...rest].slice(0, ROUTINE_DAY_CARD_MAX_PENDING)

    return picked
}

// Lógica pura: o painel de fim de treino só aparece com o treino finalizado,
// mas o banco pode ainda não saber (a finalização pode estar na fila de
// envio). O sinal é forçado para o item da academia sair como feito.
export function buildRoutineDayCardModel(date: IsoDate, data: RoutineData, signals: DaySignals): RoutineDayCardModel {
    const rows = resolveRoutineForDate(date, data, { ...signals, workout: 'finished' })
    const model: RoutineDayCardModel = {
        pending: pickRoutineDayCardPending(rows),
        progress: countRoutineProgress(rows),
        hasWorkoutItem: rows.some((row) => row.linkKind === 'workout_finished' && row.state !== 'moved'),
    }

    return model
}
