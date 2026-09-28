import { useEffect, useState } from 'react'

import {
    deleteBodyWeightEntry,
    deleteSleepEntry,
    listRecentBodyWeightEntries,
    listRecentSleepEntries,
    upsertBodyWeightEntry,
    upsertSleepEntry,
} from '@/features/bodyMetrics/api'
import { QuickMetricLog } from '@/features/bodyMetrics/QuickMetricLog'
import { getCurrentCycle } from '@/features/cycle/api'
import { listFinishedSessionDates } from '@/features/results/api'
import { buildWeeklyCompletionGrid, type WeekRow } from '@/features/results/resultsGrid'
import { shiftIsoDate, todayInTimezone } from '@/lib/dateUtils'
import type { Weekday } from '@/lib/workoutPlanSchema'

const DEFAULT_LOOKBACK_DAYS = 27

const WEEKDAY_LABELS: Record<Weekday, string> = {
    segunda: 'Seg',
    terca: 'Ter',
    quarta: 'Qua',
    quinta: 'Qui',
    sexta: 'Sex',
    sabado: 'Sáb',
    domingo: 'Dom',
}

export function ResultsTab() {
    const [weeks, setWeeks] = useState<WeekRow[] | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    useEffect(() => {
        let isCancelled = false

        async function load() {
            try {
                const today = todayInTimezone()
                const cycle = await getCurrentCycle()
                const rangeStart = cycle ? cycle.start_date : shiftIsoDate(today, -DEFAULT_LOOKBACK_DAYS)
                const effectiveRangeStart = rangeStart <= today ? rangeStart : today

                const finishedDates = await listFinishedSessionDates(effectiveRangeStart)
                if (isCancelled) {
                    return
                }

                const grid = buildWeeklyCompletionGrid(effectiveRangeStart, today, new Set(finishedDates))
                setWeeks(grid)
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

    if (!weeks) {
        return <p>Carregando resultados...</p>
    }

    return (
        <div>
            <h2 style={{ fontSize: 16, marginTop: 0 }}>Dias de treino concluídos</h2>
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
                            <span
                                key={day.date}
                                className={dayCellClassName(day.inRange, day.completed)}
                                title={day.date}
                            >
                                {day.inRange && day.completed ? '✓' : ''}
                            </span>
                        ))}
                    </div>
                ))}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                    <QuickMetricLog
                        title="Peso corporal"
                        unitLabel="kg"
                        placeholder="ex: 78.5"
                        listRecent={async () =>
                            (await listRecentBodyWeightEntries()).map((entry) => ({
                                id: entry.id,
                                entryDate: entry.entry_date,
                                value: entry.weight_kg,
                            }))
                        }
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
                        listRecent={async () =>
                            (await listRecentSleepEntries()).map((entry) => ({
                                id: entry.id,
                                entryDate: entry.entry_date,
                                value: entry.hours,
                            }))
                        }
                        save={async (entryDate, value) => {
                            const saved = await upsertSleepEntry(entryDate, value)
                            return { id: saved.id, entryDate: saved.entry_date, value: saved.hours }
                        }}
                        deleteEntry={deleteSleepEntry}
                    />
                </div>
            </div>
        </div>
    )
}

function dayCellClassName(inRange: boolean, completed: boolean): string {
    if (!inRange) {
        return 'results-grid__cell results-grid__cell--out-of-range'
    }
    if (completed) {
        return 'results-grid__cell results-grid__cell--completed'
    }
    return 'results-grid__cell'
}
