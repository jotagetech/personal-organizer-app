import { useEffect, useState } from 'react'

import {
    deleteFoodItem,
    listFoodItems,
    searchFoodItems,
    updateFoodItemNutrition,
} from '@/features/food/api'
import { FOOD_UNITS, FOOD_UNIT_LABELS, type FoodItemRow, type FoodUnit } from '@/features/food/types'

type FoodItemsCatalogProps = {
    onClose: () => void
}

export function FoodItemsCatalog({ onClose }: FoodItemsCatalogProps) {
    const [customItems, setCustomItems] = useState<FoodItemRow[]>([])
    const [searchText, setSearchText] = useState('')
    const [searchResults, setSearchResults] = useState<FoodItemRow[]>([])
    const [editingItemId, setEditingItemId] = useState<string | null>(null)

    useEffect(() => {
        void loadCustomItems()
    }, [])

    async function loadCustomItems() {
        const allItems = await listFoodItems()
        setCustomItems(allItems.filter((item) => !item.is_seed))
    }

    function handleSearchChange(rawValue: string) {
        setSearchText(rawValue)
        if (rawValue.trim().length < 2) {
            setSearchResults([])
            return
        }
        void searchFoodItems(rawValue, 15).then(setSearchResults)
    }

    async function handleDelete(itemId: string) {
        const confirmedDeletion = window.confirm(
            'Excluir esse alimento do catálogo? Consumos já registrados com ele não são apagados.',
        )
        if (!confirmedDeletion) {
            return
        }
        await deleteFoodItem(itemId)
        await loadCustomItems()
        setSearchResults((previous) => previous.filter((item) => item.id !== itemId))
    }

    const visibleItems = searchText.trim().length >= 2 ? searchResults : customItems

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h2 style={{ fontSize: 16, margin: 0 }}>Catálogo de alimentos</h2>
                <button type="button" className="secondary-button" onClick={onClose}>
                    Fechar
                </button>
            </div>
            <div className="field">
                <label htmlFor="catalog-search">Buscar alimento</label>
                <input
                    id="catalog-search"
                    type="text"
                    value={searchText}
                    onChange={(event) => handleSearchChange(event.target.value)}
                    placeholder="ex: arroz"
                />
            </div>
            <p style={{ fontSize: 12, color: '#71717a', marginTop: 0 }}>
                {searchText.trim().length >= 2
                    ? `${visibleItems.length} resultado(s)`
                    : 'Seus alimentos cadastrados. Busque acima pra editar a nutrição de qualquer item da TACO.'}
            </p>
            {visibleItems.map((item) =>
                editingItemId === item.id ? (
                    <FoodItemEditRow
                        key={item.id}
                        item={item}
                        onCancel={() => setEditingItemId(null)}
                        onSaved={async () => {
                            setEditingItemId(null)
                            await loadCustomItems()
                            if (searchText.trim().length >= 2) {
                                void searchFoodItems(searchText, 15).then(setSearchResults)
                            }
                        }}
                    />
                ) : (
                    <div key={item.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <strong>{item.name}</strong>
                            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#52525b' }}>
                                {item.kcal !== null
                                    ? `${item.kcal} kcal / ${item.reference_quantity}${item.reference_unit}`
                                    : 'sem nutrição cadastrada'}
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" className="secondary-button" onClick={() => setEditingItemId(item.id)}>
                                Editar
                            </button>
                            {!item.is_seed && (
                                <button type="button" className="secondary-button" onClick={() => handleDelete(item.id)}>
                                    Excluir
                                </button>
                            )}
                        </div>
                    </div>
                ),
            )}
        </div>
    )
}

function FoodItemEditRow({
    item,
    onCancel,
    onSaved,
}: {
    item: FoodItemRow
    onCancel: () => void
    onSaved: () => Promise<void>
}) {
    const [referenceQuantityText, setReferenceQuantityText] = useState(
        item.reference_quantity !== null ? String(item.reference_quantity) : '100',
    )
    const [referenceUnit, setReferenceUnit] = useState<FoodUnit>((item.reference_unit as FoodUnit) ?? 'g')
    const [kcalText, setKcalText] = useState(item.kcal !== null ? String(item.kcal) : '')
    const [proteinText, setProteinText] = useState(item.protein_g !== null ? String(item.protein_g) : '')
    const [carbsText, setCarbsText] = useState(item.carbs_g !== null ? String(item.carbs_g) : '')
    const [fatText, setFatText] = useState(item.fat_g !== null ? String(item.fat_g) : '')
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    async function handleSave() {
        const referenceQuantity = parseOptionalNumber(referenceQuantityText)
        const kcal = parseOptionalNumber(kcalText)
        const proteinG = parseOptionalNumber(proteinText)
        const carbsG = parseOptionalNumber(carbsText)
        const fatG = parseOptionalNumber(fatText)

        const hasAnyNutrition = kcal !== null || proteinG !== null || carbsG !== null || fatG !== null
        if (hasAnyNutrition && referenceQuantity === null) {
            setErrorMessage('Informe a quantidade de referência (ex: 100) pra registrar nutrição.')
            return
        }

        setErrorMessage(null)
        setIsSubmitting(true)
        try {
            await updateFoodItemNutrition(item.id, {
                referenceQuantity: hasAnyNutrition ? referenceQuantity : null,
                referenceUnit: hasAnyNutrition ? referenceUnit : null,
                kcal,
                proteinG,
                carbsG,
                fatG,
            })
            await onSaved()
        } catch (saveError) {
            const message = saveError instanceof Error ? saveError.message : 'Falha ao salvar'
            setErrorMessage(message)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="card">
            <strong>{item.name}</strong>
            {errorMessage && <div className="error-list">{errorMessage}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Quantidade de referência</label>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={referenceQuantityText}
                        onChange={(event) => setReferenceQuantityText(event.target.value)}
                        placeholder="ex: 100"
                    />
                </div>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Unidade</label>
                    <select value={referenceUnit} onChange={(event) => setReferenceUnit(event.target.value as FoodUnit)}>
                        {FOOD_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                                {FOOD_UNIT_LABELS[unit]}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Kcal</label>
                    <input type="text" inputMode="decimal" value={kcalText} onChange={(event) => setKcalText(event.target.value)} />
                </div>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Proteína (g)</label>
                    <input type="text" inputMode="decimal" value={proteinText} onChange={(event) => setProteinText(event.target.value)} />
                </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Carboidrato (g)</label>
                    <input type="text" inputMode="decimal" value={carbsText} onChange={(event) => setCarbsText(event.target.value)} />
                </div>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Gordura (g)</label>
                    <input type="text" inputMode="decimal" value={fatText} onChange={(event) => setFatText(event.target.value)} />
                </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" className="primary-button" disabled={isSubmitting} onClick={handleSave}>
                    {isSubmitting ? 'Salvando...' : 'Salvar'}
                </button>
                <button type="button" className="secondary-button" onClick={onCancel}>
                    Cancelar
                </button>
            </div>
        </div>
    )
}

function parseOptionalNumber(text: string): number | null {
    const normalizedText = text.trim().replace(',', '.')
    if (normalizedText === '') {
        return null
    }
    const parsedValue = Number(normalizedText)
    if (!Number.isFinite(parsedValue)) {
        return null
    }
    return parsedValue
}
