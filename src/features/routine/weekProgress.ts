import { countRoutineProgress, resolveRoutineForDate } from '@/features/routine/resolveRoutine'
import type { RoutineData } from '@/features/routine/types'
import type { DaySignals } from '@/features/shared/deriveDaySignals'
import { shiftIsoDate, weekdayOfIsoDate, type IsoDate } from '@/lib/dateUtils'

// 'counted' tem número de verdade; os demais ficam como anel vazio e apagado:
// dia que ainda não chegou, dia anterior ao começo da rotina e dia em que
// nada era esperado.
export type WeekDayStatus = 'counted' | 'future' | 'before_start' | 'empty'

export type WeekDayProgress = {
    date: IsoDate
    status: WeekDayStatus
    done: number
    total: number
}

const WEEKDAY_INDEX_FROM_SUNDAY = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'] as const

const NO_SIGNALS: DaySignals = {
    workout: 'none',
    mealsLogged: new Set(),
    foodEntryCount: 0,
    bodyWeightLogged: false,
    sleepLogged: false,
    cardioCount: 0,
}

// Os 7 dias, de domingo a sábado, da semana que contém a data.
export function weekDatesOf(date: IsoDate): IsoDate[] {
    const daysSinceSunday = WEEKDAY_INDEX_FROM_SUNDAY.indexOf(weekdayOfIsoDate(date))
    const sunday = shiftIsoDate(date, -daysSinceSunday)

    return Array.from({ length: 7 }, (_, offset) => shiftIsoDate(sunday, offset))
}

function firstActiveDateOf(routineData: RoutineData): IsoDate | null {
    if (routineData.items.length === 0) {
        return null
    }

    return routineData.items.reduce(
        (earliest, item) => (item.active_from < earliest ? item.active_from : earliest),
        routineData.items[0].active_from,
    )
}

function progressOfDay(
    date: IsoDate,
    routineData: RoutineData,
    signals: DaySignals,
): Pick<WeekDayProgress, 'status' | 'done' | 'total'> {
    const { done, total } = countRoutineProgress(resolveRoutineForDate(date, routineData, signals))
    if (total === 0) {
        return { status: 'empty', done: 0, total: 0 }
    }

    return { status: 'counted', done, total }
}

// Lógica pura: o progresso de cada dia da semana com a mesma regra do "X de Y"
// do dia, resolvendo a agenda que valia em cada data. Um dia fraco não apaga
// os outros: cada dia vale por si, sem sequência.
export function buildWeekProgress(
    weekDates: IsoDate[],
    routineData: RoutineData,
    signalsByDate: Map<IsoDate, DaySignals>,
    today: IsoDate,
): WeekDayProgress[] {
    const firstActiveDate = firstActiveDateOf(routineData)

    return weekDates.map((date) => {
        if (date > today) {
            return { date, status: 'future', done: 0, total: 0 }
        }
        if (firstActiveDate !== null && date < firstActiveDate) {
            return { date, status: 'before_start', done: 0, total: 0 }
        }

        return { date, ...progressOfDay(date, routineData, signalsByDate.get(date) ?? NO_SIGNALS) }
    })
}
