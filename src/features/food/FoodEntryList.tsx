import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { useUndoableActions } from '@/contexts/UndoableActionContext'
import { FoodEntryForm } from '@/features/food/FoodEntryForm'
import { lacksNutrition } from '@/features/food/dailyTotals'
import {
    MEAL_CATEGORIES,
    MEAL_CATEGORY_LABELS,
    FOOD_UNIT_LABELS,
    type FoodEntryRow,
    type FoodUnit,
    type MealCategory,
} from '@/features/food/types'

const ROW_ACTION_ICON_SIZE = 20

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
    const { scheduleDeletion, isPendingDeletion } = useUndoableActions()
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
    const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null)

    const visibleEntries = entries.filter((entry) => !isPendingDeletion(entry.id))

    function handleDeleteClick(entry: FoodEntryRow) {
        setDeleteErrorMessage(null)
        scheduleDeletion({
            id: entry.id,
            label: `Alimentação: ${entry.food_name}`,
            commit: () => onDelete(entry.id),
            onRestored: () => setDeleteErrorMessage('Não foi possível excluir esse consumo.'),
        })
    }

    if (visibleEntries.length === 0) {
        return (
            <>
                {deleteErrorMessage && <div className="error-list">{deleteErrorMessage}</div>}
                <p className="text-muted">Nenhum consumo registrado neste dia.</p>
            </>
        )
    }

    return (
        <div>
            {deleteErrorMessage && <div className="error-list">{deleteErrorMessage}</div>}
            {MEAL_CATEGORIES.map((mealCategory) => {
                const entriesForMeal = visibleEntries.filter((entry) => entry.meal_category === mealCategory)
                if (entriesForMeal.length === 0) {
                    return null
                }

                return (
                    <section key={mealCategory}>
                        <h3 className="food-entry-list__meal-title">{MEAL_CATEGORY_LABELS[mealCategory]}</h3>
                        <div className="card food-list">
                            {entriesForMeal.map((entry) =>
                                editingEntryId === entry.id ? (
                                    <div key={entry.id} className="food-list__row food-list__row--editing">
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
                                    </div>
                                ) : (
                                    <div
                                        key={entry.id}
                                        className={
                                            lacksNutrition(entry)
                                                ? 'food-list__row food-list__row--no-nutrition'
                                                : 'food-list__row'
                                        }
                                    >
                                        <div className="food-list__text">
                                            <strong className="food-list__name">{entry.food_name}</strong>
                                            <p className="food-list__meta">
                                                {entry.quantity} {FOOD_UNIT_LABELS[entry.unit as FoodUnit]}
                                                {entry.protein_g !== null ? ` · ${entry.protein_g} g P` : ''}
                                            </p>
                                        </div>
                                        {entry.kcal !== null && (
                                            <div className="food-list__value">
                                                <strong>{entry.kcal}</strong>
                                                <span>kcal</span>
                                            </div>
                                        )}
                                        <div className="food-list__actions">
                                            <button
                                                type="button"
                                                className="icon-button"
                                                aria-label="Editar"
                                                onClick={() => setEditingEntryId(entry.id)}
                                            >
                                                <Pencil size={ROW_ACTION_ICON_SIZE} aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                className="icon-button"
                                                aria-label="Excluir"
                                                onClick={() => handleDeleteClick(entry)}
                                            >
                                                <Trash2 size={ROW_ACTION_ICON_SIZE} aria-hidden="true" />
                                            </button>
                                        </div>
                                    </div>
                                ),
                            )}
                        </div>
                    </section>
                )
            })}
        </div>
    )
}
