import type { FrequentFoodItem } from '@/features/food/api'
import type { FoodUnit, MealCategory } from '@/features/food/types'

export type FoodEntryFormValues = {
    foodName: string
    quantityText: string
    unit: FoodUnit
    mealCategory: MealCategory
}

export const EMPTY_FORM_VALUES: FoodEntryFormValues = {
    foodName: '',
    quantityText: '',
    unit: 'g',
    mealCategory: 'cafe_da_manha',
}

// Uma refeição costuma ter vários itens lançados em sequência: depois de
// salvar, só o item é limpo e a refeição escolhida continua valendo.
export function formValuesAfterSubmit(submitted: FoodEntryFormValues): FoodEntryFormValues {
    return { ...EMPTY_FORM_VALUES, mealCategory: submitted.mealCategory }
}

// O atalho de frequentes preenche o item, mas não troca a refeição que já foi
// escolhida: a refeição em que o alimento foi usado da última vez não diz nada
// sobre a que está sendo lançada agora.
export function applyFrequentItem(current: FoodEntryFormValues, frequentItem: FrequentFoodItem): FoodEntryFormValues {
    return {
        foodName: frequentItem.item.name,
        quantityText: String(frequentItem.lastQuantity),
        unit: frequentItem.lastUnit,
        mealCategory: current.mealCategory,
    }
}
