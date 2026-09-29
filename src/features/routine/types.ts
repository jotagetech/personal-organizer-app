import type { AppTab } from '@/features/shared/BottomNav'
import type { Database } from '@/lib/databaseTypes'

export type RoutineItemRow = Database['public']['Tables']['routine_items']['Row']
export type RoutineDayEntryRow = Database['public']['Tables']['routine_day_entries']['Row']

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

export type RoutineRowSource = 'linked' | 'manual' | 'adhoc'
export type RoutineRowState = 'done' | 'done_manual_override' | 'pending'

// O que a tela de rotina mostra por linha: dado já resolvido o bastante para
// decidir a ação de tocar (marcar, desmarcar ou ir registrar em outra aba) e
// para saber se o item por trás dela é editável/arquivável na tela de
// gerenciamento (só os que vieram de um template, nunca os avulsos do dia).
export type RoutineRow = {
    id: string
    title: string
    source: RoutineRowSource
    state: RoutineRowState
    linkKind: RoutineLinkKind | null
    routineItemId: string | null
    dayEntryId: string | null
}
