import type { NewTaskInsert } from '@/features/routine/newTaskInput'
import type { OnboardingItemRow } from '@/features/routine/onboardingItems'
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
// de agenda, as marcações do dia e as tarefas marcadas para ele. As tarefas
// sem data vão junto em tasks; a resolução do dia as ignora e a seção
// própria as lista.
export async function loadRoutineDataForDate(date: IsoDate): Promise<RoutineData> {
    const [items, schedules, entries, datedTasks, undatedTasks] = await Promise.all([
        listRoutineItems(),
        listRoutineItemSchedules(),
        listRoutineDayEntries(date),
        listRoutineTasksScheduledOn(date),
        listUndatedRoutineTasks(),
    ])
    const routineData: RoutineData = { items, schedules, entries, tasks: [...datedTasks, ...undatedTasks] }

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

// Cria a tarefa avulsa ou o item que repete descrito pela folha de nova
// tarefa. A versão da agenda do item é gravada pelo banco.
export async function createNewRoutineEntry(input: NewTaskInsert): Promise<void> {
    if (input.kind === 'task') {
        await createRoutineTask(input)
        return
    }
    await createRepeatingRoutineItem(input)
}

// sort_order é calculado a partir da contagem de tarefas já na mesma data de
// destino (ou já sem data), que pode não ser a aberta na tela.
async function createRoutineTask(input: Extract<NewTaskInsert, { kind: 'task' }>): Promise<void> {
    const currentUserId = await requireCurrentUserId()

    const countQuery = supabase.from('routine_tasks').select('id', { count: 'exact', head: true })
    const { count, error: countError } =
        input.scheduledOn === null
            ? await countQuery.is('scheduled_on', null)
            : await countQuery.eq('scheduled_on', input.scheduledOn)

    if (countError) {
        throw new Error(countError.message)
    }

    const { error } = await supabase.from('routine_tasks').insert({
        user_id: currentUserId,
        title: input.title,
        scheduled_on: input.scheduledOn,
        is_important: input.isImportant,
        sort_order: count ?? 0,
    })

    if (error) {
        throw new Error(error.message)
    }
}

async function createRepeatingRoutineItem(input: Extract<NewTaskInsert, { kind: 'item' }>): Promise<void> {
    const currentUserId = await requireCurrentUserId()

    const { count, error: countError } = await supabase
        .from('routine_items')
        .select('id', { count: 'exact', head: true })

    if (countError) {
        throw new Error(countError.message)
    }

    const { error } = await supabase.from('routine_items').insert({
        user_id: currentUserId,
        title: input.title,
        link_kind: null,
        repeat_kind: input.repeatKind,
        weekdays: input.weekdays,
        interval_days: input.intervalDays,
        interval_anchor: input.intervalAnchor,
        active_from: input.activeFrom,
        is_important: input.isImportant,
        sort_order: count ?? 0,
    })

    if (error) {
        throw new Error(error.message)
    }
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

// null enquanto a conta não passou pela primeira vez da aba.
export async function getRoutineOnboardedAt(): Promise<string | null> {
    const currentUserId = await requireCurrentUserId()

    const { data, error } = await supabase
        .from('user_settings')
        .select('routine_onboarded_at')
        .eq('user_id', currentUserId)
        .maybeSingle()

    if (error) {
        throw new Error(error.message)
    }

    return data?.routine_onboarded_at ?? null
}

export async function markRoutineOnboarded(): Promise<void> {
    const currentUserId = await requireCurrentUserId()

    const { error } = await supabase
        .from('user_settings')
        .update({ routine_onboarded_at: new Date().toISOString() })
        .eq('user_id', currentUserId)

    if (error) {
        throw new Error(error.message)
    }
}

// Insert único para os itens escolhidos na primeira vez: ou entram todos ou
// nenhum, então uma nova tentativa nunca duplica metade da lista.
export async function createOnboardingRoutineItems(rows: OnboardingItemRow[]): Promise<RoutineItemRow[]> {
    if (rows.length === 0) {
        return []
    }
    const currentUserId = await requireCurrentUserId()
    const activeFrom = todayInTimezone()

    const { data, error } = await supabase
        .from('routine_items')
        .insert(
            rows.map((row) => ({
                ...row,
                user_id: currentUserId,
                repeat_kind: 'weekdays' as const,
                active_from: activeFrom,
            })),
        )
        .select('*')

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao criar os itens da rotina')
    }

    return data
}
