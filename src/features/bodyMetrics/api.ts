import { supabase } from '@/lib/supabaseClient'
import type { BodyWeightEntryRow, SleepEntryRow } from '@/features/bodyMetrics/types'

const RECENT_ENTRIES_LIMIT = 5

export async function listRecentBodyWeightEntries(): Promise<BodyWeightEntryRow[]> {
    const { data, error } = await supabase
        .from('body_weight_entries')
        .select('*')
        .order('entry_date', { ascending: false })
        .limit(RECENT_ENTRIES_LIMIT)

    if (error) {
        throw new Error(error.message)
    }

    return data ?? []
}

export async function upsertBodyWeightEntry(entryDate: string, weightKg: number): Promise<BodyWeightEntryRow> {
    const { data: authData } = await supabase.auth.getUser()
    const currentUserId = authData.user?.id
    if (!currentUserId) {
        throw new Error('Usuário não autenticado')
    }

    const { data, error } = await supabase
        .from('body_weight_entries')
        .upsert(
            { user_id: currentUserId, entry_date: entryDate, weight_kg: weightKg },
            { onConflict: 'user_id,entry_date' },
        )
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao salvar peso corporal')
    }

    return data
}

export async function deleteBodyWeightEntry(entryId: string): Promise<void> {
    const { error } = await supabase.from('body_weight_entries').delete().eq('id', entryId)
    if (error) {
        throw new Error(error.message)
    }
}

export async function listRecentSleepEntries(): Promise<SleepEntryRow[]> {
    const { data, error } = await supabase
        .from('sleep_entries')
        .select('*')
        .order('entry_date', { ascending: false })
        .limit(RECENT_ENTRIES_LIMIT)

    if (error) {
        throw new Error(error.message)
    }

    return data ?? []
}

export async function upsertSleepEntry(entryDate: string, hours: number): Promise<SleepEntryRow> {
    const { data: authData } = await supabase.auth.getUser()
    const currentUserId = authData.user?.id
    if (!currentUserId) {
        throw new Error('Usuário não autenticado')
    }

    const { data, error } = await supabase
        .from('sleep_entries')
        .upsert({ user_id: currentUserId, entry_date: entryDate, hours }, { onConflict: 'user_id,entry_date' })
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao salvar sono')
    }

    return data
}

export async function deleteSleepEntry(entryId: string): Promise<void> {
    const { error } = await supabase.from('sleep_entries').delete().eq('id', entryId)
    if (error) {
        throw new Error(error.message)
    }
}
