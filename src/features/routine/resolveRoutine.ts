import type { DaySignals } from '@/features/shared/daySignals'
import type {
    RoutineData,
    RoutineDayEntryRow,
    RoutineItemRow,
    RoutineItemScheduleRow,
    RoutineLinkKind,
    RoutineRow,
    RoutineRowState,
    RoutineTaskRow,
} from '@/features/routine/types'
import { diffInDays, weekdayOfIsoDate, type IsoDate } from '@/lib/dateUtils'

type RoutineSchedule = Pick<RoutineItemRow, 'repeat_kind' | 'weekdays' | 'interval_days' | 'interval_anchor'>

export type RoutineProgress = {
    done: number
    total: number
}

// A versão vigente numa data é a de maior effective_from que já começou.
// Sem nenhuma versão até a data, vale a agenda da própria linha do item, que
// é sempre a mais recente.
export function resolveScheduleOnDate(
    item: RoutineItemRow,
    itemSchedules: RoutineItemScheduleRow[],
    date: IsoDate,
): RoutineSchedule {
    const startedSchedules = itemSchedules.filter((schedule) => schedule.effective_from <= date)
    if (startedSchedules.length === 0) {
        return item
    }

    const currentSchedule = startedSchedules.reduce((latest, schedule) =>
        schedule.effective_from > latest.effective_from ? schedule : latest,
    )
    return currentSchedule
}

function isScheduledOnDate(schedule: RoutineSchedule, date: IsoDate): boolean {
    if (schedule.repeat_kind === 'weekdays') {
        return (schedule.weekdays ?? []).includes(weekdayOfIsoDate(date))
    }
    if (schedule.interval_anchor === null || schedule.interval_days === null) {
        return false
    }

    const daysSinceAnchor = diffInDays(schedule.interval_anchor, date)
    return daysSinceAnchor >= 0 && daysSinceAnchor % schedule.interval_days === 0
}

function isItemActiveOnDate(item: RoutineItemRow, date: IsoDate): boolean {
    const hasStarted = item.active_from <= date
    const isNotArchivedYet = item.archived_on === null || item.archived_on > date

    return hasStarted && isNotArchivedYet
}

function groupSchedulesByItemId(schedules: RoutineItemScheduleRow[]): Map<string, RoutineItemScheduleRow[]> {
    const schedulesByItemId = new Map<string, RoutineItemScheduleRow[]>()
    for (const schedule of schedules) {
        const itemSchedules = schedulesByItemId.get(schedule.routine_item_id)
        if (itemSchedules) {
            itemSchedules.push(schedule)
        } else {
            schedulesByItemId.set(schedule.routine_item_id, [schedule])
        }
    }

    return schedulesByItemId
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

function resolveLinkedItemState(
    linkKind: RoutineLinkKind,
    hasManualCompletion: boolean,
    signals: DaySignals,
): RoutineRowState {
    if (hasManualCompletion) {
        return 'done_manual_override'
    }

    return isSignalSatisfied(linkKind, signals) ? 'done' : 'pending'
}

function resolveItemRow(
    item: RoutineItemRow,
    manualEntry: RoutineDayEntryRow | undefined,
    signals: DaySignals,
): RoutineRow {
    const linkKind = item.link_kind as RoutineLinkKind | null
    const hasManualCompletion = manualEntry !== undefined
    const baseRow = {
        id: item.id,
        title: item.title,
        linkKind,
        routineItemId: item.id,
        dayEntryId: manualEntry?.id ?? null,
        taskId: null,
        categoryId: item.category_id,
        isImportant: item.is_important,
        carriedFromDate: null,
        movedToDate: null,
    }

    if (linkKind === null) {
        const manualRow: RoutineRow = { ...baseRow, source: 'manual', state: hasManualCompletion ? 'done' : 'pending' }
        return manualRow
    }

    const linkedRow: RoutineRow = {
        ...baseRow,
        source: 'linked',
        state: resolveLinkedItemState(linkKind, hasManualCompletion, signals),
    }
    return linkedRow
}

export function resolveTaskRow(task: RoutineTaskRow): RoutineRow {
    const taskRow: RoutineRow = {
        id: task.id,
        title: task.title,
        source: 'task',
        state: task.completed_at !== null ? 'done' : 'pending',
        linkKind: null,
        routineItemId: null,
        dayEntryId: null,
        taskId: task.id,
        categoryId: task.category_id,
        isImportant: task.is_important,
        carriedFromDate: task.carried_from_on,
        movedToDate: null,
    }
    return taskRow
}

// A tarefa levada para outro dia deixa no dia de origem uma linha apagada, só
// para leitura. carried_from_on guarda apenas a última origem, então uma
// tarefa levada mais de uma vez só aparece assim no último dia de onde saiu.
function resolveMovedTaskRow(task: RoutineTaskRow): RoutineRow {
    const movedRow: RoutineRow = {
        ...resolveTaskRow(task),
        state: 'moved',
        carriedFromDate: null,
        movedToDate: task.scheduled_on,
    }
    return movedRow
}

function isTaskMovedAwayFrom(task: RoutineTaskRow, date: IsoDate): boolean {
    return task.carried_from_on === date && task.scheduled_on !== null && task.scheduled_on > date
}

// Tarefas sem data não pertencem a dia nenhum: ficam fora da lista do dia e
// são listadas à parte.
export function listUndatedTasks(tasks: RoutineTaskRow[]): RoutineTaskRow[] {
    const undatedTasks = tasks.filter((task) => task.scheduled_on === null).sort(byOrderThenCreation)

    return undatedTasks
}

export function isRoutineRowDone(state: RoutineRowState): boolean {
    return state === 'done' || state === 'done_manual_override'
}

// Lógica pura: o "X de Y" do dia, contando como feito tanto o item vinculado
// satisfeito pelo sinal quanto a marcação manual e a tarefa concluída. A
// tarefa levada para outro dia não é feita nem pendente aqui: fica de fora.
export function countRoutineProgress(rows: RoutineRow[]): RoutineProgress {
    const countedRows = rows.filter((row) => row.state !== 'moved')
    const progress: RoutineProgress = {
        done: countedRows.filter((row) => isRoutineRowDone(row.state)).length,
        total: countedRows.length,
    }
    return progress
}

export type RoutineEmptyState = 'no_items' | 'nothing_for_day' | 'none'

// Lógica pura: decide qual estado vazio mostrar (se algum). "no_items" olha
// só pra existência de item ATIVO, nunca pra aplicabilidade num dia
// específico, pra não confundir "ainda não há itens" com "nenhum item cai
// na data selecionada".
export function deriveRoutineEmptyState(items: RoutineItemRow[], rows: RoutineRow[]): RoutineEmptyState {
    const hasActiveItem = items.some((item) => item.archived_on === null)
    if (!hasActiveItem) {
        return 'no_items'
    }
    if (rows.length === 0) {
        return 'nothing_for_day'
    }
    return 'none'
}

// Lógica pura: a primeira vez volta enquanto a conta não tiver nenhum item
// que repete ativo. Pular esconde a tela só até o app ser aberto de novo, e
// tarefa avulsa sozinha não conta como rotina montada.
export function shouldShowRoutineOnboarding(items: RoutineItemRow[], wasSkippedThisSession: boolean): boolean {
    const hasActiveItem = items.some((item) => item.archived_on === null)
    const shouldShow = !hasActiveItem && !wasSkippedThisSession
    return shouldShow
}

// Lógica pura (sem chamada de rede): decide o que a tela de rotina mostra
// pra uma data, cruzando os itens que repetem (com a agenda que valia na
// data) com as marcações do dia, as tarefas marcadas para ela e os sinais já
// calculados pelas outras abas, sem consultar nada de novo. Itens vêm antes
// das tarefas, e as tarefas levadas para outro dia vêm por último.
export function resolveRoutineForDate(date: IsoDate, data: RoutineData, signals: DaySignals): RoutineRow[] {
    const schedulesByItemId = groupSchedulesByItemId(data.schedules)
    const applicableItems = data.items
        .filter(
            (item) =>
                isItemActiveOnDate(item, date) &&
                isScheduledOnDate(resolveScheduleOnDate(item, schedulesByItemId.get(item.id) ?? [], date), date),
        )
        .sort(byOrderThenCreation)
    const manualEntryByItemId = new Map(
        data.entries
            .filter((entry) => entry.entry_date === date)
            .map((entry) => [entry.routine_item_id, entry]),
    )
    const itemRows = applicableItems.map((item) => resolveItemRow(item, manualEntryByItemId.get(item.id), signals))

    const taskRows = data.tasks
        .filter((task) => task.scheduled_on === date)
        .sort(byOrderThenCreation)
        .map(resolveTaskRow)
    const movedRows = data.tasks
        .filter((task) => isTaskMovedAwayFrom(task, date))
        .sort(byOrderThenCreation)
        .map(resolveMovedTaskRow)

    return [...itemRows, ...taskRows, ...movedRows]
}
