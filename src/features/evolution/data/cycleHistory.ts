import { listCycles } from '@/features/cycle/api'
import type { WorkoutCycleRow } from '@/features/cycle/types'
import { planScheduleOf, type PlanSchedule } from '@/features/evolution/metrics/cycleComparison'
import type { StoredPlanSummary } from '@/features/workout/api'
import { DEFAULT_TIMEZONE, type IsoDate } from '@/lib/dateUtils'
import { supabase } from '@/lib/supabaseClient'
import { normalizeStoredWorkoutPlan } from '@/lib/workoutPlanSchema'

export type HistorySession = {
    sessionDate: IsoDate
    finishedAt: string | null
    planId: string
    blockWeek: number | null
    blockWeeks: number | null
}

export type PlanActivation = {
    planId: string
    activatedAt: string
}

export type CycleHistory = {
    cycles: WorkoutCycleRow[]
    sessions: HistorySession[]
    plans: StoredPlanSummary[]
    activations: PlanActivation[]
    planSchedules: PlanSchedule[]
    timeZone: string
}

const HISTORY_PAGE_SIZE = 1000

// Cada payload de plano pode ter dezenas de KB; em lotes pequenos nenhuma
// resposta fica grande demais para uma rede móvel ruim.
const PLAN_PAYLOADS_PER_REQUEST = 5

// Tabela ausente no cache do PostgREST ou no Postgres: o banco ainda não tem o
// histórico de ativação, e a seção segue com os planos das sessões.
const MISSING_TABLE_ERROR_CODES = new Set(['PGRST205', '42P01'])

function numberOrNull(value: unknown): number | null {
    const parsed = typeof value === 'number' ? value : null

    return parsed
}

// O PostgREST corta a resposta em 1000 linhas; paginar evita perder as
// sessões mais novas de quem treina há anos.
async function listHistorySessions(): Promise<HistorySession[]> {
    const sessions: HistorySession[] = []

    for (let from = 0; ; from += HISTORY_PAGE_SIZE) {
        const { data, error } = await supabase
            .from('workout_sessions')
            .select(
                'session_date, finished_at, plan_id, block_week:workout_snapshot->semana_bloco, block_weeks:workout_snapshot->bloco_semanas',
            )
            .order('session_date', { ascending: true })
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, from + HISTORY_PAGE_SIZE - 1)

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

        if (rows.length < HISTORY_PAGE_SIZE) {
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

// O histórico de trocas também pode passar do corte de 1000 linhas do
// PostgREST, então pagina como as sessões.
async function listPlanActivations(): Promise<PlanActivation[]> {
    const activations: PlanActivation[] = []

    for (let from = 0; ; from += HISTORY_PAGE_SIZE) {
        const { data, error } = await supabase
            .from('plan_activations')
            .select('plan_id, activated_at')
            .order('activated_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, from + HISTORY_PAGE_SIZE - 1)

        if (error && MISSING_TABLE_ERROR_CODES.has(error.code)) {
            return []
        }
        if (error) {
            throw new Error(error.message)
        }

        const rows = data ?? []
        rows.forEach((row) => {
            activations.push({ planId: row.plan_id, activatedAt: row.activated_at })
        })

        if (rows.length < HISTORY_PAGE_SIZE) {
            return activations
        }
    }
}

// Um payload que não lê no formato atual vira plano sem agenda: a aderência
// some para ele em vez de derrubar a seção inteira.
function scheduleFromPayload(planId: string, payload: unknown): PlanSchedule {
    try {
        return planScheduleOf(planId, normalizeStoredWorkoutPlan(payload))
    } catch {
        return { planId, workoutWeekdays: [] }
    }
}

async function listPlanSchedulesBatch(planIds: string[]): Promise<PlanSchedule[]> {
    const { data, error } = await supabase.from('workout_plans').select('id, payload').in('id', planIds)

    if (error) {
        throw new Error(error.message)
    }

    const schedules = (data ?? []).map((row) => scheduleFromPayload(row.id, row.payload))
    return schedules
}

// Só os planos que já foram ativados alguma vez entram na aderência, e do
// payload fica só a agenda de cada treino.
async function listPlanSchedules(activations: readonly PlanActivation[]): Promise<PlanSchedule[]> {
    const planIds = [...new Set(activations.map((activation) => activation.planId))]
    const idBatches: string[][] = []
    for (let start = 0; start < planIds.length; start += PLAN_PAYLOADS_PER_REQUEST) {
        idBatches.push(planIds.slice(start, start + PLAN_PAYLOADS_PER_REQUEST))
    }

    const schedulesPerBatch = await Promise.all(idBatches.map(listPlanSchedulesBatch))
    return schedulesPerBatch.flat()
}

async function loadActivationTimeline(): Promise<Pick<CycleHistory, 'activations' | 'planSchedules'>> {
    const activations = await listPlanActivations()
    const planSchedules = await listPlanSchedules(activations)
    const timeline = { activations, planSchedules }

    return timeline
}

async function getUserTimeZone(): Promise<string> {
    const { data, error } = await supabase.from('user_settings').select('timezone').maybeSingle()

    if (error) {
        throw new Error(error.message)
    }

    const timeZone = data?.timezone ?? DEFAULT_TIMEZONE
    return timeZone
}

export async function loadCycleHistory(): Promise<CycleHistory> {
    const [cycles, sessions, plans, activationTimeline, timeZone] = await Promise.all([
        listCycles(),
        listHistorySessions(),
        listHistoryPlans(),
        loadActivationTimeline(),
        getUserTimeZone(),
    ])
    const history = { cycles, sessions, plans, ...activationTimeline, timeZone }

    return history
}
