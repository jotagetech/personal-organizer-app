import type { Database } from '@/lib/databaseTypes'

export type FoodEntryRow = Database['public']['Tables']['food_entries']['Row']

export const FOOD_UNITS = ['g', 'ml', 'unidade', 'porcao', 'colher'] as const
export type FoodUnit = (typeof FOOD_UNITS)[number]

export const MEAL_CATEGORIES = [
    'cafe_da_manha',
    'almoco',
    'lanche',
    'jantar',
    'outros',
] as const
export type MealCategory = (typeof MEAL_CATEGORIES)[number]

export const FOOD_UNIT_LABELS: Record<FoodUnit, string> = {
    g: 'g',
    ml: 'ml',
    unidade: 'unidade',
    porcao: 'porção',
    colher: 'colher',
}

export const MEAL_CATEGORY_LABELS: Record<MealCategory, string> = {
    cafe_da_manha: 'Café da manhã',
    almoco: 'Almoço',
    lanche: 'Lanche',
    jantar: 'Jantar',
    outros: 'Outros',
}
