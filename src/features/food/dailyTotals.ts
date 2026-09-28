import type { FoodEntryRow } from '@/features/food/types'

export type DailyTotals = {
    kcal: number
    proteinG: number
    carbsG: number
    fatG: number
    entriesWithoutNutrition: number
}

const EMPTY_TOTALS: DailyTotals = {
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    entriesWithoutNutrition: 0,
}

// Soma bruta antes de arredondar, pra um item de 0.4 kcal não ser descartado
// só porque cada parcela isolada arredondaria pra zero.
export function computeDailyTotals(entries: FoodEntryRow[]): DailyTotals {
    const rawTotals = entries.reduce(
        (totals, entry) => ({
            kcal: totals.kcal + (entry.kcal ?? 0),
            proteinG: totals.proteinG + (entry.protein_g ?? 0),
            carbsG: totals.carbsG + (entry.carbs_g ?? 0),
            fatG: totals.fatG + (entry.fat_g ?? 0),
            entriesWithoutNutrition: totals.entriesWithoutNutrition + (entry.kcal === null ? 1 : 0),
        }),
        { ...EMPTY_TOTALS },
    )

    return {
        kcal: Math.round(rawTotals.kcal),
        proteinG: Math.round(rawTotals.proteinG),
        carbsG: Math.round(rawTotals.carbsG),
        fatG: Math.round(rawTotals.fatG),
        entriesWithoutNutrition: rawTotals.entriesWithoutNutrition,
    }
}
