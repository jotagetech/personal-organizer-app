import type { BodyWeightEntryRow, SleepEntryRow } from '@/features/bodyMetrics/types'
import { listActivityTypes } from '@/features/cardio/api'
import type { CardioEntryRow } from '@/features/cardio/types'
import { getCurrentCycle } from '@/features/cycle/api'
import type { PeriodExportMeta, PeriodExportRawData } from '@/features/export/buildPeriodExport'
import type { ExportPeriod } from '@/features/export/period'
import type { FoodEntryRow } from '@/features/food/types'
import { listRoutineItems } from '@/features/routine/api'
import type { RoutineDayEntryRow } from '@/features/routine/types'
import type { WorkoutSessionRow, WorkoutSetRow } from '@/features/workout/types'
import { DEFAULT_TIMEZONE } from '@/lib/dateUtils'
import { supabase } from '@/lib/supabaseClient'

// O PostgREST corta cada resposta no max-rows do projeto (1000 por padrão), e
// um ano de alimentação ou de séries passa disso com folga; por isso as
// buscas por intervalo vêm em páginas até a última voltar incompleta.
const PAGE_SIZE = 1000

type PageResult<Row> = { data: Row[] | null; error: { message: string } | null }

async function fetchAllPages<Row>(fetchPage: (from: number, to: number) => PromiseLike<PageResult<Row>>): Promise<Row[]> {
    const rows: Row[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1)
        if (error) {
            throw new Error(error.message)
        }

        const page = data ?? []
        rows.push(...page)
        if (page.length < PAGE_SIZE) {
            return rows
        }
    }
}

function listWorkoutSessionsInPeriod(period: ExportPeriod): Promise<WorkoutSessionRow[]> {
    return fetchAllPages((from, to) =>
        supabase
            .from('workout_sessions')
            .select('*')
            .gte('session_date', period.start)
            .lte('session_date', period.end)
            .order('session_date', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
    )
}

// Os ids vão na query string do filtro "in"; em lotes, um ano de sessões não
// estoura o limite de tamanho de URL dos proxies no caminho.
const SESSION_IDS_PER_REQUEST = 100

async function listWorkoutSetsForSessions(sessionIds: string[]): Promise<WorkoutSetRow[]> {
    const idBatches: string[][] = []
    for (let start = 0; start < sessionIds.length; start += SESSION_IDS_PER_REQUEST) {
        idBatches.push(sessionIds.slice(start, start + SESSION_IDS_PER_REQUEST))
    }

    const setsPerBatch = await Promise.all(
        idBatches.map((idBatch) =>
            fetchAllPages<WorkoutSetRow>((from, to) =>
                supabase
                    .from('workout_sets')
                    .select('*')
                    .in('session_id', idBatch)
                    .order('id', { ascending: true })
                    .range(from, to),
            ),
        ),
    )

    return setsPerBatch.flat()
}

function listCardioEntriesInPeriod(period: ExportPeriod): Promise<CardioEntryRow[]> {
    return fetchAllPages((from, to) =>
        supabase
            .from('cardio_entries')
            .select('*')
            .gte('entry_date', period.start)
            .lte('entry_date', period.end)
            .order('id', { ascending: true })
            .range(from, to),
    )
}

function listFoodEntriesInPeriod(period: ExportPeriod): Promise<FoodEntryRow[]> {
    return fetchAllPages((from, to) =>
        supabase
            .from('food_entries')
            .select('*')
            .gte('entry_date', period.start)
            .lte('entry_date', period.end)
            .order('id', { ascending: true })
            .range(from, to),
    )
}

function listRoutineEntriesInPeriod(period: ExportPeriod): Promise<RoutineDayEntryRow[]> {
    return fetchAllPages((from, to) =>
        supabase
            .from('routine_day_entries')
            .select('*')
            .gte('entry_date', period.start)
            .lte('entry_date', period.end)
            .order('id', { ascending: true })
            .range(from, to),
    )
}

// Tarefas avulsas com prazo criadas antes do período que ainda aparecem nele
// (não concluídas, ou concluídas no início do período ou depois); a
// visibilidade exata por dia é decidida depois por resolveRoutineForDate.
function listCarriedAdhocEntriesIntoPeriod(period: ExportPeriod): Promise<RoutineDayEntryRow[]> {
    return fetchAllPages((from, to) =>
        supabase
            .from('routine_day_entries')
            .select('*')
            .is('routine_item_id', null)
            .not('due_date', 'is', null)
            .lt('entry_date', period.start)
            .or(`completed_on.is.null,completed_on.gte.${period.start}`)
            .order('id', { ascending: true })
            .range(from, to),
    )
}

function listBodyWeightEntriesInPeriod(period: ExportPeriod): Promise<BodyWeightEntryRow[]> {
    return fetchAllPages((from, to) =>
        supabase
            .from('body_weight_entries')
            .select('*')
            .gte('entry_date', period.start)
            .lte('entry_date', period.end)
            .order('id', { ascending: true })
            .range(from, to),
    )
}

function listSleepEntriesInPeriod(period: ExportPeriod): Promise<SleepEntryRow[]> {
    return fetchAllPages((from, to) =>
        supabase
            .from('sleep_entries')
            .select('*')
            .gte('entry_date', period.start)
            .lte('entry_date', period.end)
            .order('id', { ascending: true })
            .range(from, to),
    )
}

async function getUserTimezone(): Promise<string> {
    const { data, error } = await supabase.from('user_settings').select('timezone').maybeSingle()
    if (error) {
        throw new Error(error.message)
    }

    return data?.timezone ?? DEFAULT_TIMEZONE
}

export async function fetchPeriodExportData(
    period: ExportPeriod,
): Promise<{ raw: PeriodExportRawData; meta: Omit<PeriodExportMeta, 'generatedAt'> }> {
    const [
        workoutSessions,
        cardioEntries,
        activityTypes,
        foodEntries,
        routineItems,
        routineDayEntries,
        carriedAdhocEntries,
        bodyWeightEntries,
        sleepEntries,
        timezone,
        currentCycle,
    ] = await Promise.all([
        listWorkoutSessionsInPeriod(period),
        listCardioEntriesInPeriod(period),
        listActivityTypes(),
        listFoodEntriesInPeriod(period),
        listRoutineItems(),
        listRoutineEntriesInPeriod(period),
        listCarriedAdhocEntriesIntoPeriod(period),
        listBodyWeightEntriesInPeriod(period),
        listSleepEntriesInPeriod(period),
        getUserTimezone(),
        getCurrentCycle(),
    ])
    const workoutSets = await listWorkoutSetsForSessions(workoutSessions.map((session) => session.id))

    return {
        raw: {
            workoutSessions,
            workoutSets,
            cardioEntries,
            activityTypes,
            foodEntries,
            routineItems,
            routineEntries: [...routineDayEntries, ...carriedAdhocEntries],
            bodyWeightEntries,
            sleepEntries,
        },
        meta: { timezone, currentCycleStartDate: currentCycle?.start_date ?? null },
    }
}
