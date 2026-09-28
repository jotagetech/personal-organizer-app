import { listRoutineDayEntries, listRoutineItems } from '@/features/routine/api'
import { resolveRoutineForDate } from '@/features/routine/resolveRoutine'
import type { RoutineRow } from '@/features/routine/types'
import type { DaySignals } from '@/features/shared/daySignals'
import type { TabIndicatorKind } from '@/features/shared/tabIndicators'
import type { IsoDate } from '@/lib/dateUtils'

// Sem nenhum template aplicável ao dia, não há o que soar alarme (mesmo
// critério do indicador de treino: sem previsão, sem pendência). Com pelo
// menos um item, o indicador reflete só se falta algo, sem contar quantos.
export function deriveRoutineIndicatorKind(rows: RoutineRow[]): TabIndicatorKind {
    if (rows.length === 0) {
        return 'none'
    }

    const hasPendingRow = rows.some((row) => row.state === 'pending')
    return hasPendingRow ? 'pending' : 'done'
}

export async function fetchRoutineIndicatorForDate(date: IsoDate, signals: DaySignals): Promise<TabIndicatorKind> {
    const [items, dayEntries] = await Promise.all([listRoutineItems(), listRoutineDayEntries(date)])
    const rows = resolveRoutineForDate(date, items, dayEntries, signals)

    return deriveRoutineIndicatorKind(rows)
}
