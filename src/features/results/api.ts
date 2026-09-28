import { getBodyWeightForDate, getSleepForDate } from '@/features/bodyMetrics/api'
import type { BodyWeightEntryRow, SleepEntryRow } from '@/features/bodyMetrics/types'
import { listActivityTypes, listCardioEntriesForDate } from '@/features/cardio/api'
import type { CardioActivityTypeRow, CardioEntryRow } from '@/features/cardio/types'
import { listFoodEntriesForDate } from '@/features/food/api'
import type { FoodEntryRow } from '@/features/food/types'
import { getSessionForDate } from '@/features/workout/api'
import type { WorkoutSessionRow, WorkoutSetRow } from '@/features/workout/types'
import { supabase } from '@/lib/supabaseClient'
import type { IsoDate } from '@/lib/dateUtils'

export async function listFinishedSessionDates(sinceDate: IsoDate): Promise<IsoDate[]> {
    const { data, error } = await supabase
        .from('workout_sessions')
        .select('session_date')
        .not('finished_at', 'is', null)
        .gte('session_date', sinceDate)
        .order('session_date', { ascending: true })

    if (error) {
        throw new Error(error.message)
    }

    const sessionDates = (data ?? []).map((row) => row.session_date)
    return sessionDates
}

export type DaySummary = {
    workoutSession: WorkoutSessionRow | null
    workoutSets: WorkoutSetRow[]
    cardioEntries: CardioEntryRow[]
    activityTypes: CardioActivityTypeRow[]
    foodEntries: FoodEntryRow[]
    bodyWeightEntry: BodyWeightEntryRow | null
    sleepEntry: SleepEntryRow | null
}

export async function getDaySummary(date: IsoDate): Promise<DaySummary> {
    const [workout, cardioEntries, activityTypes, foodEntries, bodyWeightEntry, sleepEntry] = await Promise.all([
        getSessionForDate(date),
        listCardioEntriesForDate(date),
        listActivityTypes(),
        listFoodEntriesForDate(date),
        getBodyWeightForDate(date),
        getSleepForDate(date),
    ])

    const daySummary: DaySummary = {
        workoutSession: workout?.session ?? null,
        workoutSets: workout?.sets ?? [],
        cardioEntries,
        activityTypes,
        foodEntries,
        bodyWeightEntry,
        sleepEntry,
    }
    return daySummary
}
