import { supabase } from '@/lib/supabaseClient'
import type { IsoDate } from '@/lib/dateUtils'
import type { WorkoutCycleRow } from '@/features/cycle/types'

export async function getCurrentCycle(): Promise<WorkoutCycleRow | null> {
    const { data, error } = await supabase
        .from('workout_cycles')
        .select('*')
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error) {
        throw new Error(error.message)
    }

    return data
}

export async function startNewCycle(startDate: IsoDate): Promise<WorkoutCycleRow> {
    const { data: authData } = await supabase.auth.getUser()
    const currentUserId = authData.user?.id
    if (!currentUserId) {
        throw new Error('Usuário não autenticado')
    }

    const { data, error } = await supabase
        .from('workout_cycles')
        .insert({ user_id: currentUserId, start_date: startDate })
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao iniciar ciclo')
    }

    return data
}
