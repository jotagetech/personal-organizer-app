import { shiftIsoDate } from '@/lib/dateUtils'
import { supabase } from '@/lib/supabaseClient'
import type { FoodEntryRow, FoodItemRow, FoodUnit, MealCategory } from '@/features/food/types'

const FREQUENT_LOOKBACK_DAYS = 30
const FREQUENT_ITEMS_LIMIT = 10
const FREQUENT_ENTRIES_SAMPLE_LIMIT = 300

export type NewFoodEntryInput = {
    entryDate: string
    foodName: string
    quantity: number
    unit: FoodUnit
    mealCategory: MealCategory
    foodItemId: string | null
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
            food_item_id: input.foodItemId,
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
            food_item_id: input.foodItemId,
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

export async function listFoodItems(): Promise<FoodItemRow[]> {
    const { data, error } = await supabase.from('food_items').select('*').order('name', { ascending: true })

    if (error) {
        throw new Error(error.message)
    }

    return data ?? []
}

export async function searchFoodItems(searchText: string, limit = 5): Promise<FoodItemRow[]> {
    const trimmedSearchText = searchText.trim()
    if (trimmedSearchText === '') {
        return []
    }

    const { data, error } = await supabase
        .from('food_items')
        .select('*')
        .ilike('name', `%${trimmedSearchText}%`)
        .order('name', { ascending: true })
        .limit(limit)

    if (error) {
        throw new Error(error.message)
    }

    return data ?? []
}

export async function findFoodItemByExactName(name: string): Promise<FoodItemRow | null> {
    const trimmedName = name.trim()
    if (trimmedName === '') {
        return null
    }

    const { data, error } = await supabase
        .from('food_items')
        .select('*')
        .ilike('name', trimmedName)
        .limit(1)
        .maybeSingle()

    if (error) {
        throw new Error(error.message)
    }

    return data
}

export async function createFoodItem(name: string): Promise<FoodItemRow> {
    const { data: authData } = await supabase.auth.getUser()
    const currentUserId = authData.user?.id
    if (!currentUserId) {
        throw new Error('Usuário não autenticado')
    }

    const { data, error } = await supabase
        .from('food_items')
        .insert({ user_id: currentUserId, name })
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao criar alimento')
    }

    return data
}

export type FoodItemNutritionInput = {
    referenceQuantity: number | null
    referenceUnit: FoodUnit | null
    kcal: number | null
    proteinG: number | null
    carbsG: number | null
    fatG: number | null
}

export async function updateFoodItemNutrition(
    itemId: string,
    input: FoodItemNutritionInput,
): Promise<FoodItemRow> {
    const { data, error } = await supabase
        .from('food_items')
        .update({
            reference_quantity: input.referenceQuantity,
            reference_unit: input.referenceUnit,
            kcal: input.kcal,
            protein_g: input.proteinG,
            carbs_g: input.carbsG,
            fat_g: input.fatG,
        })
        .eq('id', itemId)
        .select('*')
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Falha ao atualizar nutrição do alimento')
    }

    return data
}

export async function deleteFoodItem(itemId: string): Promise<void> {
    const { error } = await supabase.from('food_items').delete().eq('id', itemId)
    if (error) {
        throw new Error(error.message)
    }
}

export type FrequentFoodItem = {
    item: FoodItemRow
    lastQuantity: number
    lastUnit: FoodUnit
    lastMealCategory: MealCategory
}

export async function listFrequentFoodItems(referenceDate: string): Promise<FrequentFoodItem[]> {
    const sinceDate = shiftIsoDate(referenceDate, -FREQUENT_LOOKBACK_DAYS)

    const { data: recentEntries, error } = await supabase
        .from('food_entries')
        .select('food_item_id, quantity, unit, meal_category, created_at')
        .not('food_item_id', 'is', null)
        .gte('entry_date', sinceDate)
        .order('created_at', { ascending: false })
        .limit(FREQUENT_ENTRIES_SAMPLE_LIMIT)

    if (error) {
        throw new Error(error.message)
    }

    const occurrenceCountByItemId = new Map<string, number>()
    const mostRecentByItemId = new Map<string, { quantity: number; unit: string; mealCategory: string }>()

    for (const entry of recentEntries ?? []) {
        const itemId = entry.food_item_id
        if (!itemId) {
            continue
        }

        occurrenceCountByItemId.set(itemId, (occurrenceCountByItemId.get(itemId) ?? 0) + 1)
        if (!mostRecentByItemId.has(itemId)) {
            mostRecentByItemId.set(itemId, {
                quantity: entry.quantity,
                unit: entry.unit,
                mealCategory: entry.meal_category,
            })
        }
    }

    const topItemIds = Array.from(occurrenceCountByItemId.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, FREQUENT_ITEMS_LIMIT)
        .map(([itemId]) => itemId)

    if (topItemIds.length === 0) {
        return []
    }

    const { data: items, error: itemsError } = await supabase
        .from('food_items')
        .select('*')
        .in('id', topItemIds)

    if (itemsError) {
        throw new Error(itemsError.message)
    }

    const itemById = new Map((items ?? []).map((item) => [item.id, item]))

    const frequentItems = topItemIds
        .map((itemId) => {
            const item = itemById.get(itemId)
            const mostRecent = mostRecentByItemId.get(itemId)
            if (!item || !mostRecent) {
                return null
            }

            const frequentItem: FrequentFoodItem = {
                item,
                lastQuantity: mostRecent.quantity,
                lastUnit: mostRecent.unit as FoodUnit,
                lastMealCategory: mostRecent.mealCategory as MealCategory,
            }
            return frequentItem
        })
        .filter((entry): entry is FrequentFoodItem => entry !== null)

    return frequentItems
}
