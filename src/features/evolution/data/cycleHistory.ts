import { listCycles } from '@/features/cycle/api'
import type { WorkoutCycleRow } from '@/features/cycle/types'
import type { StoredPlanSummary } from '@/features/workout/api'
import type { IsoDate } from '@/lib/dateUtils'
import { supabase } from '@/lib/supabaseClient'

export type HistorySession = {
    sessionDate: IsoDate
    finishedAt: string | null
    planId: string
    blockWeek: number | null
    blockWeeks: number | null
}

export type CycleHistory = {
    cycles: WorkoutCycleRow[]
    sessions: HistorySession[]
    plans: StoredPlanSummary[]
}

const SESSIONS_PAGE_SIZE = 1000

function numberOrNull(value: unknown): number | null {
    const parsed = typeof value === 'number' ? value : null

    return parsed
}

// O PostgREST corta a resposta em 1000 linhas; paginar evita perder as
// sessões mais novas de quem treina há anos.
async function listHistorySessions(): Promise<HistorySession[]> {
    const sessions: HistorySession[] = []

    for (let from = 0; ; from += SESSIONS_PAGE_SIZE) {
        const { data, error } = await supabase
            .from('workout_sessions')
            .select(
                'session_date, finished_at, plan_id, block_week:workout_snapshot->semana_bloco, block_weeks:workout_snapshot->bloco_semanas',
            )
            .order('session_date', { ascending: true })
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, from + SESSIONS_PAGE_SIZE - 1)

        if (error) {
            throw new Error(error.message)
        }

        const rows = data ?? []
        rows.forEach((row) => {
            sessions.push({
                sessionDate: row.session_date,
                finishedAt: row.finished_at,
                planId: row.plan_id,
                blockWeek: numberOrNull(row.block_week),
                blockWeeks: numberOrNull(row.block_weeks),
            })
        })

        if (rows.length < SESSIONS_PAGE_SIZE) {
            return sessions
        }
    }
}

async function listHistoryPlans(): Promise<StoredPlanSummary[]> {
    const { data, error } = await supabase.from('workout_plans').select('id, name, created_at')

    if (error) {
        throw new Error(error.message)
    }

    const plans = (data ?? []).map((row) => ({ id: row.id, name: row.name, importedAt: row.created_at }))
    return plans
}

export async function loadCycleHistory(): Promise<CycleHistory> {
    const [cycles, sessions, plans] = await Promise.all([listCycles(), listHistorySessions(), listHistoryPlans()])
    const history = { cycles, sessions, plans }

    return history
}
