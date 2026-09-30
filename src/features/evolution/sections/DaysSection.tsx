import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { listCycles } from '@/features/cycle/api'
import type { WorkoutCycleRow } from '@/features/cycle/types'
import {
    formatDayMonth,
    formatDaysGridTitle,
    formatExpandGridLabel,
    resolveDaysRangeEnd,
    resolveDaysWindow,
} from '@/features/evolution/sections/daysWindow'
import { DayDetail } from '@/features/results/DayDetail'
import { listFinishedSessionDates } from '@/features/results/api'
import { buildWeeklyCompletionGrid, selectVisibleWeeks } from '@/features/results/resultsGrid'
import { useSelectedDate } from '@/contexts/SelectedDateContext'
import { todayInTimezone, type IsoDate } from '@/lib/dateUtils'
import { WEEKDAY_LABELS } from '@/lib/weekdayLabels'
import type { Weekday } from '@/lib/workoutPlanSchema'

const MAX_COLLAPSED_WEEKS = 6
const TOGGLE_ICON_SIZE = 16

type FinishedDates = {
    sinceDate: IsoDate
    dates: IsoDate[]
}

function loadErrorText(loadError: unknown): string {
    const message = loadError instanceof Error ? loadError.message : 'Falha ao carregar resultados'

    return message
}

export function DaysSection() {
    const { selectedDate, setSelectedDate } = useSelectedDate()
    const [cycles, setCycles] = useState<WorkoutCycleRow[] | null>(null)
    const [finished, setFinished] = useState<FinishedDates | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isShowingWholeCycle, setIsShowingWholeCycle] = useState(false)
    const today = todayInTimezone()
    const daysWindow = cycles ? resolveDaysWindow(cycles, selectedDate, today) : null
    const rangeStart = daysWindow?.rangeStart ?? null

    useEffect(() => {
        let isCancelled = false

        async function loadCycles() {
            try {
                const loadedCycles = await listCycles()
                if (!isCancelled) {
                    setCycles(loadedCycles)
                }
            } catch (loadError) {
                if (!isCancelled) {
                    setErrorMessage(loadErrorText(loadError))
                }
            }
        }

        void loadCycles()
        return () => {
            isCancelled = true
        }
    }, [])

    // Só a troca de ciclo muda o início da janela; tocar em outro dia do mesmo
    // ciclo reaproveita os treinos já carregados.
    useEffect(() => {
        if (rangeStart === null) {
            return
        }

        let isCancelled = false

        async function loadFinishedDates(sinceDate: IsoDate) {
            try {
                const dates = await listFinishedSessionDates(sinceDate)
                if (!isCancelled) {
                    setFinished({ sinceDate, dates })
                }
            } catch (loadError) {
                if (!isCancelled) {
                    setErrorMessage(loadErrorText(loadError))
                }
            }
        }

        void loadFinishedDates(rangeStart)
        return () => {
            isCancelled = true
        }
    }, [rangeStart])

    if (errorMessage) {
        return <div className="error-list">{errorMessage}</div>
    }

    if (!daysWindow || !finished || finished.sinceDate !== daysWindow.rangeStart) {
        return <p className="text-muted">Carregando resultados...</p>
    }

    // A grade continua limitada à janela do ciclo (ou aos últimos dias, sem
    // ciclo na data) para o cálculo de "dentro do intervalo"; só o desenho da
    // grade se estende pra sempre incluir a data selecionada em algum lugar.
    const weeks = buildWeeklyCompletionGrid(
        daysWindow.rangeStart,
        resolveDaysRangeEnd(daysWindow, finished.dates, today),
        new Set(finished.dates),
        selectedDate,
    )

    const { visible: collapsedWeeks, hiddenCount } = selectVisibleWeeks(weeks, selectedDate, MAX_COLLAPSED_WEEKS)
    const visibleWeeks = isShowingWholeCycle ? weeks : collapsedWeeks
    const ToggleIcon = isShowingWholeCycle ? ChevronUp : ChevronDown

    return (
        <div>
            <h2 className="section-title results-tab__title">{formatDaysGridTitle(daysWindow)}</h2>
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
                        {isShowingWholeCycle ? 'Mostrar menos' : formatExpandGridLabel(daysWindow, weeks.length)}
                        <ToggleIcon size={TOGGLE_ICON_SIZE} aria-hidden="true" />
                    </button>
                </div>
            )}
            <DayDetail selectedDate={selectedDate} />
        </div>
    )
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
