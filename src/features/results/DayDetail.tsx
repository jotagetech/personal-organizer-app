import { useEffect, useState } from 'react'
import { ChevronRight, Dumbbell, HeartPulse, Moon, Scale, Utensils, type LucideIcon } from 'lucide-react'

import { useAppNavigation } from '@/contexts/AppNavigationContext'
import type { BodyWeightEntryRow, SleepEntryRow } from '@/features/bodyMetrics/types'
import { activityTypeName, feelingEmoji } from '@/features/cardio/types'
import type { CardioActivityTypeRow, CardioEntryRow } from '@/features/cardio/types'
import { computeDailyTotals, lacksNutrition } from '@/features/food/dailyTotals'
import { FOOD_UNIT_LABELS, MEAL_CATEGORIES, MEAL_CATEGORY_LABELS } from '@/features/food/types'
import type { FoodEntryRow, FoodUnit } from '@/features/food/types'
import { getDaySummary, type DaySummary } from '@/features/results/api'
import { buildDayReport, type DayReport, type DayReportPendingItem } from '@/features/results/dayReport'
import { summarizeWorkoutSets, type WorkoutExerciseSummary, type WorkoutSetSummary } from '@/features/results/daySummary'
import { formatDropResult, formatSetResult } from '@/features/results/setResultText'
import { formatIntervalPrescription, formatIntervalResult } from '@/features/workout/intervalPresentation'
import { formatPlanWeekLabel } from '@/features/workout/planWeek'
import { formatDurationMinutes, resolveSessionDuration } from '@/features/workout/sessionDuration'
import type { SetStatus } from '@/features/workout/sessionProgress'
import type {
    WorkoutSessionRow,
    WorkoutSetDropRow,
    WorkoutSetRow,
    WorkoutSnapshotInterval,
} from '@/features/workout/types'
import { todayInTimezone, type IsoDate } from '@/lib/dateUtils'

const SECTION_ICON_SIZE = 18
const LINK_ICON_SIZE = 16
const PERCENT = 100

type DayDetailProps = {
    selectedDate: IsoDate
}

export function DayDetail({ selectedDate }: DayDetailProps) {
    const { goToTab } = useAppNavigation()
    const [summary, setSummary] = useState<DaySummary | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    async function loadSummary() {
        setIsLoading(true)
        setErrorMessage(null)
        try {
            const nextSummary = await getDaySummary(selectedDate)
            setSummary(nextSummary)
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : 'Falha ao carregar o dia selecionado'
            setErrorMessage(message)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        void loadSummary()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate])

    if (isLoading) {
        return <p className="day-detail__loading text-muted">Carregando dia selecionado...</p>
    }

    if (errorMessage) {
        return (
            <div className="error-list">
                Falha ao carregar o dia selecionado: {errorMessage}
                <button type="button" className="secondary-button error-list__retry" onClick={loadSummary}>
                    Tentar de novo
                </button>
            </div>
        )
    }

    if (!summary) {
        return null
    }

    const today = todayInTimezone()
    const report = buildDayReport(summary, summary.routineRows, selectedDate, today)

    return (
        <div className="day-detail">
            <DayReportSection report={report} isToday={selectedDate === today} />
            <WorkoutDaySection
                session={summary.workoutSession}
                sets={summary.workoutSets}
                drops={summary.workoutDrops}
                onOpenWorkout={() => goToTab('treino')}
            />
            <CardioDaySection entries={summary.cardioEntries} activityTypes={summary.activityTypes} />
            <FoodDaySection entries={summary.foodEntries} onOpenFood={() => goToTab('alimentacao')} />
            <BodyMetricsDaySection bodyWeightEntry={summary.bodyWeightEntry} sleepEntry={summary.sleepEntry} />
        </div>
    )
}

type SectionHeaderProps = {
    icon: LucideIcon
    title: string
    actionLabel?: string
    onAction?: () => void
}

function SectionHeader({ icon: Icon, title, actionLabel, onAction }: SectionHeaderProps) {
    return (
        <div className="day-detail__header">
            <span className="day-detail__icon">
                <Icon size={SECTION_ICON_SIZE} aria-hidden="true" />
            </span>
            <h3 className="section-title day-detail__title">{title}</h3>
            {actionLabel && onAction && (
                <button type="button" className="ghost-button day-detail__action" onClick={onAction}>
                    {actionLabel}
                    <ChevronRight size={LINK_ICON_SIZE} aria-hidden="true" />
                </button>
            )}
        </div>
    )
}

type DayReportSectionProps = {
    report: DayReport
    isToday: boolean
}

function DayReportSection({ report, isToday }: DayReportSectionProps) {
    const routineProgressPercent =
        report.routineTotalCount > 0 ? (report.routineDoneCount / report.routineTotalCount) * PERCENT : 0

    return (
        <div className="card day-report">
            <h2 className="day-report__eyebrow">{isToday ? 'Hoje' : 'Dia selecionado'}</h2>
            <p className="day-report__headline">{report.headline}</p>
            {report.routineTotalCount > 0 && (
                <div className="day-report__routine">
                    <p className="day-report__routine-count">
                        <span className="text-secondary">Rotina:</span>{' '}
                        <strong>{report.routineDoneCount}</strong> de {report.routineTotalCount} feitos
                    </p>
                    <div className="day-report__progress" aria-hidden="true">
                        <div className="day-report__progress-fill" style={{ width: `${routineProgressPercent}%` }} />
                    </div>
                </div>
            )}
            {report.pendingItems.length > 0 && (
                <div className="day-report__pending">
                    <p className="day-report__pending-label">{isToday ? 'Ainda falta: ' : 'Não foi feito: '}</p>
                    <ul className="day-report__chips">
                        {report.pendingItems.map((item) => (
                            <li key={item.title} className={pendingChipClassName(item)}>
                                {item.title}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {report.highlights.length > 0 && (
                <ul className="day-report__highlights">
                    {report.highlights.map((highlight) => (
                        <li key={highlight}>{highlight}</li>
                    ))}
                </ul>
            )}
        </div>
    )
}

function pendingChipClassName(item: DayReportPendingItem): string {
    const className = item.isOverdue ? 'day-report__chip day-report__chip--overdue' : 'day-report__chip'

    return className
}

type WorkoutDaySectionProps = {
    session: WorkoutSessionRow | null
    sets: WorkoutSetRow[]
    drops: WorkoutSetDropRow[]
    onOpenWorkout: () => void
}

function WorkoutDaySection({ session, sets, drops, onOpenWorkout }: WorkoutDaySectionProps) {
    return (
        <div className="card">
            <SectionHeader icon={Dumbbell} title="Treino" actionLabel="Abrir no Treino" onAction={onOpenWorkout} />
            {session ? (
                <WorkoutSessionDetail session={session} sets={sets} drops={drops} />
            ) : (
                <p className="day-detail__empty">Nenhum treino registrado neste dia.</p>
            )}
        </div>
    )
}

type WorkoutSessionDetailProps = {
    session: WorkoutSessionRow
    sets: WorkoutSetRow[]
    drops: WorkoutSetDropRow[]
}

function WorkoutSessionDetail({ session, sets, drops }: WorkoutSessionDetailProps) {
    const workoutSummary = summarizeWorkoutSets(session.workout_snapshot, sets, drops)
    const activeWindow = resolveSessionDuration(session, sets)
    const { semana_bloco: blockWeek, bloco_semanas: blockWeeks } = session.workout_snapshot
    const finishedDetailParts = session.finished_at
        ? [
              activeWindow ? `Duração: ${formatDurationMinutes(activeWindow.startIso, activeWindow.endIso)}` : null,
              session.feeling_scale !== null ? feelingEmoji(session.feeling_scale) : null,
          ]
        : []
    const sessionDetailParts = [
        blockWeek !== null && blockWeeks !== null ? formatPlanWeekLabel(blockWeek, blockWeeks) : null,
        ...finishedDetailParts,
    ].filter((part): part is string => part !== null)

    return (
        <div>
            <p className="day-workout__name">{session.workout_snapshot.nome}</p>
            {sessionDetailParts.length > 0 && (
                <p className="day-workout__meta">{sessionDetailParts.join(' · ')}</p>
            )}
            {session.feeling_note && <p className="day-workout__note">{session.feeling_note}</p>}
            <div className="day-workout__exercises">
                {workoutSummary.exercises.map((exercise) => (
                    <WorkoutExerciseDetail key={exercise.exerciseKey} exercise={exercise} />
                ))}
            </div>
            {workoutSummary.orphanSets.length > 0 && (
                <p className="day-workout__orphans">
                    {workoutSummary.orphanSets.length} série(s) de um treino trocado depois, sem exercício
                    correspondente no plano atual.
                </p>
            )}
        </div>
    )
}

// O intervalado vira uma linha só, com o que foi feito ("8 × 30 s / 90 s ·
// RPE 8") e, embaixo, a meta do dia; rodada por rodada fica na exportação.
type IntervalExerciseDetailProps = {
    exercise: WorkoutExerciseSummary
    interval: WorkoutSnapshotInterval
}

function IntervalExerciseDetail({ exercise, interval }: IntervalExerciseDetailProps) {
    const rounds = exercise.sets.map((set) => ({
        status: set.status,
        durationSeconds: set.durationSeconds,
        rpe: set.rpe,
    }))

    return (
        <div className="day-workout__exercise">
            <p className="day-workout__exercise-name">
                {exercise.exerciseName} · {interval.modalidade}
            </p>
            <ul className="day-workout__sets">
                <li className="day-workout__set">
                    <span className="day-workout__set-label">Feito</span>
                    <div className="day-workout__set-body">
                        <span className="day-workout__set-value">{formatIntervalResult(interval, rounds)}</span>
                        <span className="day-workout__set-drop">meta {formatIntervalPrescription(interval)}</span>
                    </div>
                </li>
            </ul>
        </div>
    )
}

function WorkoutExerciseDetail({ exercise }: { exercise: WorkoutExerciseSummary }) {
    if (exercise.interval) {
        return <IntervalExerciseDetail exercise={exercise} interval={exercise.interval} />
    }

    return (
        <div className="day-workout__exercise">
            <p className="day-workout__exercise-name">{exercise.exerciseName}</p>
            <ul className="day-workout__sets">
                {exercise.sets.map((set) => (
                    <li key={set.setIndex} className={SET_STATUS_CLASS_NAMES[set.status]}>
                        <span className="day-workout__set-label">Série {set.setIndex}</span>
                        <div className="day-workout__set-body">
                            <span className="day-workout__set-value">{formatSetSummary(set, exercise)}</span>
                            {set.status === 'completed' &&
                                set.drops.map((drop, dropPosition) => (
                                    <span key={dropPosition} className="day-workout__set-drop">
                                        {formatDropResult(exercise.loadConvention, set.metric, drop, exercise.perSide)}
                                    </span>
                                ))}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    )
}

const SET_STATUS_CLASS_NAMES: Record<SetStatus, string> = {
    completed: 'day-workout__set',
    skipped: 'day-workout__set day-workout__set--skipped',
    pending: 'day-workout__set day-workout__set--pending',
}

function formatSetSummary(set: WorkoutSetSummary, exercise: WorkoutExerciseSummary): string {
    if (set.status === 'skipped') {
        return set.note ? `pulada · ${set.note}` : 'pulada'
    }
    if (set.status === 'pending') {
        return 'não registrada'
    }

    const resultText = formatSetResult(exercise.loadConvention, set.metric, set, exercise.perSide)
    const rirText = set.rir !== null ? ` · RIR ${set.rir}` : ''
    const noteText = set.note ? ` · ${set.note}` : ''
    const setSummaryText = `${resultText}${rirText}${noteText}`

    return setSummaryText
}

type CardioDaySectionProps = {
    entries: CardioEntryRow[]
    activityTypes: CardioActivityTypeRow[]
}

function CardioDaySection({ entries, activityTypes }: CardioDaySectionProps) {
    return (
        <div className="card">
            <SectionHeader icon={HeartPulse} title="Cardio" />
            {entries.length === 0 ? (
                <p className="day-detail__empty">Nenhum cardio registrado neste dia.</p>
            ) : (
                <div className="food-list">
                    {entries.map((entry) => (
                        <div key={entry.id} className="food-list__row">
                            <div className="food-list__text">
                                <strong className="food-list__name">
                                    {activityTypeName(activityTypes, entry.activity_type_id)}
                                </strong>
                                <p className="food-list__meta">
                                    {entry.distance_km !== null ? `${entry.distance_km} km · ` : ''}
                                    {feelingEmoji(entry.feeling_scale)}
                                </p>
                            </div>
                            <div className="food-list__value">
                                <strong>{entry.duration_minutes}</strong>
                                <span>min</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

type FoodDaySectionProps = {
    entries: FoodEntryRow[]
    onOpenFood: () => void
}

function FoodDaySection({ entries, onOpenFood }: FoodDaySectionProps) {
    const dailyTotals = computeDailyTotals(entries)

    return (
        <div className="card">
            <SectionHeader icon={Utensils} title="Alimentação" actionLabel="Abrir em Alimentação" onAction={onOpenFood} />
            {entries.length === 0 ? (
                <p className="day-detail__empty">Nenhum consumo registrado neste dia.</p>
            ) : (
                <>
                    <div className="daily-totals-card__kcal">
                        <strong>{dailyTotals.kcal}</strong>
                        <span>kcal</span>
                    </div>
                    <div className="daily-totals-card__macros day-food__macros">
                        <MacroStat label="Proteína" grams={dailyTotals.proteinG} />
                        <MacroStat label="Carbo" grams={dailyTotals.carbsG} />
                        <MacroStat label="Gordura" grams={dailyTotals.fatG} />
                    </div>
                    {MEAL_CATEGORIES.map((mealCategory) => {
                        const entriesForMeal = entries.filter((entry) => entry.meal_category === mealCategory)
                        if (entriesForMeal.length === 0) {
                            return null
                        }

                        return (
                            <div key={mealCategory} className="day-food__meal">
                                <h4 className="food-entry-list__meal-title">{MEAL_CATEGORY_LABELS[mealCategory]}</h4>
                                <div className="food-list">
                                    {entriesForMeal.map((entry) => (
                                        <div
                                            key={entry.id}
                                            className={
                                                lacksNutrition(entry)
                                                    ? 'food-list__row food-list__row--no-nutrition'
                                                    : 'food-list__row'
                                            }
                                        >
                                            <div className="food-list__text">
                                                <strong className="food-list__name">{entry.food_name}</strong>
                                                <p className="food-list__meta">
                                                    {entry.quantity} {FOOD_UNIT_LABELS[entry.unit as FoodUnit]}
                                                </p>
                                            </div>
                                            {entry.kcal !== null && (
                                                <div className="food-list__value">
                                                    <strong>{entry.kcal}</strong>
                                                    <span>kcal</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </>
            )}
        </div>
    )
}

type MacroStatProps = {
    label: string
    grams: number
}

function MacroStat({ label, grams }: MacroStatProps) {
    return (
        <div className="daily-totals-card__macro">
            <span className="daily-totals-card__macro-label">{label}</span>
            <span className="daily-totals-card__macro-value">
                {grams}
                <span className="daily-totals-card__macro-unit">g</span>
            </span>
        </div>
    )
}

type BodyMetricsDaySectionProps = {
    bodyWeightEntry: BodyWeightEntryRow | null
    sleepEntry: SleepEntryRow | null
}

function BodyMetricsDaySection({ bodyWeightEntry, sleepEntry }: BodyMetricsDaySectionProps) {
    return (
        <div className="card">
            <SectionHeader icon={Scale} title="Peso e sono" />
            <dl className="stat-grid">
                <MetricStat icon={Scale} label="Peso" value={bodyWeightEntry?.weight_kg ?? null} unit="kg" />
                <MetricStat icon={Moon} label="Sono" value={sleepEntry?.hours ?? null} unit="horas" />
            </dl>
        </div>
    )
}

type MetricStatProps = {
    icon: LucideIcon
    label: string
    value: number | null
    unit: string
}

function MetricStat({ icon: Icon, label, value, unit }: MetricStatProps) {
    return (
        <div className="stat-grid__item">
            <dt className="stat-grid__label">
                <Icon size={LINK_ICON_SIZE} aria-hidden="true" />
                {label}
            </dt>
            {value !== null ? (
                <dd className="stat-grid__value">
                    {value}
                    <span className="stat-grid__unit">{unit}</span>
                </dd>
            ) : (
                <dd className="stat-grid__missing">não registrado</dd>
            )}
        </div>
    )
}
