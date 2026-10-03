import type { RoutineTaskRow } from '@/features/routine/types'
import { shiftIsoDate, type IsoDate } from '@/lib/dateUtils'

export const BRING_FORWARD_WINDOW_DAYS = 7

function byScheduledDayThenOrder(taskA: RoutineTaskRow, taskB: RoutineTaskRow): number {
    const dayOrder = (taskA.scheduled_on ?? '').localeCompare(taskB.scheduled_on ?? '')
    if (dayOrder !== 0) {
        return dayOrder
    }
    if (taskA.sort_order !== taskB.sort_order) {
        return taskA.sort_order - taskB.sort_order
    }

    return taskA.created_at.localeCompare(taskB.created_at)
}

// Lógica pura: as tarefas avulsas que ficaram para trás nos últimos 7 dias,
// de sete dias atrás até ontem. Concluídas e sem data nunca entram, e hábitos
// não passam por aqui porque não são tarefas avulsas.
export function selectTasksToBringForward(tasks: RoutineTaskRow[], today: IsoDate): RoutineTaskRow[] {
    const oldestDay = shiftIsoDate(today, -BRING_FORWARD_WINDOW_DAYS)
    const yesterday = shiftIsoDate(today, -1)
    const leftBehind = tasks
        .filter(
            (task) =>
                task.completed_at === null &&
                task.scheduled_on !== null &&
                task.scheduled_on >= oldestDay &&
                task.scheduled_on <= yesterday,
        )
        .sort(byScheduledDayThenOrder)

    return leftBehind
}
