import { useEffect, useRef, useState } from 'react'

import { useDayStatus } from '@/contexts/DayStatusContext'
import { useSelectedDate } from '@/contexts/SelectedDateContext'
import {
    createFoodEntry,
    deleteFoodEntry,
    listFoodEntriesForDate,
    updateFoodEntry,
} from '@/features/food/api'
import { DailyTotalsCard } from '@/features/food/DailyTotalsCard'
import { FoodEntryForm } from '@/features/food/FoodEntryForm'
import { FoodEntryList } from '@/features/food/FoodEntryList'
import { FoodItemsCatalog } from '@/features/food/FoodItemsCatalog'
import type { FoodEntryRow } from '@/features/food/types'

export function FoodTab() {
    const { selectedDate } = useSelectedDate()
    const { refreshDayStatus } = useDayStatus()
    const [entries, setEntries] = useState<FoodEntryRow[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [isCatalogOpen, setIsCatalogOpen] = useState(false)
    const [isFormOpen, setIsFormOpen] = useState(true)
    const menuRef = useRef<HTMLDivElement>(null)
    // O formulário só deve reabrir/recolher sozinho na primeira carga de cada
    // dia; reloads disparados por criar/editar/excluir um item não podem
    // desfazer a escolha do usuário de mantê-lo aberto ou fechado.
    const defaultFormStateAppliedForDateRef = useRef<string | null>(null)

    async function reloadEntries() {
        setIsLoading(true)
        setErrorMessage(null)
        try {
            const nextEntries = await listFoodEntriesForDate(selectedDate)
            setEntries(nextEntries)
            if (defaultFormStateAppliedForDateRef.current !== selectedDate) {
                setIsFormOpen(nextEntries.length === 0)
                defaultFormStateAppliedForDateRef.current = selectedDate
            }
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

    return (
        <div>
            <div className="workout-toolbar">
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
            <DailyTotalsCard entries={entries} />
            {isFormOpen ? (
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ fontSize: 16, margin: 0 }}>Adicionar consumo</h2>
                        <button type="button" className="secondary-button" onClick={() => setIsFormOpen(false)}>
                            Fechar
                        </button>
                    </div>
                    <FoodEntryForm
                        entryDate={selectedDate}
                        submitLabel="Adicionar"
                        onSubmit={async (values) => {
                            await createFoodEntry({ entryDate: selectedDate, ...values })
                            await reloadEntries()
                            refreshDayStatus()
                        }}
                    />
                </div>
            ) : (
                <button type="button" className="secondary-button" onClick={() => setIsFormOpen(true)}>
                    + Adicionar consumo
                </button>
            )}
            {isLoading && <p>Carregando...</p>}
            {errorMessage && <div className="error-list">{errorMessage}</div>}
            {!isLoading && !errorMessage && (
                <FoodEntryList
                    entryDate={selectedDate}
                    entries={entries}
                    onUpdate={async (entryId, values) => {
                        await updateFoodEntry(entryId, { entryDate: selectedDate, ...values })
                        await reloadEntries()
                        refreshDayStatus()
                    }}
                    onDelete={async (entryId) => {
                        await deleteFoodEntry(entryId)
                        await reloadEntries()
                        refreshDayStatus()
                    }}
                />
            )}
        </div>
    )
}
