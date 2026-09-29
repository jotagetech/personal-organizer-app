import type { BodyWeightEntryRow, SleepEntryRow } from '@/features/bodyMetrics/types'
import type { CardioActivityTypeRow, CardioEntryRow } from '@/features/cardio/types'
import { listDatesInPeriod, type ExportPeriod } from '@/features/export/period'
import { computeDailyTotals } from '@/features/food/dailyTotals'
import type { FoodEntryRow } from '@/features/food/types'
import { resolveRoutineForDate } from '@/features/routine/resolveRoutine'
import type { RoutineDayEntryRow, RoutineItemRow, RoutineRowSource, RoutineRowState } from '@/features/routine/types'
import { deriveDaySignals } from '@/features/shared/deriveDaySignals'
import { deriveSessionActiveWindow } from '@/features/workout/sessionDuration'
import { setStatusOf, type SetStatus } from '@/features/workout/sessionProgress'
import { setKey, type WorkoutSessionRow, type WorkoutSetRow } from '@/features/workout/types'
import type { IsoDate } from '@/lib/dateUtils'
import type { LoadConvention, SetMetric } from '@/lib/workoutPlanSchema'

export const EXPORT_FORMAT_VERSION = 1

export type PeriodExportRawData = {
    workoutSessions: WorkoutSessionRow[]
    workoutSets: WorkoutSetRow[]
    cardioEntries: CardioEntryRow[]
    activityTypes: CardioActivityTypeRow[]
    foodEntries: FoodEntryRow[]
    routineItems: RoutineItemRow[]
    routineEntries: RoutineDayEntryRow[]
    bodyWeightEntries: BodyWeightEntryRow[]
    sleepEntries: SleepEntryRow[]
}

export type PeriodExportMeta = {
    timezone: string
    generatedAt: string
    currentCycleStartDate: IsoDate | null
}

export type ExportedSet = {
    set_index: number
    status: SetStatus
    load_kg: number | null
    reps: number | null
    rir: number | null
    note: string | null
    duration_seconds: number | null
    distance_m: number | null
    completed_at: string | null
}

// target_min/target_max estão na unidade de `metric` (repetições, segundos ou
// metros); reps_min/reps_max repetem o alvo só quando a métrica é repetições,
// para quem já lia o arquivo antes das séries de tempo e distância.
export type ExportedPlannedSet = {
    set_index: number
    metric: SetMetric
    target_min: number
    target_max: number
    reps_min: number | null
    reps_max: number | null
    suggested_load_kg: number | null
}

export type ExportedExercise = {
    exercise_key: string
    name: string
    load_convention: LoadConvention
    planned: ExportedPlannedSet[]
    sets: ExportedSet[]
}

export type ExportedWorkout = {
    date: IsoDate
    workout_name: string
    workout_key: string
    first_set_completed_at: string | null
    last_set_completed_at: string | null
    finished_at: string | null
    duration_minutes: number | null
    feeling_scale: number | null
    feeling_note: string | null
    exercises: ExportedExercise[]
}

export type ExportedCardio = {
    date: IsoDate
    activity: string
    duration_minutes: number
    distance_km: number | null
    feeling_scale: number
    feeling_note: string | null
    note: string | null
}

export type ExportedFood = {
    date: IsoDate
    meal: string
    food: string
    quantity: number
    unit: string
    kcal: number | null
    protein_g: number | null
    carbs_g: number | null
    fat_g: number | null
}

export type ExportedFoodDailyTotals = {
    date: IsoDate
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    entries_without_nutrition: number
}

export type ExportedRoutineItem = {
    title: string
    source: RoutineRowSource
    state: RoutineRowState
    due_date: IsoDate | null
    overdue: boolean
}

export type PeriodExport = {
    meta: {
        period: ExportPeriod
        timezone: string
        generated_at: string
        format_version: number
        current_cycle_start_date: IsoDate | null
        units: { load: 'kg'; weight: 'kg'; sleep: 'hours'; distance: 'km'; duration: 'minutes' }
    }
    workouts: ExportedWorkout[]
    cardio: ExportedCardio[]
    food: ExportedFood[]
    food_daily_totals: ExportedFoodDailyTotals[]
    routine: { date: IsoDate; items: ExportedRoutineItem[] }[]
    body_weight: { date: IsoDate; weight_kg: number }[]
    sleep: { date: IsoDate; hours: number }[]
}

function isInPeriod(date: IsoDate, period: ExportPeriod): boolean {
    return date >= period.start && date <= period.end
}

function byDateThenCreation<T extends { created_at: string }>(dateOf: (row: T) => IsoDate) {
    return (rowA: T, rowB: T): number => {
        const dateComparison = dateOf(rowA).localeCompare(dateOf(rowB))
        if (dateComparison !== 0) {
            return dateComparison
        }

        return rowA.created_at.localeCompare(rowB.created_at)
    }
}

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
    const groups = new Map<string, T[]>()
    for (const row of rows) {
        const key = keyOf(row)
        const group = groups.get(key)
        if (group) {
            group.push(row)
        } else {
            groups.set(key, [row])
        }
    }

    return groups
}

function durationInMinutes(startIso: string, endIso: string): number {
    return Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000))
}

// Séries seguem a ordem da ficha congelada na sessão, então uma série ainda
// não registrada aparece como pendente em vez de sumir do exercício.
function buildWorkout(session: WorkoutSessionRow, sets: WorkoutSetRow[]): ExportedWorkout {
    const setsByKey = new Map(sets.map((set) => [setKey(set.exercise_key, set.set_index), set]))
    const activeWindow = deriveSessionActiveWindow(sets)

    const exercises = session.workout_snapshot.exercicios.map((exercicio): ExportedExercise => ({
        exercise_key: exercicio.exercise_key,
        name: exercicio.nome,
        load_convention: exercicio.forma_carga,
        planned: exercicio.series.map((serie): ExportedPlannedSet => {
            const isRepsSet = serie.metrica === 'repeticoes'
            return {
                set_index: serie.set_index,
                metric: serie.metrica,
                target_min: serie.alvo_min,
                target_max: serie.alvo_max,
                reps_min: isRepsSet ? serie.alvo_min : null,
                reps_max: isRepsSet ? serie.alvo_max : null,
                suggested_load_kg: serie.carga_sugerida,
            }
        }),
        sets: exercicio.series.map((serie) => {
            const row = setsByKey.get(setKey(exercicio.exercise_key, serie.set_index))
            return {
                set_index: serie.set_index,
                status: setStatusOf(row),
                load_kg: row?.load_kg ?? null,
                reps: row?.reps ?? null,
                rir: row?.rir ?? null,
                note: row?.note ?? null,
                duration_seconds: row?.duration_seconds ?? null,
                distance_m: row?.distance_m ?? null,
                completed_at: row?.completed_at ?? null,
            }
        }),
    }))

    return {
        date: session.session_date,
        workout_name: session.workout_snapshot.nome,
        workout_key: session.workout_key,
        first_set_completed_at: activeWindow?.startIso ?? null,
        last_set_completed_at: activeWindow?.endIso ?? null,
        finished_at: session.finished_at,
        duration_minutes: activeWindow ? durationInMinutes(activeWindow.startIso, activeWindow.endIso) : null,
        feeling_scale: session.feeling_scale,
        feeling_note: session.feeling_note,
        exercises,
    }
}

function buildRoutine(
    period: ExportPeriod,
    raw: PeriodExportRawData,
    sessionsInPeriod: WorkoutSessionRow[],
    setsBySessionId: Map<string, WorkoutSetRow[]>,
    foodByDate: Map<string, FoodEntryRow[]>,
    cardioByDate: Map<string, CardioEntryRow[]>,
): PeriodExport['routine'] {
    const sessionByDate = new Map(sessionsInPeriod.map((session) => [session.session_date, session]))
    const bodyWeightByDate = new Map(raw.bodyWeightEntries.map((entry) => [entry.entry_date, entry]))
    const sleepByDate = new Map(raw.sleepEntries.map((entry) => [entry.entry_date, entry]))

    return listDatesInPeriod(period)
        .map((date) => {
            const session = sessionByDate.get(date)
            const signals = deriveDaySignals({
                workoutResult: session ? { session, sets: setsBySessionId.get(session.id) ?? [] } : null,
                foodEntries: foodByDate.get(date) ?? [],
                bodyWeightEntry: bodyWeightByDate.get(date) ?? null,
                sleepEntry: sleepByDate.get(date) ?? null,
                cardioEntries: cardioByDate.get(date) ?? [],
            })
            const rows = resolveRoutineForDate(date, raw.routineItems, raw.routineEntries, signals)
            const items = rows.map(
                (row): ExportedRoutineItem => ({
                    title: row.title,
                    source: row.source,
                    state: row.state,
                    due_date: row.dueDate,
                    overdue: row.deadline === 'overdue',
                }),
            )

            return { date, items }
        })
        .filter((day) => day.items.length > 0)
}

// Montagem pura do arquivo exportado: recebe as linhas cruas já buscadas e
// devolve um JSON desnormalizado (nomes no lugar de ids, sem user_id), pensado
// pra ser lido por máquina fora do app.
export function buildPeriodExport(raw: PeriodExportRawData, period: ExportPeriod, meta: PeriodExportMeta): PeriodExport {
    const sessionsInPeriod = raw.workoutSessions
        .filter((session) => isInPeriod(session.session_date, period))
        .sort(byDateThenCreation((session) => session.session_date))
    const setsBySessionId = groupBy(raw.workoutSets, (set) => set.session_id)
    const cardioInPeriod = raw.cardioEntries
        .filter((entry) => isInPeriod(entry.entry_date, period))
        .sort(byDateThenCreation((entry) => entry.entry_date))
    const foodInPeriod = raw.foodEntries
        .filter((entry) => isInPeriod(entry.entry_date, period))
        .sort(byDateThenCreation((entry) => entry.entry_date))
    const foodByDate = groupBy(foodInPeriod, (entry) => entry.entry_date)
    const cardioByDate = groupBy(cardioInPeriod, (entry) => entry.entry_date)
    const activityNameById = new Map(raw.activityTypes.map((activityType) => [activityType.id, activityType.name]))

    return {
        meta: {
            period,
            timezone: meta.timezone,
            generated_at: meta.generatedAt,
            format_version: EXPORT_FORMAT_VERSION,
            current_cycle_start_date: meta.currentCycleStartDate,
            units: { load: 'kg', weight: 'kg', sleep: 'hours', distance: 'km', duration: 'minutes' },
        },
        workouts: sessionsInPeriod.map((session) => buildWorkout(session, setsBySessionId.get(session.id) ?? [])),
        cardio: cardioInPeriod.map((entry) => ({
            date: entry.entry_date,
            activity: activityNameById.get(entry.activity_type_id) ?? 'Atividade',
            duration_minutes: entry.duration_minutes,
            distance_km: entry.distance_km,
            feeling_scale: entry.feeling_scale,
            feeling_note: entry.feeling_note,
            note: entry.note,
        })),
        food: foodInPeriod.map((entry) => ({
            date: entry.entry_date,
            meal: entry.meal_category,
            food: entry.food_name,
            quantity: entry.quantity,
            unit: entry.unit,
            kcal: entry.kcal,
            protein_g: entry.protein_g,
            carbs_g: entry.carbs_g,
            fat_g: entry.fat_g,
        })),
        food_daily_totals: Array.from(foodByDate.entries()).map(([date, entries]) => {
            const totals = computeDailyTotals(entries)
            return {
                date,
                kcal: totals.kcal,
                protein_g: totals.proteinG,
                carbs_g: totals.carbsG,
                fat_g: totals.fatG,
                entries_without_nutrition: totals.entriesWithoutNutrition,
            }
        }),
        routine: buildRoutine(period, raw, sessionsInPeriod, setsBySessionId, foodByDate, cardioByDate),
        body_weight: raw.bodyWeightEntries
            .filter((entry) => isInPeriod(entry.entry_date, period))
            .sort(byDateThenCreation((entry) => entry.entry_date))
            .map((entry) => ({ date: entry.entry_date, weight_kg: entry.weight_kg })),
        sleep: raw.sleepEntries
            .filter((entry) => isInPeriod(entry.entry_date, period))
            .sort(byDateThenCreation((entry) => entry.entry_date))
            .map((entry) => ({ date: entry.entry_date, hours: entry.hours })),
    }
}

function pluralize(count: number, singular: string, plural: string): string {
    return `${count} ${count === 1 ? singular : plural}`
}

// Linha única de resumo mostrada depois de gerar: dá pra conferir de relance
// se o período trouxe o que se esperava, sem abrir o JSON.
export function summarizePeriodExport(periodExport: PeriodExport): string {
    const completedSetCount = periodExport.workouts
        .flatMap((workout) => workout.exercises)
        .flatMap((exercise) => exercise.sets)
        .filter((set) => set.status === 'completed').length
    const routineItemCount = periodExport.routine.reduce((sum, day) => sum + day.items.length, 0)

    return [
        pluralize(periodExport.workouts.length, 'treino', 'treinos'),
        pluralize(completedSetCount, 'série concluída', 'séries concluídas'),
        pluralize(periodExport.cardio.length, 'cardio', 'cardios'),
        pluralize(periodExport.food.length, 'alimento', 'alimentos'),
        pluralize(routineItemCount, 'item de rotina', 'itens de rotina'),
        pluralize(periodExport.body_weight.length, 'peso', 'pesos'),
        pluralize(periodExport.sleep.length, 'sono', 'sonos'),
    ].join(', ')
}

export function exportFileName(period: ExportPeriod): string {
    return `organizer-export_${period.start}_${period.end}.json`
}
