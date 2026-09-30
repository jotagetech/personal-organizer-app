import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { useSelectedDate } from '@/contexts/SelectedDateContext'
import { useCycleHistory, type CycleHistoryContextValue } from '@/features/evolution/data/CycleHistoryContext'
import { loadExerciseLog, type ExerciseLog } from '@/features/evolution/data/exerciseLog'
import { BarChart } from '@/features/evolution/charts/BarChart'
import type { SeriesChartPoint } from '@/features/evolution/charts/ChartFrame'
import { LineChart } from '@/features/evolution/charts/LineChart'
import { exerciseSessionSeries, topRecordKind, type SessionPoint } from '@/features/evolution/metrics/exerciseSeries'
import {
    buildExerciseIndex,
    cycleDateRange,
    exerciseHistory,
    exerciseRecords,
    type DateRange,
    type ExerciseIndexEntry,
    type ExerciseRecords,
    type ExerciseSessionEntry,
} from '@/features/evolution/metrics/exerciseStats'
import {
    formatAlsoRecordedAs,
    formatDoneText,
    formatMainRecord,
    formatDropText,
    formatPlanText,
    formatRecordLines,
    formatRecordsScopeNotice,
    formatSeriesTitle,
    formatSeriesValue,
    formatSessionsLine,
    formatUnreadableSessions,
} from '@/features/evolution/metrics/exerciseText'
import { formatDayMonth } from '@/features/evolution/sections/daysWindow'

type PeriodFilter = 'cycle' | 'all'

type LogState = {
    log: ExerciseLog | null
    errorMessage: string | null
    retry: () => void
}

const SESSIONS_PER_PAGE = 5
const TOGGLE_ICON_SIZE = 18

// Recarrega o registro quando o histórico de ciclos é recarregado (um ciclo
// editado ou excluído muda o que o filtro enxerga) e já há dados na tela.
function useExerciseLog(history: CycleHistoryContextValue['history']): LogState {
    const [log, setLog] = useState<ExerciseLog | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [attempt, setAttempt] = useState(0)
    const previousHistory = useRef(history)
    const hasLog = useRef(false)

    useEffect(() => {
        if (previousHistory.current === history) {
            return
        }
        previousHistory.current = history
        if (hasLog.current) {
            setAttempt((current) => current + 1)
        }
    }, [history])

    useEffect(() => {
        let isCancelled = false

        async function load() {
            setErrorMessage(null)
            try {
                const loadedLog = await loadExerciseLog()
                if (!isCancelled) {
                    hasLog.current = true
                    setLog(loadedLog)
                    setErrorMessage(null)
                }
            } catch (loadError) {
                if (!isCancelled) {
                    setErrorMessage(loadError instanceof Error ? loadError.message : 'Falha ao carregar exercícios')
                }
            }
        }

        void load()
        return () => {
            isCancelled = true
        }
    }, [attempt])

    return { log, errorMessage, retry: () => setAttempt((current) => current + 1) }
}

// O registro só é buscado quando a seção abre pela primeira vez; fechar e
// abrir de novo reaproveita o que já veio.
export function ExercisesSection() {
    const [isExpanded, setIsExpanded] = useState(false)
    const [hasOpened, setHasOpened] = useState(false)

    function toggle() {
        setIsExpanded((current) => !current)
        setHasOpened(true)
    }

    return (
        <div className="exercises-section">
            <h2 className="section-title results-tab__title">
                <button
                    type="button"
                    className="exercises-section__toggle"
                    aria-expanded={isExpanded}
                    onClick={toggle}
                >
                    <span>Exercícios</span>
                    {isExpanded ? <ChevronUp size={TOGGLE_ICON_SIZE} /> : <ChevronDown size={TOGGLE_ICON_SIZE} />}
                </button>
            </h2>
            {hasOpened && (
                <div hidden={!isExpanded}>
                    <ExercisesBody />
                </div>
            )}
        </div>
    )
}

function ExercisesBody() {
    const { selectedDate } = useSelectedDate()
    const { history, isLoading: isHistoryLoading } = useCycleHistory()
    const { log, errorMessage, retry } = useExerciseLog(history)
    const [chosenFilter, setChosenFilter] = useState<PeriodFilter | null>(null)
    const [openKey, setOpenKey] = useState<string | null>(null)

    const cycleRange = useMemo(
        () => (history ? cycleDateRange(history.cycles, selectedDate) : null),
        [history, selectedDate],
    )
    const filter: PeriodFilter = chosenFilter === 'all' || cycleRange === null ? 'all' : 'cycle'
    const range = filter === 'cycle' ? cycleRange : null
    const entries = useMemo(() => (log ? buildExerciseIndex(log, range ?? undefined) : []), [log, range])

    if (errorMessage && !log) {
        return (
            <div className="error-list">
                {errorMessage}
                <button type="button" className="error-list__retry" onClick={retry}>
                    Tentar de novo
                </button>
            </div>
        )
    }

    // Sem os ciclos não dá para saber se o padrão é o ciclo ou tudo.
    if (!log || (!history && isHistoryLoading)) {
        return <p className="text-muted">Carregando exercícios...</p>
    }

    const unreadableNotice = formatUnreadableSessions(log.unreadableSessionCount)

    return (
        <div className="exercises-body">
            <div className="exercise-filter" role="group" aria-label="Período">
                <FilterChip
                    label="Ciclo"
                    isSelected={filter === 'cycle'}
                    isDisabled={cycleRange === null}
                    onSelect={() => setChosenFilter('cycle')}
                />
                <FilterChip label="Tudo" isSelected={filter === 'all'} isDisabled={false} onSelect={() => setChosenFilter('all')} />
            </div>
            {unreadableNotice && <p className="text-muted text-small">{unreadableNotice}</p>}
            {entries.length === 0 && (
                <p className="text-muted text-small">Nenhum exercício concluído neste período.</p>
            )}
            {entries.map((entry) => (
                <ExerciseItem
                    key={entry.key}
                    entry={entry}
                    log={log}
                    range={range}
                    isOpen={openKey === entry.key}
                    onToggle={() => setOpenKey(openKey === entry.key ? null : entry.key)}
                />
            ))}
        </div>
    )
}

type FilterChipProps = {
    label: string
    isSelected: boolean
    isDisabled: boolean
    onSelect: () => void
}

function FilterChip({ label, isSelected, isDisabled, onSelect }: FilterChipProps) {
    const className = isSelected ? 'exercise-filter__chip exercise-filter__chip--selected' : 'exercise-filter__chip'

    return (
        <button type="button" className={className} aria-pressed={isSelected} disabled={isDisabled} onClick={onSelect}>
            {label}
        </button>
    )
}

type ExerciseItemProps = {
    entry: ExerciseIndexEntry
    log: ExerciseLog
    range: DateRange | null
    isOpen: boolean
    onToggle: () => void
}

function ExerciseItem({ entry, log, range, isOpen, onToggle }: ExerciseItemProps) {
    const recordLabel = formatMainRecord(entry.mainRecord)

    return (
        <div className="card cycle-item">
            <button type="button" className="cycle-item__main" aria-expanded={isOpen} onClick={onToggle}>
                <span className="cycle-item__title">{entry.name}</span>
                <span className="cycle-item__line">{formatSessionsLine(entry.sessionCount, entry.lastDate)}</span>
                {recordLabel && <span className="cycle-item__line">{recordLabel}</span>}
            </button>
            {isOpen && <ExerciseDetail entry={entry} log={log} range={range} />}
        </div>
    )
}

type ExerciseDetailProps = {
    entry: ExerciseIndexEntry
    log: ExerciseLog
    range: DateRange | null
}

function ExerciseDetail({ entry, log, range }: ExerciseDetailProps) {
    const [visibleCount, setVisibleCount] = useState(SESSIONS_PER_PAGE)
    const records = useMemo(() => exerciseRecords(log, entry.key, range ?? undefined), [log, entry.key, range])
    const sessions = useMemo(() => exerciseHistory(log, entry.key, range ?? undefined), [log, entry.key, range])
    const series = useMemo(() => exerciseSessionSeries(log, entry.key, range ?? undefined), [log, entry.key, range])
    const alsoRecordedAs = formatAlsoRecordedAs(entry.previousNames)
    const scopeNotice = formatRecordsScopeNotice(records)

    return (
        <div className="exercise-detail">
            <ul className="exercise-detail__records">
                {formatRecordLines(records).map((line) => (
                    <li key={line}>{line}</li>
                ))}
            </ul>
            {scopeNotice && <p className="text-muted text-small">{scopeNotice}</p>}
            {alsoRecordedAs && <p className="text-muted text-small">{alsoRecordedAs}</p>}
            <ExerciseCharts records={records} series={series} />
            <div className="day-workout__exercises">
                {sessions.slice(0, visibleCount).map((session) => (
                    <SessionEntry key={session.sessionId} session={session} />
                ))}
            </div>
            {sessions.length > visibleCount && (
                <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setVisibleCount((current) => current + SESSIONS_PER_PAGE)}
                >
                    Ver mais
                </button>
            )}
        </div>
    )
}

type ExerciseChartsProps = {
    records: ExerciseRecords | null
    series: readonly SessionPoint[]
}

function pointsOf(series: readonly SessionPoint[], pick: (point: SessionPoint) => number | null): SeriesChartPoint[] {
    const points: SeriesChartPoint[] = []
    series.forEach((point) => {
        const value = pick(point)
        if (value !== null) {
            points.push({ date: point.date, value })
        }
    })

    return points
}

// Carga, 1RM e volume só aparecem quando a forma de carga tem o dado; o
// gráfico que não se aplica some em vez de ficar vazio.
function ExerciseCharts({ records, series }: ExerciseChartsProps) {
    if (records === null || series.length === 0) {
        return null
    }

    const { metric, formaCarga } = records
    const topKind = topRecordKind(metric, formaCarga)
    const oneRepMaxPoints = pointsOf(series, (point) => point.oneRepMax)
    const volumePoints = pointsOf(series, (point) => point.volume)

    return (
        <div className="exercise-charts">
            <LineChart
                title={formatSeriesTitle(topKind)}
                points={pointsOf(series, (point) => point.topValue)}
                preference={topKind === 'minAssistance' ? 'min' : 'max'}
                formatValue={(value) => formatSeriesValue(topKind, formaCarga, value)}
            />
            {oneRepMaxPoints.length > 0 && (
                <LineChart
                    title={formatSeriesTitle('bestOneRepMax')}
                    points={oneRepMaxPoints}
                    preference="max"
                    formatValue={(value) => formatSeriesValue('bestOneRepMax', formaCarga, value)}
                />
            )}
            {volumePoints.length > 0 && (
                <BarChart
                    title={formatSeriesTitle('bestVolume')}
                    points={volumePoints}
                    preference="max"
                    formatValue={(value) => formatSeriesValue('bestVolume', formaCarga, value)}
                />
            )}
        </div>
    )
}

function SessionEntry({ session }: { session: ExerciseSessionEntry }) {
    return (
        <div className="day-workout__exercise">
            <h3 className="day-workout__exercise-name">{formatDayMonth(session.date)}</h3>
            <ul className="day-workout__sets">
                {session.sets.map((set) => {
                    const planText = formatPlanText(set.planned, session.formaCarga, session.porLado)

                    return (
                        <li key={set.setIndex} className="day-workout__set">
                            <span className="day-workout__set-label">Série {set.setIndex}</span>
                            <div className="day-workout__set-body">
                                <span className="day-workout__set-value">
                                    {formatDoneText(set.done, session.formaCarga, session.porLado)}
                                    {planText && <span className="exercise-detail__plan"> {planText}</span>}
                                </span>
                                {set.drops.map((drop) => {
                                    const dropPlanText = formatPlanText(drop.planned, session.formaCarga, session.porLado)

                                    return (
                                        <span key={drop.dropIndex} className="day-workout__set-drop">
                                            {formatDropText(drop.done, session.formaCarga, session.porLado)}
                                            {dropPlanText && ` ${dropPlanText}`}
                                        </span>
                                    )
                                })}
                            </div>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
