import { describe, expect, it } from 'vitest'

import { suggestMealCategoryForHour } from '@/features/food/mealSuggestion'

describe('suggestMealCategoryForHour', () => {
    it('sugere café da manhã antes das 10h', () => {
        expect(suggestMealCategoryForHour(7)).toBe('cafe_da_manha')
        expect(suggestMealCategoryForHour(9)).toBe('cafe_da_manha')
    })

    it('sugere almoço entre 10h e 14h', () => {
        expect(suggestMealCategoryForHour(10)).toBe('almoco')
        expect(suggestMealCategoryForHour(14)).toBe('almoco')
    })

    it('sugere lanche entre 15h e 17h', () => {
        expect(suggestMealCategoryForHour(15)).toBe('lanche')
        expect(suggestMealCategoryForHour(17)).toBe('lanche')
    })

    it('sugere jantar a partir das 18h', () => {
        expect(suggestMealCategoryForHour(18)).toBe('jantar')
        expect(suggestMealCategoryForHour(23)).toBe('jantar')
    })
})
