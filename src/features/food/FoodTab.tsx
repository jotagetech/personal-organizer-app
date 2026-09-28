import { useEffect, useRef, useState } from 'react'

import { useSelectedDate } from '@/contexts/SelectedDateContext'
import {
    createFoodEntry,
    deleteFoodEntry,
    listFoodEntriesForDate,
    updateFoodEntry,
} from '@/features/food/api'
import { FoodEntryForm } from '@/features/food/FoodEntryForm'
import { FoodEntryList } from '@/features/food/FoodEntryList'
import { FoodItemsCatalog } from '@/features/food/FoodItemsCatalog'
import type { FoodEntryRow } from '@/features/food/types'

export function FoodTab() {
    const { selectedDate } = useSelectedDate()
    const [entries, setEntries] = useState<FoodEntryRow[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [isCatalogOpen, setIsCatalogOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    async function reloadEntries() {
        setIsLoading(true)
        setErrorMessage(null)
        try {
            const nextEntries = await listFoodEntriesForDate(selectedDate)
            setEntries(nextEntries)
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : 'Falha ao carregar refeições'
            setErrorMessage(message)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        void reloadEntries()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate])

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    if (isCatalogOpen) {
        return <FoodItemsCatalog onClose={() => setIsCatalogOpen(false)} />
    }

    const dailyTotals = entries.reduce(
        (totals, entry) => ({
            kcal: totals.kcal + (entry.kcal ?? 0),
            proteinG: totals.proteinG + (entry.protein_g ?? 0),
            entriesWithoutNutrition: totals.entriesWithoutNutrition + (entry.kcal === null ? 1 : 0),
        }),
        { kcal: 0, proteinG: 0, entriesWithoutNutrition: 0 },
    )

    return (
        <div>
            <div className="workout-toolbar">
                {entries.length > 0 && (
                    <span className="cycle-badge">
                        {Math.round(dailyTotals.kcal)} kcal · {Math.round(dailyTotals.proteinG)} g P
                        {dailyTotals.entriesWithoutNutrition > 0
                            ? ` · ${dailyTotals.entriesWithoutNutrition} sem nutrição`
                            : ''}
                    </span>
                )}
                <div className="overflow-menu" ref={menuRef}>
                    <button
                        type="button"
                        className="icon-button"
                        aria-label="Mais ações"
                        onClick={() => setIsMenuOpen((previous) => !previous)}
                    >
                        ⋮
                    </button>
                    {isMenuOpen && (
                        <div className="overflow-menu__panel">
                            <button
                                type="button"
                                className="overflow-menu__item"
                                onClick={() => {
                                    setIsCatalogOpen(true)
                                    setIsMenuOpen(false)
                                }}
                            >
                                Catálogo de alimentos
                            </button>
                        </div>
                    )}
                </div>
            </div>
            <div className="card">
                <h2 style={{ fontSize: 16, marginTop: 0 }}>Adicionar consumo</h2>
                <FoodEntryForm
                    entryDate={selectedDate}
                    submitLabel="Adicionar"
                    onSubmit={async (values) => {
                        await createFoodEntry({ entryDate: selectedDate, ...values })
                        await reloadEntries()
                    }}
                />
            </div>
            {isLoading && <p>Carregando...</p>}
            {errorMessage && <div className="error-list">{errorMessage}</div>}
            {!isLoading && !errorMessage && (
                <FoodEntryList
                    entryDate={selectedDate}
                    entries={entries}
                    onUpdate={async (entryId, values) => {
                        await updateFoodEntry(entryId, { entryDate: selectedDate, ...values })
                        await reloadEntries()
                    }}
                    onDelete={async (entryId) => {
                        await deleteFoodEntry(entryId)
                        await reloadEntries()
                    }}
                />
            )}
        </div>
    )
}
