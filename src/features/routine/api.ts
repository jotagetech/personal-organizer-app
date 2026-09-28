import type { RoutineItemInput } from '@/features/routine/routineSchema'
import type { RoutineDayEntryRow, RoutineItemRow } from '@/features/routine/types'
import type { IsoDate } from '@/lib/dateUtils'
import { supabase } from '@/lib/supabaseClient'

export async function listRoutineItems(): Promise<RoutineItemRow[]> {
    const { data, error } = await supabase
        .from('routine_items')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

    if (error) {
        throw new Error(error.message)
    }

    return data ?? []
}

export async function createRoutineItem(input: RoutineItemInput, sortOrder: number): Promise<RoutineItemRow> {
    const { data: authData } = await supabase.auth.getUser()
    const currentUserId = authData.user?.id
    if (!currentUserId) {
        throw new Error('Usuário não autenticado')
    }

    const { data, error } = await supabase
        .from('routine_items')
        .insert({
            user_id: currentUserId,
            title: input.title,
            weekdays: input.weekdays,
            link_kind: input.linkKind ?? null,
            sort_order: sortOrder,
        })
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao criar item de rotina')
    }

    return data
}

export async function updateRoutineItem(itemId: string, input: RoutineItemInput): Promise<RoutineItemRow> {
    const { data, error } = await supabase
        .from('routine_items')
        .update({
            title: input.title,
            weekdays: input.weekdays,
            link_kind: input.linkKind ?? null,
        })
        .eq('id', itemId)
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao atualizar item de rotina')
    }

    return data
}

export async function archiveRoutineItem(itemId: string, archivedOn: IsoDate): Promise<RoutineItemRow> {
    const { data, error } = await supabase
        .from('routine_items')
        .update({ archived_on: archivedOn })
        .eq('id', itemId)
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao arquivar item de rotina')
    }

    return data
}

export async function listRoutineDayEntries(entryDate: IsoDate): Promise<RoutineDayEntryRow[]> {
    const { data, error } = await supabase
        .from('routine_day_entries')
        .select('*')
        .eq('entry_date', entryDate)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

    if (error) {
        throw new Error(error.message)
    }

    return data ?? []
}

// A unicidade de (user_id, routine_item_id, entry_date) é um índice parcial
// (só quando routine_item_id não é nulo), então um upsert de verdade não tem
// como inferir o índice como alvo de conflito; buscar antes de decidir entre
// inserir e atualizar evita depender disso.
export async function markRoutineItemDone(routineItemId: string, entryDate: IsoDate): Promise<RoutineDayEntryRow> {
    const { data: authData } = await supabase.auth.getUser()
    const currentUserId = authData.user?.id
    if (!currentUserId) {
        throw new Error('Usuário não autenticado')
    }

    const { data: existingEntry, error: selectError } = await supabase
        .from('routine_day_entries')
        .select('*')
        .eq('routine_item_id', routineItemId)
        .eq('entry_date', entryDate)
        .maybeSingle()

    if (selectError) {
        throw new Error(selectError.message)
    }

    const completedAt = new Date().toISOString()

    if (existingEntry) {
        const { data, error } = await supabase
            .from('routine_day_entries')
            .update({ completed_at: completedAt })
            .eq('id', existingEntry.id)
            .select('*')
            .single()

        if (error || !data) {
            throw new Error(error?.message ?? 'Falha ao marcar item de rotina')
        }

        return data
    }

    const { data, error } = await supabase
        .from('routine_day_entries')
        .insert({
            user_id: currentUserId,
            entry_date: entryDate,
            routine_item_id: routineItemId,
            title: null,
            completed_at: completedAt,
            sort_order: 0,
        })
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao marcar item de rotina')
    }

    return data
}

// Remove por completo o registro do dia: usado tanto pra desmarcar um item
// manual (sem vínculo) quanto pra derrubar uma marcação manual sobre um item
// vinculado, casos em que a linha só existe pra guardar a marcação em si, sem
// nenhum outro dado que valha a pena preservar.
export async function deleteRoutineDayEntry(dayEntryId: string): Promise<void> {
    const { error } = await supabase.from('routine_day_entries').delete().eq('id', dayEntryId)
    if (error) {
        throw new Error(error.message)
    }
}

// sort_order é calculado a partir da contagem de registros já existentes na
// data de destino (não na data selecionada na tela), já que uma tarefa avulsa
// pode ser criada pra uma data diferente da que está aberta no momento.
export async function createAdhocRoutineEntry(entryDate: IsoDate, title: string): Promise<RoutineDayEntryRow> {
    const { data: authData } = await supabase.auth.getUser()
    const currentUserId = authData.user?.id
    if (!currentUserId) {
        throw new Error('Usuário não autenticado')
    }

    const { count, error: countError } = await supabase
        .from('routine_day_entries')
        .select('id', { count: 'exact', head: true })
        .eq('entry_date', entryDate)

    if (countError) {
        throw new Error(countError.message)
    }

    const { data, error } = await supabase
        .from('routine_day_entries')
        .insert({
            user_id: currentUserId,
            entry_date: entryDate,
            routine_item_id: null,
            title,
            completed_at: null,
            sort_order: count ?? 0,
        })
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao criar tarefa avulsa')
    }

    return data
}

export async function markAdhocRoutineEntryDone(dayEntryId: string): Promise<RoutineDayEntryRow> {
    const { data, error } = await supabase
        .from('routine_day_entries')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', dayEntryId)
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao marcar tarefa avulsa')
    }

    return data
}

export async function unmarkAdhocRoutineEntryDone(dayEntryId: string): Promise<RoutineDayEntryRow> {
    const { data, error } = await supabase
        .from('routine_day_entries')
        .update({ completed_at: null })
        .eq('id', dayEntryId)
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao desmarcar tarefa avulsa')
    }

    return data
}

const SUGGESTED_ROUTINE_WEEKDAYS_WEEKDAY_ONLY = ['segunda', 'terca', 'quarta', 'quinta', 'sexta']
const SUGGESTED_ROUTINE_WEEKDAYS_EVERY_DAY = [
    'segunda',
    'terca',
    'quarta',
    'quinta',
    'sexta',
    'sabado',
    'domingo',
]

// Ponto de partida sugerido pra quem nunca criou um item de rotina: cobre os
// dois casos de uso (vinculado a outra aba e manual) sem exigir que a pessoa
// monte a lista do zero antes de ver a tela funcionando.
export async function seedSuggestedRoutineItems(): Promise<RoutineItemRow[]> {
    const { data: authData } = await supabase.auth.getUser()
    const currentUserId = authData.user?.id
    if (!currentUserId) {
        throw new Error('Usuário não autenticado')
    }

    const suggestedItems = [
        { title: 'Academia', weekdays: SUGGESTED_ROUTINE_WEEKDAYS_WEEKDAY_ONLY, link_kind: 'workout_finished' },
        { title: 'Café da manhã', weekdays: SUGGESTED_ROUTINE_WEEKDAYS_EVERY_DAY, link_kind: 'meal:cafe_da_manha' },
        { title: 'Almoço', weekdays: SUGGESTED_ROUTINE_WEEKDAYS_EVERY_DAY, link_kind: 'meal:almoco' },
        { title: 'Café da tarde', weekdays: SUGGESTED_ROUTINE_WEEKDAYS_EVERY_DAY, link_kind: 'meal:lanche' },
        { title: 'Tomar creatina', weekdays: SUGGESTED_ROUTINE_WEEKDAYS_EVERY_DAY, link_kind: null },
    ].map((item, index) => ({ ...item, user_id: currentUserId, sort_order: index }))

    const { data, error } = await supabase.from('routine_items').insert(suggestedItems).select('*')

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao criar rotina sugerida')
    }

    return data
}
