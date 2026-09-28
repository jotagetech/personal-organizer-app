import type { MealCategory } from '@/features/food/types'

export function suggestMealCategoryForHour(hour: number): MealCategory {
    if (hour < 10) {
        return 'cafe_da_manha'
    }
    if (hour < 15) {
        return 'almoco'
    }
    if (hour < 18) {
        return 'lanche'
    }
    return 'jantar'
}
