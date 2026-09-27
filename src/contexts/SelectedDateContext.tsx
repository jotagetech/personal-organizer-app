import { createContext, useContext, useState, type ReactNode } from 'react'

import { todayInTimezone, type IsoDate } from '@/lib/dateUtils'

type SelectedDateContextValue = {
    selectedDate: IsoDate
    setSelectedDate: (nextDate: IsoDate) => void
}

const SelectedDateContext = createContext<SelectedDateContextValue | null>(null)

export function SelectedDateProvider({ children }: { children: ReactNode }) {
    const [selectedDate, setSelectedDate] = useState<IsoDate>(() => todayInTimezone())

    const contextValue: SelectedDateContextValue = { selectedDate, setSelectedDate }

    return (
        <SelectedDateContext.Provider value={contextValue}>
            {children}
        </SelectedDateContext.Provider>
    )
}

export function useSelectedDate(): SelectedDateContextValue {
    const contextValue = useContext(SelectedDateContext)
    if (!contextValue) {
        throw new Error('useSelectedDate precisa estar dentro de um SelectedDateProvider')
    }

    return contextValue
}
