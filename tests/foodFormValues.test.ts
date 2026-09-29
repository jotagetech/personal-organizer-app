import { describe, expect, it } from 'vitest'

import type { FrequentFoodItem } from '@/features/food/api'
import { applyFrequentItem, formValuesAfterSubmit, type FoodEntryFormValues } from '@/features/food/foodFormValues'
import type { FoodItemRow } from '@/features/food/types'

const LUNCH_VALUES: FoodEntryFormValues = {
    foodName: 'Arroz branco cozido',
    quantityText: '150',
    unit: 'g',
    mealCategory: 'almoco',
}

function buildFrequentItem(overrides: Partial<FrequentFoodItem> = {}): FrequentFoodItem {
    return {
        item: { id: 'item-1', name: 'Feijão carioca cozido' } as FoodItemRow,
        lastQuantity: 2,
        lastUnit: 'colher',
        lastMealCategory: 'jantar',
        ...overrides,
    }
}

describe('formValuesAfterSubmit', () => {
    it('limpa o item e mantém a refeição escolhida', () => {
        expect(formValuesAfterSubmit(LUNCH_VALUES)).toEqual({
            foodName: '',
            quantityText: '',
            unit: 'g',
            mealCategory: 'almoco',
        })
    })
})

describe('applyFrequentItem', () => {
    it('preenche alimento, quantidade e unidade do atalho', () => {
        const nextValues = applyFrequentItem(LUNCH_VALUES, buildFrequentItem())

        expect(nextValues.foodName).toBe('Feijão carioca cozido')
        expect(nextValues.quantityText).toBe('2')
        expect(nextValues.unit).toBe('colher')
    })

    it('não troca a refeição já escolhida pela última refeição do atalho', () => {
        const nextValues = applyFrequentItem(LUNCH_VALUES, buildFrequentItem({ lastMealCategory: 'jantar' }))

        expect(nextValues.mealCategory).toBe('almoco')
    })
})
