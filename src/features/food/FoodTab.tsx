import { useEffect, useState } from 'react'

import { useSelectedDate } from '@/contexts/SelectedDateContext'
import {
    createFoodEntry,
    deleteFoodEntry,
    listFoodEntriesForDate,
    updateFoodEntry,
} from '@/features/food/api'
import { FoodEntryForm } from '@/features/food/FoodEntryForm'
import { FoodEntryList } from '@/features/food/FoodEntryList'
import type { FoodEntryRow } from '@/features/food/types'

export function FoodTab() {
    const { selectedDate } = useSelectedDate()
    const [entries, setEntries] = useState<FoodEntryRow[]>([])
    const [isLoading, setIsLoading] = useState(true)

    async function reloadEntries() {
        setIsLoading(true)
        const nextEntries = await listFoodEntriesForDate(selectedDate)
        setEntries(nextEntries)
        setIsLoading(false)
    }

    useEffect(() => {
        void reloadEntries()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate])

    return (
        <div>
            <div className="card">
                <h2 style={{ fontSize: 16, marginTop: 0 }}>Adicionar consumo</h2>
                <FoodEntryForm
                    submitLabel="Adicionar"
                    onSubmit={async (values) => {
                        await createFoodEntry({ entryDate: selectedDate, ...values })
                        await reloadEntries()
                    }}
                />
            </div>
            {isLoading ? (
                <p>Carregando...</p>
            ) : (
                <FoodEntryList
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
