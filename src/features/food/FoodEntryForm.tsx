import { useEffect, useRef, useState } from 'react'

import {
    createFoodItem,
    findFoodItemByExactName,
    listFrequentFoodItems,
    searchFoodItems,
    type FrequentFoodItem,
} from '@/features/food/api'
import { suggestMealCategoryForHour } from '@/features/food/mealSuggestion'
import {
    FOOD_UNITS,
    FOOD_UNIT_LABELS,
    MEAL_CATEGORIES,
    MEAL_CATEGORY_LABELS,
    type FoodItemRow,
    type FoodUnit,
    type MealCategory,
} from '@/features/food/types'
import { todayInTimezone } from '@/lib/dateUtils'

const SEARCH_DEBOUNCE_MS = 250
const MIN_SEARCH_TEXT_LENGTH = 2

export type FoodEntryFormValues = {
    foodName: string
    quantityText: string
    unit: FoodUnit
    mealCategory: MealCategory
}

type FoodEntryFormSubmitValues = {
    foodName: string
    quantity: number
    unit: FoodUnit
    mealCategory: MealCategory
    foodItemId: string | null
}

type FoodEntryFormProps = {
    entryDate: string
    initialValues?: FoodEntryFormValues
    onSubmit: (values: FoodEntryFormSubmitValues) => Promise<void>
    onCancel?: () => void
    submitLabel: string
}

const EMPTY_FORM_VALUES: FoodEntryFormValues = {
    foodName: '',
    quantityText: '',
    unit: 'g',
    mealCategory: 'cafe_da_manha',
}

export function FoodEntryForm({ entryDate, initialValues, onSubmit, onCancel, submitLabel }: FoodEntryFormProps) {
    const [values, setValues] = useState<FoodEntryFormValues>(initialValues ?? EMPTY_FORM_VALUES)
    const [selectedFoodItemId, setSelectedFoodItemId] = useState<string | null>(null)
    const [suggestions, setSuggestions] = useState<FoodItemRow[]>([])
    const [frequentItems, setFrequentItems] = useState<FrequentFoodItem[]>([])
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        void listFrequentFoodItems(entryDate).then(setFrequentItems)

        if (!initialValues && entryDate === todayInTimezone()) {
            const suggestedMealCategory = suggestMealCategoryForHour(new Date().getHours())
            setValues((previous) => ({ ...previous, mealCategory: suggestedMealCategory }))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    function handleFoodNameChange(rawValue: string) {
        setValues({ ...values, foodName: rawValue })
        setSelectedFoodItemId(null)

        if (searchDebounceRef.current) {
            clearTimeout(searchDebounceRef.current)
        }
        if (rawValue.trim().length < MIN_SEARCH_TEXT_LENGTH) {
            setSuggestions([])
            return
        }
        searchDebounceRef.current = setTimeout(() => {
            void searchFoodItems(rawValue).then(setSuggestions)
        }, SEARCH_DEBOUNCE_MS)
    }

    function handleSelectSuggestion(item: FoodItemRow) {
        setValues({ ...values, foodName: item.name })
        setSelectedFoodItemId(item.id)
        setSuggestions([])
    }

    function handleSelectFrequentItem(frequentItem: FrequentFoodItem) {
        setValues({
            foodName: frequentItem.item.name,
            quantityText: String(frequentItem.lastQuantity),
            unit: frequentItem.lastUnit,
            mealCategory: frequentItem.lastMealCategory,
        })
        setSelectedFoodItemId(frequentItem.item.id)
        setSuggestions([])
    }

    async function resolveFoodItemId(foodName: string): Promise<string> {
        if (selectedFoodItemId) {
            return selectedFoodItemId
        }

        const existingItem = await findFoodItemByExactName(foodName)
        if (existingItem) {
            return existingItem.id
        }

        const createdItem = await createFoodItem(foodName)
        return createdItem.id
    }

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
            const foodItemId = await resolveFoodItemId(trimmedFoodName)
            await onSubmit({
                foodName: trimmedFoodName,
                quantity,
                unit: values.unit,
                mealCategory: values.mealCategory,
                foodItemId,
            })
            setValues(EMPTY_FORM_VALUES)
            setSelectedFoodItemId(null)
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
            {frequentItems.length > 0 && (
                <div className="food-chip-row">
                    {frequentItems.map((frequentItem) => (
                        <button
                            key={frequentItem.item.id}
                            type="button"
                            className="food-chip"
                            onClick={() => handleSelectFrequentItem(frequentItem)}
                        >
                            {frequentItem.item.name}
                        </button>
                    ))}
                </div>
            )}
            <div className="field">
                <label htmlFor="food-name">Alimento</label>
                <input
                    id="food-name"
                    type="text"
                    value={values.foodName}
                    onChange={(event) => handleFoodNameChange(event.target.value)}
                    placeholder="ex: Filé de peito de frango"
                    autoComplete="off"
                />
                {suggestions.length > 0 && (
                    <div className="food-suggestion-list">
                        {suggestions.map((suggestion) => (
                            <button
                                key={suggestion.id}
                                type="button"
                                className="food-suggestion-list__item"
                                onClick={() => handleSelectSuggestion(suggestion)}
                            >
                                {suggestion.name}
                            </button>
                        ))}
                    </div>
                )}
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
