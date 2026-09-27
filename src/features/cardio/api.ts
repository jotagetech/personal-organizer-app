import { supabase } from '@/lib/supabaseClient'
import type { CardioActivityTypeRow, CardioEntryRow } from '@/features/cardio/types'

export async function listActivityTypes(): Promise<CardioActivityTypeRow[]> {
    const { data, error } = await supabase
        .from('cardio_activity_types')
        .select('*')
        .order('name', { ascending: true })

    if (error) {
        throw new Error(error.message)
    }

    return data ?? []
}

export async function createActivityType(name: string): Promise<CardioActivityTypeRow> {
    const { data: authData } = await supabase.auth.getUser()
    const currentUserId = authData.user?.id
    if (!currentUserId) {
        throw new Error('Usuário não autenticado')
    }

    const { data, error } = await supabase
        .from('cardio_activity_types')
        .insert({ user_id: currentUserId, name })
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao criar tipo de atividade')
    }

    return data
}

export async function deleteActivityType(activityTypeId: string): Promise<void> {
    const { error } = await supabase
        .from('cardio_activity_types')
        .delete()
        .eq('id', activityTypeId)

    if (error) {
        throw new Error(error.message)
    }
}

export async function listCardioEntriesForDate(entryDate: string): Promise<CardioEntryRow[]> {
    const { data, error } = await supabase
        .from('cardio_entries')
        .select('*')
        .eq('entry_date', entryDate)
        .order('created_at', { ascending: true })

    if (error) {
        throw new Error(error.message)
    }

    return data ?? []
}

export type NewCardioEntryInput = {
    entryDate: string
    activityTypeId: string
    durationMinutes: number
    distanceKm: number | null
    feelingScale: number
    feelingNote: string | null
    note: string | null
}

export async function createCardioEntry(input: NewCardioEntryInput): Promise<CardioEntryRow> {
    const { data: authData } = await supabase.auth.getUser()
    const currentUserId = authData.user?.id
    if (!currentUserId) {
        throw new Error('Usuário não autenticado')
    }

    const { data, error } = await supabase
        .from('cardio_entries')
        .insert({
            user_id: currentUserId,
            entry_date: input.entryDate,
            activity_type_id: input.activityTypeId,
            duration_minutes: input.durationMinutes,
            distance_km: input.distanceKm,
            feeling_scale: input.feelingScale,
            feeling_note: input.feelingNote,
            note: input.note,
        })
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao salvar cardio')
    }

    return data
}

export async function deleteCardioEntry(entryId: string): Promise<void> {
    const { error } = await supabase.from('cardio_entries').delete().eq('id', entryId)
    if (error) {
        throw new Error(error.message)
    }
}
