import type { DaySignals } from '@/features/shared/daySignals'
import type { RoutineDayEntryRow, RoutineItemRow, RoutineLinkKind, RoutineRow } from '@/features/routine/types'
import { weekdayOfIsoDate, type IsoDate } from '@/lib/dateUtils'

function isTemplateActiveOnDate(item: RoutineItemRow, date: IsoDate): boolean {
    const weekday = weekdayOfIsoDate(date)
    const isScheduledOnWeekday = item.weekdays.includes(weekday)
    const hasStarted = item.active_from <= date
    const isNotArchivedYet = item.archived_on === null || item.archived_on > date

    return isScheduledOnWeekday && hasStarted && isNotArchivedYet
}

function isSignalSatisfied(linkKind: RoutineLinkKind, signals: DaySignals): boolean {
    switch (linkKind) {
        case 'workout_finished':
            return signals.workout === 'finished'
        case 'meal:cafe_da_manha':
            return signals.mealsLogged.has('cafe_da_manha')
        case 'meal:almoco':
            return signals.mealsLogged.has('almoco')
        case 'meal:lanche':
            return signals.mealsLogged.has('lanche')
        case 'meal:jantar':
            return signals.mealsLogged.has('jantar')
        case 'body_weight':
            return signals.bodyWeightLogged
        case 'sleep':
            return signals.sleepLogged
        default:
            return false
    }
}

function byOrderThenCreation<T extends { sort_order: number; created_at: string }>(rowA: T, rowB: T): number {
    if (rowA.sort_order !== rowB.sort_order) {
        return rowA.sort_order - rowB.sort_order
    }

    return rowA.created_at.localeCompare(rowB.created_at)
}

function resolveTemplateRow(
    item: RoutineItemRow,
    manualEntry: RoutineDayEntryRow | undefined,
    signals: DaySignals,
): RoutineRow {
    const linkKind = item.link_kind as RoutineLinkKind | null
    const hasManualCompletion = manualEntry?.completed_at != null
    const dayEntryId = hasManualCompletion && manualEntry ? manualEntry.id : null

    if (linkKind === null) {
        return {
            id: item.id,
            title: item.title,
            source: 'manual',
            state: hasManualCompletion ? 'done' : 'pending',
            linkKind: null,
            routineItemId: item.id,
            dayEntryId,
        }
    }

    const state = resolveLinkedItemState(linkKind, hasManualCompletion, signals)

    return {
        id: item.id,
        title: item.title,
        source: 'linked',
        state,
        linkKind,
        routineItemId: item.id,
        dayEntryId,
    }
}

function resolveLinkedItemState(
    linkKind: RoutineLinkKind,
    hasManualCompletion: boolean,
    signals: DaySignals,
): RoutineRow['state'] {
    if (hasManualCompletion) {
        return 'done_manual_override'
    }

    return isSignalSatisfied(linkKind, signals) ? 'done' : 'pending'
}

function resolveAdhocRow(entry: RoutineDayEntryRow): RoutineRow {
    return {
        id: entry.id,
        title: entry.title ?? '',
        source: 'adhoc',
        state: entry.completed_at !== null ? 'done' : 'pending',
        linkKind: null,
        routineItemId: null,
        dayEntryId: entry.id,
    }
}

export type RoutineEmptyState = 'offer_suggested' | 'nothing_for_day' | 'none'

// Lógica pura: decide qual estado vazio mostrar (se algum). "offer_suggested"
// olha só pra existência de item ATIVO, nunca pra aplicabilidade num dia
// específico, pra não reoferecer "Criar rotina sugerida" (e duplicar itens)
// só porque nenhum item se aplica à data selecionada.
export function deriveRoutineEmptyState(items: RoutineItemRow[], rows: RoutineRow[]): RoutineEmptyState {
    const hasActiveItem = items.some((item) => item.archived_on === null)
    if (!hasActiveItem) {
        return 'offer_suggested'
    }
    if (rows.length === 0) {
        return 'nothing_for_day'
    }
    return 'none'
}

// Lógica pura (sem chamada de rede): decide o que a tela de rotina mostra
// pra uma data, cruzando os templates recorrentes com os registros do dia e
// com os sinais já calculados pelas outras abas, sem consultar nada de novo.
export function resolveRoutineForDate(
    date: IsoDate,
    items: RoutineItemRow[],
    dayEntries: RoutineDayEntryRow[],
    signals: DaySignals,
): RoutineRow[] {
    const applicableItems = items.filter((item) => isTemplateActiveOnDate(item, date)).sort(byOrderThenCreation)
    const manualEntryByItemId = new Map(
        dayEntries.filter((entry) => entry.routine_item_id !== null).map((entry) => [entry.routine_item_id, entry]),
    )
    const templateRows = applicableItems.map((item) =>
        resolveTemplateRow(item, manualEntryByItemId.get(item.id), signals),
    )

    const adhocEntries = dayEntries.filter((entry) => entry.routine_item_id === null).sort(byOrderThenCreation)
    const adhocRows = adhocEntries.map(resolveAdhocRow)

    return [...templateRows, ...adhocRows]
}
