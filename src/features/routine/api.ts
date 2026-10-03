import type { RoutineItemInput } from '@/features/routine/routineSchema'
import type {
    RoutineCategoryRow,
    RoutineData,
    RoutineDayEntryRow,
    RoutineItemRow,
    RoutineItemScheduleRow,
    RoutineTaskRow,
} from '@/features/routine/types'
import { todayInTimezone, type IsoDate } from '@/lib/dateUtils'
import { supabase } from '@/lib/supabaseClient'

async function requireCurrentUserId(): Promise<string> {
    const { data: authData } = await supabase.auth.getUser()
    const currentUserId = authData.user?.id
    if (!currentUserId) {
        throw new Error('Usuário não autenticado')
    }

    return currentUserId
}

export async function listRoutineCategories(): Promise<RoutineCategoryRow[]> {
    const { data, error } = await supabase
        .from('routine_categories')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

    if (error) {
        throw new Error(error.message)
    }

    return data ?? []
}

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

// Todas as versões de agenda da conta: são poucas por item (uma por dia em
// que a agenda mudou) e a resolução de qualquer data pode precisar de uma
// versão antiga.
export async function listRoutineItemSchedules(): Promise<RoutineItemScheduleRow[]> {
    const { data, error } = await supabase
        .from('routine_item_schedules')
        .select('*')
        .order('routine_item_id', { ascending: true })
        .order('effective_from', { ascending: true })

    if (error) {
        throw new Error(error.message)
    }

    return data ?? []
}

export async function listRoutineDayEntries(entryDate: IsoDate): Promise<RoutineDayEntryRow[]> {
    const { data, error } = await supabase.from('routine_day_entries').select('*').eq('entry_date', entryDate)

    if (error) {
        throw new Error(error.message)
    }

    return data ?? []
}

export async function listRoutineTasksScheduledOn(date: IsoDate): Promise<RoutineTaskRow[]> {
    const { data, error } = await supabase
        .from('routine_tasks')
        .select('*')
        .eq('scheduled_on', date)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

    if (error) {
        throw new Error(error.message)
    }

    return data ?? []
}

export async function listUndatedRoutineTasks(): Promise<RoutineTaskRow[]> {
    const { data, error } = await supabase
        .from('routine_tasks')
        .select('*')
        .is('scheduled_on', null)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

    if (error) {
        throw new Error(error.message)
    }

    return data ?? []
}

// Tudo o que a resolução de uma data precisa: os itens com todas as versões
// de agenda, as marcações do dia e as tarefas marcadas para ele.
export async function loadRoutineDataForDate(date: IsoDate): Promise<RoutineData> {
    const [items, schedules, entries, tasks] = await Promise.all([
        listRoutineItems(),
        listRoutineItemSchedules(),
        listRoutineDayEntries(date),
        listRoutineTasksScheduledOn(date),
    ])
    const routineData: RoutineData = { items, schedules, entries, tasks }

    return routineData
}

// O formulário atual só conhece dias da semana; as colunas de intervalo vão
// nulas explicitamente para a linha nunca misturar os dois tipos de agenda.
function weekdaysScheduleColumns(input: RoutineItemInput) {
    const scheduleColumns = {
        repeat_kind: 'weekdays' as const,
        weekdays: input.weekdays,
        interval_days: null,
        interval_anchor: null,
    }
    return scheduleColumns
}

// active_from sai do dia da conta no cliente: o banco roda em UTC e não tem
// como saber, sem consulta, qual é "hoje" para quem está usando.
export async function createRoutineItem(input: RoutineItemInput, sortOrder: number): Promise<RoutineItemRow> {
    const currentUserId = await requireCurrentUserId()

    const { data, error } = await supabase
        .from('routine_items')
        .insert({
            user_id: currentUserId,
            title: input.title,
            link_kind: input.linkKind ?? null,
            ...weekdaysScheduleColumns(input),
            active_from: todayInTimezone(),
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
            link_kind: input.linkKind ?? null,
            ...weekdaysScheduleColumns(input),
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

// Marcar de novo um item já marcado no dia só renova completed_at, graças ao
// upsert na unicidade (routine_item_id, entry_date).
export async function markRoutineItemDone(routineItemId: string, entryDate: IsoDate): Promise<RoutineDayEntryRow> {
    const currentUserId = await requireCurrentUserId()

    const { data, error } = await supabase
        .from('routine_day_entries')
        .upsert(
            {
                user_id: currentUserId,
                routine_item_id: routineItemId,
                entry_date: entryDate,
                completed_at: new Date().toISOString(),
            },
            { onConflict: 'routine_item_id,entry_date' },
        )
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao marcar item de rotina')
    }

    return data
}

// Desmarcar apaga a linha: ela só existe para guardar a marcação em si.
export async function deleteRoutineDayEntry(dayEntryId: string): Promise<void> {
    const { error } = await supabase.from('routine_day_entries').delete().eq('id', dayEntryId)
    if (error) {
        throw new Error(error.message)
    }
}

// sort_order é calculado a partir da contagem de tarefas já marcadas para a
// data de destino, que pode não ser a aberta na tela.
export async function createRoutineTask(scheduledOn: IsoDate, title: string): Promise<RoutineTaskRow> {
    const currentUserId = await requireCurrentUserId()

    const { count, error: countError } = await supabase
        .from('routine_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('scheduled_on', scheduledOn)

    if (countError) {
        throw new Error(countError.message)
    }

    const { data, error } = await supabase
        .from('routine_tasks')
        .insert({
            user_id: currentUserId,
            title,
            scheduled_on: scheduledOn,
            sort_order: count ?? 0,
        })
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao criar tarefa')
    }

    return data
}

// completedOn é o dia exibido na tela, não necessariamente hoje.
export async function markRoutineTaskDone(taskId: string, completedOn: IsoDate): Promise<RoutineTaskRow> {
    const { data, error } = await supabase
        .from('routine_tasks')
        .update({ completed_on: completedOn, completed_at: new Date().toISOString() })
        .eq('id', taskId)
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao marcar tarefa')
    }

    return data
}

export async function unmarkRoutineTaskDone(taskId: string): Promise<RoutineTaskRow> {
    const { data, error } = await supabase
        .from('routine_tasks')
        .update({ completed_on: null, completed_at: null })
        .eq('id', taskId)
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao desmarcar tarefa')
    }

    return data
}

export async function deleteRoutineTask(taskId: string): Promise<void> {
    const { error } = await supabase.from('routine_tasks').delete().eq('id', taskId)
    if (error) {
        throw new Error(error.message)
    }
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
    const currentUserId = await requireCurrentUserId()
    const activeFrom = todayInTimezone()

    const suggestedItems = [
        { title: 'Academia', weekdays: SUGGESTED_ROUTINE_WEEKDAYS_WEEKDAY_ONLY, link_kind: 'workout_finished' },
        { title: 'Café da manhã', weekdays: SUGGESTED_ROUTINE_WEEKDAYS_EVERY_DAY, link_kind: 'meal:cafe_da_manha' },
        { title: 'Almoço', weekdays: SUGGESTED_ROUTINE_WEEKDAYS_EVERY_DAY, link_kind: 'meal:almoco' },
        { title: 'Café da tarde', weekdays: SUGGESTED_ROUTINE_WEEKDAYS_EVERY_DAY, link_kind: 'meal:lanche' },
        { title: 'Tomar creatina', weekdays: SUGGESTED_ROUTINE_WEEKDAYS_EVERY_DAY, link_kind: null },
    ].map((item, index) => ({
        ...item,
        user_id: currentUserId,
        repeat_kind: 'weekdays' as const,
        active_from: activeFrom,
        sort_order: index,
    }))

    const { data, error } = await supabase.from('routine_items').insert(suggestedItems).select('*')

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao criar rotina sugerida')
    }

    return data
}
