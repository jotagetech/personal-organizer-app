import { useState } from 'react'

import { FoodEntryForm } from '@/features/food/FoodEntryForm'
import {
    MEAL_CATEGORIES,
    MEAL_CATEGORY_LABELS,
    FOOD_UNIT_LABELS,
    type FoodEntryRow,
    type FoodUnit,
    type MealCategory,
} from '@/features/food/types'

type FoodEntrySubmitValues = {
    foodName: string
    quantity: number
    unit: FoodUnit
    mealCategory: MealCategory
    foodItemId: string | null
}

type FoodEntryListProps = {
    entryDate: string
    entries: FoodEntryRow[]
    onUpdate: (entryId: string, values: FoodEntrySubmitValues) => Promise<void>
    onDelete: (entryId: string) => Promise<void>
}

export function FoodEntryList({ entryDate, entries, onUpdate, onDelete }: FoodEntryListProps) {
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null)

    if (entries.length === 0) {
        return <p style={{ color: '#71717a' }}>Nenhum consumo registrado neste dia.</p>
    }

    return (
        <div>
            {MEAL_CATEGORIES.map((mealCategory) => {
                const entriesForMeal = entries.filter((entry) => entry.meal_category === mealCategory)
                if (entriesForMeal.length === 0) {
                    return null
                }

                return (
                    <div key={mealCategory} style={{ marginBottom: 16 }}>
                        <h3 style={{ fontSize: 14, marginBottom: 6 }}>{MEAL_CATEGORY_LABELS[mealCategory]}</h3>
                        {entriesForMeal.map((entry) => (
                            <div key={entry.id} className="card">
                                {editingEntryId === entry.id ? (
                                    <FoodEntryForm
                                        entryDate={entryDate}
                                        submitLabel="Salvar"
                                        initialValues={{
                                            foodName: entry.food_name,
                                            quantityText: String(entry.quantity),
                                            unit: entry.unit as FoodUnit,
                                            mealCategory: entry.meal_category as MealCategory,
                                        }}
                                        onCancel={() => setEditingEntryId(null)}
                                        onSubmit={async (values) => {
                                            await onUpdate(entry.id, values)
                                            setEditingEntryId(null)
                                        }}
                                    />
                                ) : (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <strong>{entry.food_name}</strong>
                                            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#52525b' }}>
                                                {entry.quantity} {FOOD_UNIT_LABELS[entry.unit as FoodUnit]}
                                                {entry.kcal !== null ? ` · ${entry.kcal} kcal` : ''}
                                                {entry.protein_g !== null ? ` · ${entry.protein_g} g P` : ''}
                                            </p>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button
                                                type="button"
                                                className="secondary-button"
                                                onClick={() => setEditingEntryId(entry.id)}
                                            >
                                                Editar
                                            </button>
                                            <button
                                                type="button"
                                                className="secondary-button"
                                                onClick={() => handleDeleteClick(entry.id, onDelete)}
                                            >
                                                Excluir
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )
            })}
        </div>
    )
}

async function handleDeleteClick(entryId: string, onDelete: (entryId: string) => Promise<void>) {
    const confirmedDeletion = window.confirm('Excluir este consumo?')
    if (!confirmedDeletion) {
        return
    }
    await onDelete(entryId)
}
