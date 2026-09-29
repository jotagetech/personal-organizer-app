import { canonicalizeJson, sha256Hex } from '@/lib/canonicalJson'
import { supabase } from '@/lib/supabaseClient'
import type { OutboxDropValues } from '@/lib/outbox/outboxQueue'
import {
    normalizeStoredWorkoutPlan,
    parseWorkoutPlanJson,
    type SetMetric,
    type WorkoutPlan,
    type WorkoutPlanValidationResult,
} from '@/lib/workoutPlanSchema'
import { normalizeWorkoutSnapshot } from '@/lib/workoutSnapshotSchema'
import type {
    StoredWorkoutSessionRow,
    WorkoutSessionRow,
    WorkoutSetDropRow,
    WorkoutSetRow,
    WorkoutSnapshot,
} from '@/features/workout/types'

export type ImportPlanResult =
    | { success: true; planId: string; alreadyImported: boolean }
    | { success: false; errors: { path: string; message: string }[] }

export async function importWorkoutPlanFromText(rawText: string): Promise<ImportPlanResult> {
    const validationResult: WorkoutPlanValidationResult = parseWorkoutPlanJson(rawText)
    if (!validationResult.success) {
        return { success: false, errors: validationResult.errors }
    }

    // O banco guarda o documento como veio (v1 ou v2), não o formato interno:
    // o hash de um arquivo v1 reimportado continua igual ao de antes, e a
    // leitura normaliza do mesmo jeito que a importação.
    const { document } = validationResult
    const contentHash = await sha256Hex(canonicalizeJson(document))
    const { data, error } = await supabase.rpc('import_workout_plan', {
        p_name: document.nome,
        p_schema_version: document.versao,
        p_payload: document,
        p_content_hash: contentHash,
    })

    if (error) {
        return { success: false, errors: [{ path: '(supabase)', message: error.message }] }
    }

    const [importedPlan] = data
    return {
        success: true,
        planId: importedPlan.plan_id,
        alreadyImported: importedPlan.already_imported,
    }
}

export type ActivePlan = { planId: string; plan: WorkoutPlan }

// Leitura crítica pro fluxo de treino: sem prazo, uma rede instável deixa
// "Carregando..." pendurado pra sempre em vez de cair no estado de erro com
// opção de tentar de novo.
const CRITICAL_READ_TIMEOUT_MS = 10_000

export async function getActivePlan(): Promise<ActivePlan | null> {
    const { data: authData } = await supabase.auth.getUser()
    const currentUserId = authData.user?.id
    if (!currentUserId) {
        throw new Error('Usuário não autenticado')
    }

    const { data: settingsRow, error: settingsError } = await supabase
        .from('user_settings')
        .select('active_plan_id')
        .eq('user_id', currentUserId)
        .abortSignal(AbortSignal.timeout(CRITICAL_READ_TIMEOUT_MS))
        .maybeSingle()

    if (settingsError) {
        throw new Error(settingsError.message)
    }
    if (!settingsRow?.active_plan_id) {
        return null
    }

    const { data: planRow, error: planError } = await supabase
        .from('workout_plans')
        .select('id, payload')
        .eq('id', settingsRow.active_plan_id)
        .abortSignal(AbortSignal.timeout(CRITICAL_READ_TIMEOUT_MS))
        .single()

    if (planError || !planRow) {
        throw new Error(planError?.message ?? 'Plano ativo não encontrado')
    }

    return { planId: planRow.id, plan: normalizeStoredWorkoutPlan(planRow.payload) }
}

function normalizeSessionRow(row: StoredWorkoutSessionRow): WorkoutSessionRow {
    return { ...row, workout_snapshot: normalizeWorkoutSnapshot(row.workout_snapshot) }
}

export function normalizeSessionRows(rows: StoredWorkoutSessionRow[]): WorkoutSessionRow[] {
    return rows.map(normalizeSessionRow)
}

export async function listSetDrops(setIds: string[]): Promise<WorkoutSetDropRow[]> {
    if (setIds.length === 0) {
        return []
    }

    const { data, error } = await supabase
        .from('workout_set_drops')
        .select('*')
        .in('set_id', setIds)
        .order('drop_index', { ascending: true })
        .abortSignal(AbortSignal.timeout(CRITICAL_READ_TIMEOUT_MS))

    if (error) {
        throw new Error(error.message)
    }

    return data ?? []
}

export async function getSessionForDate(
    sessionDate: string,
): Promise<{ session: WorkoutSessionRow; sets: WorkoutSetRow[]; drops: WorkoutSetDropRow[] } | null> {
    const { data: session, error: sessionError } = await supabase
        .from('workout_sessions')
        .select('*')
        .eq('session_date', sessionDate)
        .abortSignal(AbortSignal.timeout(CRITICAL_READ_TIMEOUT_MS))
        .maybeSingle()

    if (sessionError) {
        throw new Error(sessionError.message)
    }
    if (!session) {
        return null
    }

    const { data: sets, error: setsError } = await supabase
        .from('workout_sets')
        .select('*')
        .eq('session_id', session.id)
        .abortSignal(AbortSignal.timeout(CRITICAL_READ_TIMEOUT_MS))

    if (setsError) {
        throw new Error(setsError.message)
    }

    const setRows = sets ?? []
    const drops = await listSetDrops(setRows.map((set) => set.id))

    return { session: normalizeSessionRow(session), sets: setRows, drops }
}

export async function createSession(params: {
    sessionDate: string
    planId: string
    snapshot: WorkoutSnapshot
}): Promise<WorkoutSessionRow> {
    const { data: authData } = await supabase.auth.getUser()
    const currentUserId = authData.user?.id
    if (!currentUserId) {
        throw new Error('Usuário não autenticado')
    }

    await supabase.from('workout_sessions').upsert(
        {
            user_id: currentUserId,
            session_date: params.sessionDate,
            plan_id: params.planId,
            workout_key: params.snapshot.workout_key,
            workout_snapshot: params.snapshot,
        },
        { onConflict: 'user_id,session_date', ignoreDuplicates: true },
    )

    const { data: session, error } = await supabase
        .from('workout_sessions')
        .select('*')
        .eq('session_date', params.sessionDate)
        .single()

    if (error || !session) {
        throw new Error('Não foi possível criar ou recuperar a sessão do dia')
    }

    return normalizeSessionRow(session)
}

export async function replaceSessionWorkout(params: {
    sessionId: string
    planId: string
    snapshot: WorkoutSnapshot
}): Promise<WorkoutSessionRow> {
    const { data, error } = await supabase.rpc('replace_session_workout', {
        p_session_id: params.sessionId,
        p_plan_id: params.planId,
        p_snapshot: params.snapshot,
    })

    if (error || !data || data.length === 0) {
        throw new Error(error?.message ?? 'Falha ao trocar o treino da sessão')
    }

    const [updatedSession] = data
    return normalizeSessionRow(updatedSession)
}

export type SetInput = {
    sessionId: string
    exerciseKey: string
    setIndex: number
    loadKg: number | null
    reps: number | null
    rir: number | null
    note: string | null
    completedAt: string | null
    skippedAt: string | null
    metric?: SetMetric | null
    durationSeconds?: number | null
    distanceM?: number | null
    drops?: OutboxDropValues[] | null
    rpe?: number | null
}

export async function upsertSet(input: SetInput): Promise<WorkoutSetRow> {
    const { data, error } = await supabase
        .from('workout_sets')
        .upsert(
            {
                session_id: input.sessionId,
                exercise_key: input.exerciseKey,
                set_index: input.setIndex,
                load_kg: input.loadKg,
                reps: input.reps,
                rir: input.rir,
                note: input.note,
                completed_at: input.completedAt,
                skipped_at: input.skippedAt,
                metric: input.metric ?? null,
                duration_seconds: input.durationSeconds ?? null,
                distance_m: input.distanceM ?? null,
                // Só rodadas de intervalado mandam a coluna: uma série comum
                // continua sendo aceita por um banco ainda sem ela.
                ...(input.rpe !== undefined ? { rpe: input.rpe } : {}),
            },
            { onConflict: 'session_id,exercise_key,set_index' },
        )
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao salvar série')
    }

    if (input.drops) {
        await replaceSetDrops(data.id, input.drops)
    }

    return data
}

// Substitui todas as quedas da série numa única transação no banco, para uma
// edição que remove quedas nunca deixar sobra das antigas.
export async function replaceSetDrops(setId: string, drops: OutboxDropValues[]): Promise<WorkoutSetDropRow[]> {
    const { data, error } = await supabase.rpc('replace_workout_set_drops', {
        p_set_id: setId,
        p_drops: drops.map((drop) => ({
            load_kg: drop.loadKg,
            reps: drop.reps,
            duration_seconds: drop.durationSeconds,
            distance_m: drop.distanceM,
        })),
    })

    if (error) {
        throw new Error(error.message)
    }

    return data ?? []
}

export async function finishSession(sessionId: string, finishedAt?: string): Promise<WorkoutSessionRow> {
    const { data, error } = await supabase
        .from('workout_sessions')
        .update({ finished_at: finishedAt ?? new Date().toISOString() })
        .eq('id', sessionId)
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao finalizar treino')
    }

    return normalizeSessionRow(data)
}

export async function updateSessionFeeling(
    sessionId: string,
    feelingScale: number,
    feelingNote: string | null,
): Promise<WorkoutSessionRow> {
    const { data, error } = await supabase
        .from('workout_sessions')
        .update({ feeling_scale: feelingScale, feeling_note: feelingNote })
        .eq('id', sessionId)
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao salvar sentimento do treino')
    }

    return normalizeSessionRow(data)
}
