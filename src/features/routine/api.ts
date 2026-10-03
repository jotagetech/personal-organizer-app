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
import { BRING_FORWARD_WINDOW_DAYS, selectTasksToBringForward } from '@/features/routine/tasksToBringForward'
import { shiftIsoDate, todayInTimezone, type IsoDate } from '@/lib/dateUtils'
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

const UNIQUE_VIOLATION_CODE = '23505'

// O nome já existe na conta (a unicidade do banco ignora maiúsculas).
export class RoutineCategoryNameTakenError extends Error {}

export async function createRoutineCategory(
    name: string,
    color: string,
    sortOrder: number,
): Promise<RoutineCategoryRow> {
    const currentUserId = await requireCurrentUserId()

    const { data, error } = await supabase
        .from('routine_categories')
        .insert({ user_id: currentUserId, name, color, sort_order: sortOrder })
        .select('*')
        .single()

    if (error?.code === UNIQUE_VIOLATION_CODE) {
        throw new RoutineCategoryNameTakenError(error.message)
    }
    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao criar categoria')
    }

    return data
}

export async function updateRoutineCategory(
    categoryId: string,
    name: string,
    color: string,
): Promise<RoutineCategoryRow> {
    const { data, error } = await supabase
        .from('routine_categories')
        .update({ name, color })
        .eq('id', categoryId)
        .select('*')
        .single()

    if (error?.code === UNIQUE_VIOLATION_CODE) {
        throw new RoutineCategoryNameTakenError(error.message)
    }
    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao atualizar categoria')
    }

    return data
}

// Os itens e tarefas da categoria ficam sem categoria: o banco faz isso.
export async function deleteRoutineCategory(categoryId: string): Promise<void> {
    const { error } = await supabase.from('routine_categories').delete().eq('id', categoryId)
    if (error) {
        throw new Error(error.message)
    }
}

// Categorias dos itens não arquivados e das tarefas ainda não concluídas, uma
// entrada por linha, para a tela de categorias contar o uso de cada uma.
export async function listActiveCategoryAssignments(): Promise<(string | null)[]> {
    const [itemsResult, tasksResult] = await Promise.all([
        supabase.from('routine_items').select('category_id').is('archived_on', null),
        supabase.from('routine_tasks').select('category_id').is('completed_at', null),
    ])
    if (itemsResult.error) {
        throw new Error(itemsResult.error.message)
    }
    if (tasksResult.error) {
        throw new Error(tasksResult.error.message)
    }
    const assignments = [...(itemsResult.data ?? []), ...(tasksResult.data ?? [])].map((row) => row.category_id)

    return assignments
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

// As tarefas do dia exibido e também as levadas dele para outro dia, que
// aparecem apagadas na lista do dia de origem.
export async function listRoutineTasksForDay(date: IsoDate): Promise<RoutineTaskRow[]> {
    const { data, error } = await supabase
        .from('routine_tasks')
        .select('*')
        .or(`scheduled_on.eq.${date},carried_from_on.eq.${date}`)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

    if (error) {
        throw new Error(error.message)
    }

    return data ?? []
}

// Uma consulta só: as não concluídas com data na janela até ontem. A seleção
// final é da função pura, que também descarta o que escapar da consulta.
export async function listTasksToBringForward(today: IsoDate): Promise<RoutineTaskRow[]> {
    const { data, error } = await supabase
        .from('routine_tasks')
        .select('*')
        .is('completed_at', null)
        .gte('scheduled_on', shiftIsoDate(today, -BRING_FORWARD_WINDOW_DAYS))
        .lte('scheduled_on', shiftIsoDate(today, -1))

    if (error) {
        throw new Error(error.message)
    }

    return selectTasksToBringForward(data ?? [], today)
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
        listRoutineTasksForDay(date),
        listUndatedRoutineTasks(),
    ])
    const routineData: RoutineData = { items, schedules, entries, tasks: [...datedTasks, ...undatedTasks] }

    return routineData
}

// A rotina de um intervalo de datas em poucas consultas: os itens e as
// versões de agenda são os mesmos de qualquer dia; as marcações e as tarefas
// são só as do intervalo. Tarefas sem data não pertencem a dia nenhum e ficam
// de fora.
export async function loadRoutineDataForRange(start: IsoDate, end: IsoDate): Promise<RoutineData> {
    const [items, schedules, entriesResult, tasksResult] = await Promise.all([
        listRoutineItems(),
        listRoutineItemSchedules(),
        supabase.from('routine_day_entries').select('*').gte('entry_date', start).lte('entry_date', end),
        supabase.from('routine_tasks').select('*').gte('scheduled_on', start).lte('scheduled_on', end),
    ])
    if (entriesResult.error) {
        throw new Error(entriesResult.error.message)
    }
    if (tasksResult.error) {
        throw new Error(tasksResult.error.message)
    }
    const routineData: RoutineData = {
        items,
        schedules,
        entries: entriesResult.data ?? [],
        tasks: tasksResult.data ?? [],
    }

    return routineData
}

// As colunas dos dois tipos de agenda vão sempre juntas, com as do tipo
// que não vale nulas, para a linha nunca misturar os dois.
function scheduleColumns(input: RoutineItemInput) {
    if (input.repeatKind === 'interval') {
        return {
            repeat_kind: 'interval' as const,
            weekdays: null,
            interval_days: input.intervalDays,
            interval_anchor: input.intervalAnchor,
        }
    }

    return {
        repeat_kind: 'weekdays' as const,
        weekdays: input.weekdays,
        interval_days: null,
        interval_anchor: null,
    }
}

function itemDetailColumns(input: RoutineItemInput) {
    const detailColumns = {
        title: input.title,
        link_kind: input.linkKind ?? null,
        category_id: input.categoryId,
        is_important: input.isImportant,
    }
    return detailColumns
}

// active_from sai do dia da conta no cliente: o banco roda em UTC e não tem
// como saber, sem consulta, qual é "hoje" para quem está usando. Item por
// intervalo começa no dia de início escolhido.
export async function createRoutineItem(input: RoutineItemInput, sortOrder: number): Promise<RoutineItemRow> {
    const currentUserId = await requireCurrentUserId()
    const activeFrom = input.repeatKind === 'interval' ? input.intervalAnchor : todayInTimezone()

    const { data, error } = await supabase
        .from('routine_items')
        .insert({
            user_id: currentUserId,
            ...itemDetailColumns(input),
            ...scheduleColumns(input),
            active_from: activeFrom,
            sort_order: sortOrder,
        })
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao criar item de rotina')
    }

    return data
}

// A versão da agenda é gravada pelo banco quando dias ou intervalo mudam.
export async function updateRoutineItem(itemId: string, input: RoutineItemInput): Promise<RoutineItemRow> {
    const { data, error } = await supabase
        .from('routine_items')
        .update({
            ...itemDetailColumns(input),
            ...scheduleColumns(input),
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

export type RoutineTaskEdit = {
    title: string
    scheduledOn: IsoDate | null
    isImportant: boolean
    categoryId: string | null
}

// A posição na lista (sort_order) não muda: editar não reordena.
export async function updateRoutineTask(taskId: string, edit: RoutineTaskEdit): Promise<RoutineTaskRow> {
    const { data, error } = await supabase
        .from('routine_tasks')
        .update({
            title: edit.title,
            scheduled_on: edit.scheduledOn,
            is_important: edit.isImportant,
            category_id: edit.categoryId,
        })
        .eq('id', taskId)
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao atualizar tarefa')
    }

    return data
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
        category_id: input.categoryId,
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
        category_id: input.categoryId,
        sort_order: count ?? 0,
    })

    if (error) {
        throw new Error(error.message)
    }
}

// Leva as tarefas para hoje. carried_from_on guarda o dia de onde cada uma
// saiu, então há um update por dia de origem, cada um cobrindo todas as
// tarefas daquele dia de uma vez.
export async function bringTasksForward(tasks: RoutineTaskRow[], today: IsoDate): Promise<void> {
    const taskIdsByOrigin = new Map<IsoDate, string[]>()
    for (const task of tasks) {
        if (task.scheduled_on === null) {
            continue
        }
        const originTaskIds = taskIdsByOrigin.get(task.scheduled_on)
        if (originTaskIds) {
            originTaskIds.push(task.id)
        } else {
            taskIdsByOrigin.set(task.scheduled_on, [task.id])
        }
    }

    const results = await Promise.all(
        [...taskIdsByOrigin].map(([origin, taskIds]) =>
            supabase
                .from('routine_tasks')
                .update({ scheduled_on: today, carried_from_on: origin })
                .in('id', taskIds)
                .is('completed_at', null),
        ),
    )
    const failedResult = results.find((result) => result.error)
    if (failedResult?.error) {
        throw new Error(failedResult.error.message)
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
