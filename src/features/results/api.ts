import { getBodyWeightForDate, getSleepForDate } from '@/features/bodyMetrics/api'
import type { BodyWeightEntryRow, SleepEntryRow } from '@/features/bodyMetrics/types'
import { listActivityTypes, listCardioEntriesForDate } from '@/features/cardio/api'
import type { CardioActivityTypeRow, CardioEntryRow } from '@/features/cardio/types'
import { listFoodEntriesForDate } from '@/features/food/api'
import type { FoodEntryRow } from '@/features/food/types'
import { loadRoutineDataForDate } from '@/features/routine/api'
import { resolveRoutineForDate } from '@/features/routine/resolveRoutine'
import type { RoutineRow } from '@/features/routine/types'
import { deriveDaySignals } from '@/features/shared/daySignals'
import type { SetCorrectionPatch } from '@/features/results/setCorrection'
import { getSessionForDate } from '@/features/workout/api'
import type { WorkoutSessionRow, WorkoutSetDropRow, WorkoutSetRow } from '@/features/workout/types'
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
    workoutDrops: WorkoutSetDropRow[]
    cardioEntries: CardioEntryRow[]
    activityTypes: CardioActivityTypeRow[]
    foodEntries: FoodEntryRow[]
    bodyWeightEntry: BodyWeightEntryRow | null
    sleepEntry: SleepEntryRow | null
    routineRows: RoutineRow[]
}

export async function getDaySummary(date: IsoDate): Promise<DaySummary> {
    const [workout, cardioEntries, activityTypes, foodEntries, bodyWeightEntry, sleepEntry, routineData] =
        await Promise.all([
            getSessionForDate(date),
            listCardioEntriesForDate(date),
            listActivityTypes(),
            listFoodEntriesForDate(date),
            getBodyWeightForDate(date),
            getSleepForDate(date),
            loadRoutineDataForDate(date),
        ])

    const signals = deriveDaySignals({
        workoutResult: workout,
        foodEntries,
        bodyWeightEntry,
        sleepEntry,
        cardioEntries,
    })
    const routineRows = resolveRoutineForDate(date, routineData, signals)

    const daySummary: DaySummary = {
        workoutSession: workout?.session ?? null,
        workoutSets: workout?.sets ?? [],
        workoutDrops: workout?.drops ?? [],
        cardioEntries,
        activityTypes,
        foodEntries,
        bodyWeightEntry,
        sleepEntry,
        routineRows,
    }
    return daySummary
}

// Escrita direta, fora da fila de envio: a correção é feita com calma, depois
// do treino, e o erro de rede precisa aparecer na hora para quem está
// corrigindo. Só as colunas da medida, do RIR e do comentário vão no update;
// horários de conclusão e da sessão ficam intocados.
export async function correctWorkoutSet(setId: string, patch: SetCorrectionPatch): Promise<WorkoutSetRow> {
    const { data, error } = await supabase.from('workout_sets').update(patch).eq('id', setId).select('*').single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao corrigir a série')
    }

    return data
}
