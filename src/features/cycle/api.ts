import { supabase } from '@/lib/supabaseClient'
import type { IsoDate } from '@/lib/dateUtils'
import type { WorkoutCycleRow } from '@/features/cycle/types'
import { formatDayMonth } from '@/features/evolution/sections/daysWindow'

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

// Ordem cronológica: pelo início do ciclo e, no empate, pelo momento em que
// foi criado. A posição nessa lista é o número do ciclo.
export async function listCycles(): Promise<WorkoutCycleRow[]> {
    const { data, error } = await supabase
        .from('workout_cycles')
        .select('*')
        .order('start_date', { ascending: true })
        .order('created_at', { ascending: true })

    if (error) {
        throw new Error(error.message)
    }

    const cycles = data ?? []
    return cycles
}

const UNIQUE_VIOLATION_CODE = '23505'

async function requireCurrentUserId(): Promise<string> {
    const { data: authData } = await supabase.auth.getUser()
    const currentUserId = authData.user?.id
    if (!currentUserId) {
        throw new Error('Usuário não autenticado')
    }

    return currentUserId
}

// Iniciar um ciclo numa data que já tem ciclo devolve o existente, porque a
// data de início é única por usuário.
export async function startNewCycle(startDate: IsoDate): Promise<WorkoutCycleRow> {
    const currentUserId = await requireCurrentUserId()

    const { error: upsertError } = await supabase
        .from('workout_cycles')
        .upsert({ user_id: currentUserId, start_date: startDate }, { onConflict: 'user_id,start_date', ignoreDuplicates: true })

    if (upsertError) {
        throw new Error(upsertError.message)
    }

    const { data, error } = await supabase
        .from('workout_cycles')
        .select('*')
        .eq('start_date', startDate)
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao iniciar ciclo')
    }

    return data
}

export async function updateCycleStartDate(cycleId: string, startDate: IsoDate): Promise<void> {
    const { error } = await supabase.from('workout_cycles').update({ start_date: startDate }).eq('id', cycleId)

    if (error?.code === UNIQUE_VIOLATION_CODE) {
        throw new Error(`Já existe um ciclo começando em ${formatDayMonth(startDate)}`)
    }

    if (error) {
        throw new Error(error.message)
    }
}

export async function deleteCycle(cycleId: string): Promise<void> {
    const { error } = await supabase.from('workout_cycles').delete().eq('id', cycleId)

    if (error) {
        throw new Error(error.message)
    }
}
