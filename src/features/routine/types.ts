import type { AppTab } from '@/features/shared/BottomNav'
import type { Database } from '@/lib/databaseTypes'
import type { IsoDate } from '@/lib/dateUtils'

export type RoutineCategoryRow = Database['public']['Tables']['routine_categories']['Row']
export type RoutineItemRow = Database['public']['Tables']['routine_items']['Row']
export type RoutineItemScheduleRow = Database['public']['Tables']['routine_item_schedules']['Row']
export type RoutineDayEntryRow = Database['public']['Tables']['routine_day_entries']['Row']
export type RoutineTaskRow = Database['public']['Tables']['routine_tasks']['Row']

// Tudo o que a resolução de um dia precisa da rotina: os itens que repetem,
// as versões de agenda deles, as marcações manuais e as tarefas que não
// repetem. Quem busca decide o recorte (um dia, um período); a resolução
// filtra por data sozinha.
export type RoutineData = {
    items: RoutineItemRow[]
    schedules: RoutineItemScheduleRow[]
    entries: RoutineDayEntryRow[]
    tasks: RoutineTaskRow[]
}

export const ROUTINE_LINK_KINDS = [
    'workout_finished',
    'meal:cafe_da_manha',
    'meal:almoco',
    'meal:lanche',
    'meal:jantar',
    'body_weight',
    'sleep',
] as const
export type RoutineLinkKind = (typeof ROUTINE_LINK_KINDS)[number]

export const ROUTINE_LINK_KIND_LABELS: Record<RoutineLinkKind, string> = {
    workout_finished: 'Treino finalizado',
    'meal:cafe_da_manha': 'Café da manhã registrado',
    'meal:almoco': 'Almoço registrado',
    'meal:lanche': 'Café da tarde registrado',
    'meal:jantar': 'Jantar registrado',
    body_weight: 'Peso corporal registrado',
    sleep: 'Sono registrado',
}

// Aba pra onde um item vinculado ainda pendente leva ao ser tocado: peso e
// sono são registrados na seção "Registros do dia" do Menu, não numa aba
// própria.
export const ROUTINE_LINK_KIND_TARGET_TAB: Record<RoutineLinkKind, AppTab> = {
    workout_finished: 'treino',
    'meal:cafe_da_manha': 'alimentacao',
    'meal:almoco': 'alimentacao',
    'meal:lanche': 'alimentacao',
    'meal:jantar': 'alimentacao',
    body_weight: 'menu',
    sleep: 'menu',
}

export type RoutineRowSource = 'linked' | 'manual' | 'task'
export type RoutineRowState = 'done' | 'done_manual_override' | 'pending' | 'moved'

// O que a tela de rotina mostra por linha: dado já resolvido o bastante para
// decidir a ação de tocar (marcar, desmarcar ou ir registrar em outra aba) e
// para saber se o item por trás dela é editável/arquivável na tela de
// gerenciamento. Linhas de item têm routineItemId (e dayEntryId quando há
// marcação manual na data); linhas de tarefa têm taskId. carriedFromDate só
// é preenchido em tarefa trazida de outro dia. Uma linha 'moved' é a sombra,
// no dia antigo, de uma tarefa que foi levada para movedToDate: só leitura e
// fora de qualquer contagem.
export type RoutineRow = {
    id: string
    title: string
    source: RoutineRowSource
    state: RoutineRowState
    linkKind: RoutineLinkKind | null
    routineItemId: string | null
    dayEntryId: string | null
    taskId: string | null
    categoryId: string | null
    isImportant: boolean
    carriedFromDate: IsoDate | null
    movedToDate: IsoDate | null
}
