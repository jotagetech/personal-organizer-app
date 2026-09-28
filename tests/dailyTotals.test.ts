import { describe, expect, it } from 'vitest'

import { computeDailyTotals } from '@/features/food/dailyTotals'
import type { FoodEntryRow } from '@/features/food/types'

let entryCounter = 0

function buildEntry(overrides: Partial<FoodEntryRow> = {}): FoodEntryRow {
    entryCounter += 1

    return {
        id: `entry-${entryCounter}`,
        user_id: 'user-1',
        entry_date: '2026-09-28',
        food_name: 'Alimento de teste',
        quantity: 100,
        unit: 'g',
        meal_category: 'almoco',
        food_item_id: null,
        kcal: null,
        protein_g: null,
        carbs_g: null,
        fat_g: null,
        created_at: '2026-09-28T12:00:00.000Z',
        updated_at: '2026-09-28T12:00:00.000Z',
        ...overrides,
    }
}

describe('computeDailyTotals', () => {
    it('soma kcal e macros de entradas com valores presentes', () => {
        const entries = [
            buildEntry({ kcal: 200, protein_g: 10, carbs_g: 25, fat_g: 5 }),
            buildEntry({ kcal: 300, protein_g: 20, carbs_g: 30, fat_g: 8 }),
        ]

        const totals = computeDailyTotals(entries)

        expect(totals).toEqual({
            kcal: 500,
            proteinG: 30,
            carbsG: 55,
            fatG: 13,
            entriesWithoutNutrition: 0,
        })
    })

    it('trata campos nutricionais null como zero e conta a entrada como sem nutrição', () => {
        const entries = [
            buildEntry({ kcal: 200, protein_g: 10, carbs_g: 25, fat_g: 5 }),
            buildEntry({ kcal: null, protein_g: null, carbs_g: null, fat_g: null }),
        ]

        const totals = computeDailyTotals(entries)

        expect(totals).toEqual({
            kcal: 200,
            proteinG: 10,
            carbsG: 25,
            fatG: 5,
            entriesWithoutNutrition: 1,
        })
    })

    it('devolve zeros para uma lista vazia', () => {
        const totals = computeDailyTotals([])

        expect(totals).toEqual({
            kcal: 0,
            proteinG: 0,
            carbsG: 0,
            fatG: 0,
            entriesWithoutNutrition: 0,
        })
    })

    it('arredonda o total final, sem descartar parcelas que isoladas arredondariam a zero', () => {
        const entries = [
            buildEntry({ kcal: 0.4, protein_g: 0.2, carbs_g: 0.2, fat_g: 0.2 }),
            buildEntry({ kcal: 0.4, protein_g: 0.2, carbs_g: 0.2, fat_g: 0.2 }),
            buildEntry({ kcal: 99.6, protein_g: 9.6, carbs_g: 9.6, fat_g: 9.6 }),
        ]

        const totals = computeDailyTotals(entries)

        expect(totals).toEqual({
            kcal: 100,
            proteinG: 10,
            carbsG: 10,
            fatG: 10,
            entriesWithoutNutrition: 0,
        })
    })
})
