import { useEffect, useState } from 'react'

import { useAppNavigation } from '@/contexts/AppNavigationContext'
import type { BodyWeightEntryRow, SleepEntryRow } from '@/features/bodyMetrics/types'
import { activityTypeName, feelingEmoji } from '@/features/cardio/types'
import type { CardioActivityTypeRow, CardioEntryRow } from '@/features/cardio/types'
import { computeDailyTotals } from '@/features/food/dailyTotals'
import { FOOD_UNIT_LABELS, MEAL_CATEGORIES, MEAL_CATEGORY_LABELS } from '@/features/food/types'
import type { FoodEntryRow, FoodUnit } from '@/features/food/types'
import { getDaySummary, type DaySummary } from '@/features/results/api'
import { summarizeWorkoutSets, type WorkoutExerciseSummary, type WorkoutSetSummary } from '@/features/results/daySummary'
import { formatSessionDuration } from '@/features/workout/WorkoutFinishPanel'
import type { WorkoutSessionRow, WorkoutSetRow } from '@/features/workout/types'
import type { IsoDate } from '@/lib/dateUtils'

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
        return <p>Carregando dia selecionado...</p>
    }

    if (errorMessage) {
        return (
            <div className="error-list">
                Falha ao carregar o dia selecionado: {errorMessage}
                <button
                    type="button"
                    className="secondary-button"
                    style={{ display: 'block', marginTop: 8 }}
                    onClick={loadSummary}
                >
                    Tentar de novo
                </button>
            </div>
        )
    }

    if (!summary) {
        return null
    }

    return (
        <div>
            <h2 style={{ fontSize: 16 }}>Dia selecionado</h2>
            <WorkoutDaySection
                session={summary.workoutSession}
                sets={summary.workoutSets}
                onOpenWorkout={() => goToTab('treino')}
            />
            <CardioDaySection entries={summary.cardioEntries} activityTypes={summary.activityTypes} />
            <FoodDaySection entries={summary.foodEntries} onOpenFood={() => goToTab('alimentacao')} />
            <BodyMetricsDaySection bodyWeightEntry={summary.bodyWeightEntry} sleepEntry={summary.sleepEntry} />
        </div>
    )
}

type WorkoutDaySectionProps = {
    session: WorkoutSessionRow | null
    sets: WorkoutSetRow[]
    onOpenWorkout: () => void
}

function WorkoutDaySection({ session, sets, onOpenWorkout }: WorkoutDaySectionProps) {
    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: 14, margin: 0 }}>Treino</h3>
                <button type="button" className="secondary-button" onClick={onOpenWorkout}>
                    Abrir no Treino
                </button>
            </div>
            {session ? (
                <WorkoutSessionDetail session={session} sets={sets} />
            ) : (
                <p style={{ color: '#71717a' }}>Nenhum treino registrado neste dia.</p>
            )}
        </div>
    )
}

function WorkoutSessionDetail({ session, sets }: { session: WorkoutSessionRow; sets: WorkoutSetRow[] }) {
    const workoutSummary = summarizeWorkoutSets(session.workout_snapshot, sets)

    return (
        <div>
            <p style={{ fontWeight: 600, margin: '0 0 4px' }}>{session.workout_snapshot.nome}</p>
            {session.finished_at && (
                <p style={{ fontSize: 13, color: '#52525b', margin: '0 0 8px' }}>
                    Duração: {formatSessionDuration(session.created_at, session.finished_at)}
                    {session.feeling_scale !== null ? ` · ${feelingEmoji(session.feeling_scale)}` : ''}
                </p>
            )}
            {session.feeling_note && <p style={{ fontSize: 13, margin: '0 0 8px' }}>{session.feeling_note}</p>}
            {workoutSummary.exercises.map((exercise) => (
                <WorkoutExerciseDetail key={exercise.exerciseKey} exercise={exercise} />
            ))}
            {workoutSummary.orphanSets.length > 0 && (
                <p style={{ fontSize: 12, color: '#71717a', marginTop: 8 }}>
                    {workoutSummary.orphanSets.length} série(s) de um treino trocado depois, sem exercício
                    correspondente no plano atual.
                </p>
            )}
        </div>
    )
}

function WorkoutExerciseDetail({ exercise }: { exercise: WorkoutExerciseSummary }) {
    return (
        <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 4px' }}>{exercise.exerciseName}</p>
            {exercise.sets.map((set) => (
                <p
                    key={set.setIndex}
                    style={{ fontSize: 13, margin: '0 0 2px', color: set.isCompleted ? '#18181b' : '#a1a1aa' }}
                >
                    Série {set.setIndex}: {formatSetSummary(set)}
                </p>
            ))}
        </div>
    )
}

function formatSetSummary(set: WorkoutSetSummary): string {
    if (!set.isCompleted) {
        return 'não registrada'
    }

    const loadText = set.loadKg !== null ? `${set.loadKg} kg` : '?'
    const repsText = set.reps !== null ? `${set.reps} reps` : '?'
    const rirText = set.rir !== null ? ` · RIR ${set.rir}` : ''
    const noteText = set.note ? ` · ${set.note}` : ''
    const setSummaryText = `${loadText} × ${repsText}${rirText}${noteText}`

    return setSummaryText
}

type CardioDaySectionProps = {
    entries: CardioEntryRow[]
    activityTypes: CardioActivityTypeRow[]
}

function CardioDaySection({ entries, activityTypes }: CardioDaySectionProps) {
    return (
        <div className="card">
            <h3 style={{ fontSize: 14, marginTop: 0 }}>Cardio</h3>
            {entries.length === 0 ? (
                <p style={{ color: '#71717a' }}>Nenhum cardio registrado neste dia.</p>
            ) : (
                entries.map((entry) => (
                    <p key={entry.id} style={{ fontSize: 13, margin: '0 0 4px' }}>
                        {activityTypeName(activityTypes, entry.activity_type_id)} · {entry.duration_minutes} min
                        {entry.distance_km !== null ? ` · ${entry.distance_km} km` : ''}
                        {` · ${feelingEmoji(entry.feeling_scale)}`}
                    </p>
                ))
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: 14, margin: 0 }}>Alimentação</h3>
                <button type="button" className="secondary-button" onClick={onOpenFood}>
                    Abrir em Alimentação
                </button>
            </div>
            {entries.length === 0 ? (
                <p style={{ color: '#71717a' }}>Nenhum consumo registrado neste dia.</p>
            ) : (
                <>
                    <p style={{ fontSize: 13, color: '#52525b' }}>
                        {dailyTotals.kcal} kcal · {dailyTotals.proteinG} g P · {dailyTotals.carbsG} g C ·{' '}
                        {dailyTotals.fatG} g G
                    </p>
                    {MEAL_CATEGORIES.map((mealCategory) => {
                        const entriesForMeal = entries.filter((entry) => entry.meal_category === mealCategory)
                        if (entriesForMeal.length === 0) {
                            return null
                        }

                        return (
                            <div key={mealCategory} style={{ marginBottom: 8 }}>
                                <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 2px' }}>
                                    {MEAL_CATEGORY_LABELS[mealCategory]}
                                </p>
                                {entriesForMeal.map((entry) => (
                                    <p key={entry.id} style={{ fontSize: 13, margin: '0 0 2px' }}>
                                        {entry.food_name} · {entry.quantity} {FOOD_UNIT_LABELS[entry.unit as FoodUnit]}
                                        {entry.kcal !== null ? ` · ${entry.kcal} kcal` : ''}
                                    </p>
                                ))}
                            </div>
                        )
                    })}
                </>
            )}
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
            <h3 style={{ fontSize: 14, marginTop: 0 }}>Peso e sono</h3>
            <p style={{ fontSize: 13, margin: '0 0 2px' }}>
                Peso: {bodyWeightEntry ? `${bodyWeightEntry.weight_kg} kg` : 'não registrado'}
            </p>
            <p style={{ fontSize: 13, margin: 0 }}>
                Sono: {sleepEntry ? `${sleepEntry.hours} horas` : 'não registrado'}
            </p>
        </div>
    )
}
