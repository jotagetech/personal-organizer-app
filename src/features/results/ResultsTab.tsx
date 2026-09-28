import { useEffect, useState } from 'react'

import {
    deleteBodyWeightEntry,
    deleteSleepEntry,
    getBodyWeightForDate,
    getSleepForDate,
    listRecentBodyWeightEntries,
    listRecentSleepEntries,
    upsertBodyWeightEntry,
    upsertSleepEntry,
} from '@/features/bodyMetrics/api'
import { QuickMetricLog } from '@/features/bodyMetrics/QuickMetricLog'
import { getCurrentCycle } from '@/features/cycle/api'
import type { WorkoutCycleRow } from '@/features/cycle/types'
import { DayDetail } from '@/features/results/DayDetail'
import { listFinishedSessionDates } from '@/features/results/api'
import { buildWeeklyCompletionGrid } from '@/features/results/resultsGrid'
import { useSelectedDate } from '@/contexts/SelectedDateContext'
import { shiftIsoDate, todayInTimezone, type IsoDate } from '@/lib/dateUtils'
import { WEEKDAY_LABELS } from '@/lib/weekdayLabels'
import type { Weekday } from '@/lib/workoutPlanSchema'

const DEFAULT_LOOKBACK_DAYS = 27
const SLEEP_MAX_HOURS = 24

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
        return <p>Carregando resultados...</p>
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

    return (
        <div>
            <h2 style={{ fontSize: 16, marginTop: 0 }}>Dia selecionado</h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                    <QuickMetricLog
                        title="Peso corporal"
                        unitLabel="kg"
                        placeholder="ex: 78.5"
                        entryDate={selectedDate}
                        listRecent={async () =>
                            (await listRecentBodyWeightEntries()).map((entry) => ({
                                id: entry.id,
                                entryDate: entry.entry_date,
                                value: entry.weight_kg,
                            }))
                        }
                        getEntryForDate={async (entryDate) => {
                            const entry = await getBodyWeightForDate(entryDate)
                            return entry ? { id: entry.id, entryDate: entry.entry_date, value: entry.weight_kg } : null
                        }}
                        save={async (entryDate, value) => {
                            const saved = await upsertBodyWeightEntry(entryDate, value)
                            return { id: saved.id, entryDate: saved.entry_date, value: saved.weight_kg }
                        }}
                        deleteEntry={deleteBodyWeightEntry}
                    />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                    <QuickMetricLog
                        title="Sono (horas)"
                        unitLabel="horas"
                        placeholder="ex: 7.5"
                        entryDate={selectedDate}
                        maxValue={SLEEP_MAX_HOURS}
                        listRecent={async () =>
                            (await listRecentSleepEntries()).map((entry) => ({
                                id: entry.id,
                                entryDate: entry.entry_date,
                                value: entry.hours,
                            }))
                        }
                        getEntryForDate={async (entryDate) => {
                            const entry = await getSleepForDate(entryDate)
                            return entry ? { id: entry.id, entryDate: entry.entry_date, value: entry.hours } : null
                        }}
                        save={async (entryDate, value) => {
                            const saved = await upsertSleepEntry(entryDate, value)
                            return { id: saved.id, entryDate: saved.entry_date, value: saved.hours }
                        }}
                        deleteEntry={deleteSleepEntry}
                    />
                </div>
            </div>
            <h2 style={{ fontSize: 16 }}>{gridTitle(cycle)}</h2>
            <div className="results-grid">
                <div className="results-grid__row results-grid__row--header">
                    {(Object.keys(WEEKDAY_LABELS) as Weekday[]).map((weekday) => (
                        <span key={weekday} className="results-grid__label">
                            {WEEKDAY_LABELS[weekday]}
                        </span>
                    ))}
                </div>
                {weeks.map((week) => (
                    <div key={week.weekStart} className="results-grid__row">
                        {week.days.map((day) => (
                            <button
                                key={day.date}
                                type="button"
                                className={dayCellClassName(day.inRange, day.completed, day.selected)}
                                title={day.date}
                                aria-label={dayAriaLabel(day.date, day.completed)}
                                aria-pressed={day.selected}
                                onClick={() => setSelectedDate(day.date)}
                            >
                                {dayOfMonth(day.date)}
                            </button>
                        ))}
                    </div>
                ))}
            </div>
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

function dayCellClassName(inRange: boolean, completed: boolean, selected: boolean): string {
    const classNames = ['results-grid__cell']

    if (!inRange) {
        classNames.push('results-grid__cell--out-of-range')
    } else if (completed) {
        classNames.push('results-grid__cell--completed')
    }

    if (selected) {
        classNames.push('results-grid__cell--selected')
    }

    const className = classNames.join(' ')
    return className
}

function dayAriaLabel(isoDate: string, completed: boolean): string {
    const completedSuffix = completed ? ' (treino concluído)' : ''
    const label = `Ver detalhes do dia ${formatDayMonth(isoDate)}${completedSuffix}`

    return label
}
