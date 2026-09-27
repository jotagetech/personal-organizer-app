import { supabase } from '@/lib/supabaseClient'
import type { FoodEntryRow, FoodUnit, MealCategory } from '@/features/food/types'

export type NewFoodEntryInput = {
    entryDate: string
    foodName: string
    quantity: number
    unit: FoodUnit
    mealCategory: MealCategory
}

export async function listFoodEntriesForDate(entryDate: string): Promise<FoodEntryRow[]> {
    const { data, error } = await supabase
        .from('food_entries')
        .select('*')
        .eq('entry_date', entryDate)
        .order('created_at', { ascending: true })

    if (error) {
        throw new Error(error.message)
    }

    return data ?? []
}

export async function createFoodEntry(input: NewFoodEntryInput): Promise<FoodEntryRow> {
    const { data: authData } = await supabase.auth.getUser()
    const currentUserId = authData.user?.id
    if (!currentUserId) {
        throw new Error('Usuário não autenticado')
    }

    const { data, error } = await supabase
        .from('food_entries')
        .insert({
            user_id: currentUserId,
            entry_date: input.entryDate,
            food_name: input.foodName,
            quantity: input.quantity,
            unit: input.unit,
            meal_category: input.mealCategory,
        })
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao salvar consumo')
    }

    return data
}

export async function updateFoodEntry(
    entryId: string,
    input: NewFoodEntryInput,
): Promise<FoodEntryRow> {
    const { data, error } = await supabase
        .from('food_entries')
        .update({
            entry_date: input.entryDate,
            food_name: input.foodName,
            quantity: input.quantity,
            unit: input.unit,
            meal_category: input.mealCategory,
        })
        .eq('id', entryId)
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao atualizar consumo')
    }

    return data
}

export async function deleteFoodEntry(entryId: string): Promise<void> {
    const { error } = await supabase.from('food_entries').delete().eq('id', entryId)
    if (error) {
        throw new Error(error.message)
    }
}
