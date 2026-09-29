import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { getCurrentCycle } from '@/features/cycle/api'
import type { WorkoutCycleRow } from '@/features/cycle/types'
import { DayDetail } from '@/features/results/DayDetail'
import { listFinishedSessionDates } from '@/features/results/api'
import { buildWeeklyCompletionGrid, selectVisibleWeeks } from '@/features/results/resultsGrid'
import { useSelectedDate } from '@/contexts/SelectedDateContext'
import { shiftIsoDate, todayInTimezone, type IsoDate } from '@/lib/dateUtils'
import { WEEKDAY_LABELS } from '@/lib/weekdayLabels'
import type { Weekday } from '@/lib/workoutPlanSchema'

const DEFAULT_LOOKBACK_DAYS = 27
const MAX_COLLAPSED_WEEKS = 6
const TOGGLE_ICON_SIZE = 16

type GridInputs = {
    rangeStart: IsoDate
    rangeEnd: IsoDate
    completedDates: Set<IsoDate>
}

export function ResultsTab() {
    const { selectedDate, setSelectedDate } = useSelectedDate()
    const [gridInputs, setGridInputs] = useState<GridInputs | null>(null)
    const [cycle, setCycle] = useState<WorkoutCycleRow | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isShowingWholeCycle, setIsShowingWholeCycle] = useState(false)

    useEffect(() => {
        let isCancelled = false

        async function load() {
            try {
                const today = todayInTimezone()
                const currentCycle = await getCurrentCycle()
                const rangeStart = currentCycle ? currentCycle.start_date : shiftIsoDate(today, -DEFAULT_LOOKBACK_DAYS)
                const effectiveRangeStart = rangeStart <= today ? rangeStart : today

                const finishedDates = await listFinishedSessionDates(effectiveRangeStart)
                if (isCancelled) {
                    return
                }

                const latestFinishedDate = finishedDates.reduce(
                    (latest, date) => (date > latest ? date : latest),
                    today,
                )

                setCycle(currentCycle)
                setGridInputs({
                    rangeStart: effectiveRangeStart,
                    rangeEnd: latestFinishedDate,
                    completedDates: new Set(finishedDates),
                })
            } catch (loadError) {
                if (isCancelled) {
                    return
                }
                const message = loadError instanceof Error ? loadError.message : 'Falha ao carregar resultados'
                setErrorMessage(message)
            }
        }

        void load()
        return () => {
            isCancelled = true
        }
    }, [])

    if (errorMessage) {
        return <div className="error-list">{errorMessage}</div>
    }

    if (!gridInputs) {
        return <p className="text-muted">Carregando resultados...</p>
    }

    // A grade continua limitada à janela do ciclo (ou aos últimos dias, sem
    // ciclo ativo) para o cálculo de "dentro do intervalo"; só o desenho da
    // grade se estende pra sempre incluir a data selecionada em algum lugar.
    const weeks = buildWeeklyCompletionGrid(
        gridInputs.rangeStart,
        gridInputs.rangeEnd,
        gridInputs.completedDates,
        selectedDate,
    )

    const { visible: collapsedWeeks, hiddenCount } = selectVisibleWeeks(weeks, selectedDate, MAX_COLLAPSED_WEEKS)
    const visibleWeeks = isShowingWholeCycle ? weeks : collapsedWeeks
    const today = todayInTimezone()
    const ToggleIcon = isShowingWholeCycle ? ChevronUp : ChevronDown

    return (
        <div>
            <h2 className="section-title results-tab__title">{gridTitle(cycle)}</h2>
            <div className="results-grid">
                <div className="results-grid__row results-grid__row--header">
                    {(Object.keys(WEEKDAY_LABELS) as Weekday[]).map((weekday) => (
                        <span key={weekday} className="results-grid__label">
                            {WEEKDAY_LABELS[weekday]}
                        </span>
                    ))}
                </div>
                {visibleWeeks.map((week) => (
                    <div key={week.weekStart} className="results-grid__row">
                        {week.days.map((day) => (
                            <button
                                key={day.date}
                                type="button"
                                className={dayCellClassName(day.inRange, day.completed, day.selected, day.date === today)}
                                title={day.date}
                                aria-label={dayAriaLabel(day.date, day.completed)}
                                aria-pressed={day.selected}
                                aria-current={day.date === today ? 'date' : undefined}
                                onClick={() => setSelectedDate(day.date)}
                            >
                                {dayOfMonth(day.date)}
                            </button>
                        ))}
                    </div>
                ))}
            </div>
            {hiddenCount > 0 && (
                <div className="results-grid__toggle">
                    <button
                        type="button"
                        className="results-grid__toggle-button"
                        onClick={() => setIsShowingWholeCycle((previous) => !previous)}
                    >
                        {isShowingWholeCycle ? 'Mostrar menos' : expandGridLabel(cycle, weeks.length)}
                        <ToggleIcon size={TOGGLE_ICON_SIZE} aria-hidden="true" />
                    </button>
                </div>
            )}
            <DayDetail selectedDate={selectedDate} />
        </div>
    )
}

function gridTitle(cycle: WorkoutCycleRow | null): string {
    if (!cycle) {
        return 'Dias de treino concluídos'
    }

    const cycleStartLabel = formatDayMonth(cycle.start_date)
    const title = `Dias de treino concluídos · ciclo desde ${cycleStartLabel}`

    return title
}

function expandGridLabel(cycle: WorkoutCycleRow | null, totalWeeks: number): string {
    const scopeLabel = cycle ? 'Ver ciclo inteiro' : 'Ver todas as semanas'
    const label = `${scopeLabel} (${totalWeeks} semanas)`

    return label
}

function formatDayMonth(isoDate: IsoDate): string {
    const [, month, day] = isoDate.split('-')
    const formattedLabel = `${day}/${month}`

    return formattedLabel
}

function dayOfMonth(isoDate: string): string {
    const day = isoDate.slice(8, 10)
    const dayWithoutLeadingZero = day.replace(/^0/, '')

    return dayWithoutLeadingZero
}

function dayCellClassName(inRange: boolean, completed: boolean, selected: boolean, isToday: boolean): string {
    const classNames = ['results-grid__cell']

    if (!inRange) {
        classNames.push('results-grid__cell--out-of-range')
    } else if (completed) {
        classNames.push('results-grid__cell--completed')
    }

    if (selected) {
        classNames.push('results-grid__cell--selected')
    }

    if (isToday) {
        classNames.push('results-grid__cell--today')
    }

    const className = classNames.join(' ')
    return className
}

function dayAriaLabel(isoDate: string, completed: boolean): string {
    const completedSuffix = completed ? ' (treino concluído)' : ''
    const label = `Ver detalhes do dia ${formatDayMonth(isoDate)}${completedSuffix}`

    return label
}
