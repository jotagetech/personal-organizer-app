import { canonicalizeJson, sha256Hex } from '@/lib/canonicalJson'
import { supabase } from '@/lib/supabaseClient'
import {
    parseWorkoutPlanJson,
    type WorkoutPlan,
    type WorkoutPlanValidationResult,
} from '@/lib/workoutPlanSchema'
import type { WorkoutSessionRow, WorkoutSetRow, WorkoutSnapshot } from '@/features/workout/types'

export type ImportPlanResult =
    | { success: true; planId: string; alreadyImported: boolean }
    | { success: false; errors: { path: string; message: string }[] }

export async function importWorkoutPlanFromText(rawText: string): Promise<ImportPlanResult> {
    const validationResult: WorkoutPlanValidationResult = parseWorkoutPlanJson(rawText)
    if (!validationResult.success) {
        return { success: false, errors: validationResult.errors }
    }

    const contentHash = await sha256Hex(canonicalizeJson(validationResult.plan))
    const { data, error } = await supabase.rpc('import_workout_plan', {
        p_name: validationResult.plan.nome,
        p_schema_version: validationResult.plan.versao,
        p_payload: validationResult.plan,
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

export async function getActivePlan(): Promise<ActivePlan | null> {
    const { data: authData } = await supabase.auth.getUser()
    const currentUserId = authData.user?.id
    if (!currentUserId) {
        return null
    }

    const { data: settingsRow } = await supabase
        .from('user_settings')
        .select('active_plan_id')
        .eq('user_id', currentUserId)
        .maybeSingle()

    if (!settingsRow?.active_plan_id) {
        return null
    }

    const { data: planRow, error } = await supabase
        .from('workout_plans')
        .select('id, payload')
        .eq('id', settingsRow.active_plan_id)
        .single()

    if (error || !planRow) {
        return null
    }

    return { planId: planRow.id, plan: planRow.payload as WorkoutPlan }
}

export async function getSessionForDate(
    sessionDate: string,
): Promise<{ session: WorkoutSessionRow; sets: WorkoutSetRow[] } | null> {
    const { data: session } = await supabase
        .from('workout_sessions')
        .select('*')
        .eq('session_date', sessionDate)
        .maybeSingle()

    if (!session) {
        return null
    }

    const { data: sets } = await supabase
        .from('workout_sets')
        .select('*')
        .eq('session_id', session.id)

    return { session, sets: sets ?? [] }
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

    return session
}

export async function replaceSessionWorkout(params: {
    sessionId: string
    planId: string
    snapshot: WorkoutSnapshot
}): Promise<void> {
    await supabase
        .from('workout_sessions')
        .update({
            plan_id: params.planId,
            workout_key: params.snapshot.workout_key,
            workout_snapshot: params.snapshot,
        })
        .eq('id', params.sessionId)

    await supabase.from('workout_sets').delete().eq('session_id', params.sessionId)
}

export type SetInput = {
    sessionId: string
    exerciseKey: string
    setIndex: number
    loadKg: number | null
    reps: number | null
    completedAt: string | null
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
                completed_at: input.completedAt,
            },
            { onConflict: 'session_id,exercise_key,set_index' },
        )
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao salvar série')
    }

    return data
}
