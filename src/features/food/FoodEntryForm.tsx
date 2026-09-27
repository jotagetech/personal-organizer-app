import { useState } from 'react'

import {
    FOOD_UNITS,
    FOOD_UNIT_LABELS,
    MEAL_CATEGORIES,
    MEAL_CATEGORY_LABELS,
    type FoodUnit,
    type MealCategory,
} from '@/features/food/types'

export type FoodEntryFormValues = {
    foodName: string
    quantityText: string
    unit: FoodUnit
    mealCategory: MealCategory
}

type FoodEntryFormProps = {
    initialValues?: FoodEntryFormValues
    onSubmit: (values: { foodName: string; quantity: number; unit: FoodUnit; mealCategory: MealCategory }) => Promise<void>
    onCancel?: () => void
    submitLabel: string
}

const EMPTY_FORM_VALUES: FoodEntryFormValues = {
    foodName: '',
    quantityText: '',
    unit: 'g',
    mealCategory: 'cafe_da_manha',
}

export function FoodEntryForm({ initialValues, onSubmit, onCancel, submitLabel }: FoodEntryFormProps) {
    const [values, setValues] = useState<FoodEntryFormValues>(initialValues ?? EMPTY_FORM_VALUES)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault()

        const trimmedFoodName = values.foodName.trim()
        const normalizedQuantityText = values.quantityText.trim().replace(',', '.')
        const quantity = Number(normalizedQuantityText)

        if (trimmedFoodName === '') {
            setErrorMessage('Informe o alimento.')
            return
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
            setErrorMessage('Quantidade precisa ser maior que zero.')
            return
        }

        setErrorMessage(null)
        setIsSubmitting(true)
        try {
            await onSubmit({ foodName: trimmedFoodName, quantity, unit: values.unit, mealCategory: values.mealCategory })
            setValues(EMPTY_FORM_VALUES)
        } catch (submitError) {
            const message = submitError instanceof Error ? submitError.message : 'Falha ao salvar'
            setErrorMessage(message)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            {errorMessage && <div className="error-list">{errorMessage}</div>}
            <div className="field">
                <label htmlFor="food-name">Alimento</label>
                <input
                    id="food-name"
                    type="text"
                    value={values.foodName}
                    onChange={(event) => setValues({ ...values, foodName: event.target.value })}
                    placeholder="ex: Filé de peito de frango"
                />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <div className="field" style={{ flex: 1 }}>
                    <label htmlFor="food-quantity">Quantidade</label>
                    <input
                        id="food-quantity"
                        type="text"
                        inputMode="decimal"
                        value={values.quantityText}
                        onChange={(event) => setValues({ ...values, quantityText: event.target.value })}
                        placeholder="ex: 150"
                    />
                </div>
                <div className="field" style={{ flex: 1 }}>
                    <label htmlFor="food-unit">Unidade</label>
                    <select
                        id="food-unit"
                        value={values.unit}
                        onChange={(event) => setValues({ ...values, unit: event.target.value as FoodUnit })}
                    >
                        {FOOD_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                                {FOOD_UNIT_LABELS[unit]}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="field">
                <label htmlFor="food-meal">Refeição</label>
                <select
                    id="food-meal"
                    value={values.mealCategory}
                    onChange={(event) => setValues({ ...values, mealCategory: event.target.value as MealCategory })}
                >
                    {MEAL_CATEGORIES.map((mealCategory) => (
                        <option key={mealCategory} value={mealCategory}>
                            {MEAL_CATEGORY_LABELS[mealCategory]}
                        </option>
                    ))}
                </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="primary-button" disabled={isSubmitting}>
                    {isSubmitting ? 'Salvando...' : submitLabel}
                </button>
                {onCancel && (
                    <button type="button" className="secondary-button" onClick={onCancel}>
                        Cancelar
                    </button>
                )}
            </div>
        </form>
    )
}
