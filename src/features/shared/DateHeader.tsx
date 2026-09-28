import { useRef } from 'react'

import { useSelectedDate } from '@/contexts/SelectedDateContext'
import { SyncStatusBadge } from '@/features/shared/SyncStatusBadge'
import { shiftIsoDate, todayInTimezone, weekdayOfIsoDate } from '@/lib/dateUtils'
import type { Weekday } from '@/lib/workoutPlanSchema'

const WEEKDAY_ABBREVIATION: Record<Weekday, string> = {
    segunda: 'seg',
    terca: 'ter',
    quarta: 'qua',
    quinta: 'qui',
    sexta: 'sex',
    sabado: 'sáb',
    domingo: 'dom',
}

export function DateHeader() {
    const { selectedDate, setSelectedDate } = useSelectedDate()
    const datePickerInputRef = useRef<HTMLInputElement>(null)
    const isViewingToday = selectedDate === todayInTimezone()

    function goToPreviousDay() {
        setSelectedDate(shiftIsoDate(selectedDate, -1))
    }

    function goToNextDay() {
        setSelectedDate(shiftIsoDate(selectedDate, 1))
    }

    function goToToday() {
        setSelectedDate(todayInTimezone())
    }

    function handleDatePickerChange(event: React.ChangeEvent<HTMLInputElement>) {
        const pickedDate = event.target.value
        if (pickedDate) {
            setSelectedDate(pickedDate)
        }
    }

    function openDatePicker() {
        datePickerInputRef.current?.showPicker?.()
    }

    return (
        <header className="date-header">
            <button type="button" className="icon-button" onClick={goToPreviousDay} aria-label="Dia anterior">
                ‹
            </button>
            <span
                className={
                    isViewingToday
                        ? 'date-header__label'
                        : 'date-header__label date-header__label--not-today'
                }
            >
                {formatDateLabel(selectedDate)}
            </span>
            <button type="button" className="icon-button" onClick={goToNextDay} aria-label="Próximo dia">
                ›
            </button>
            <button
                type="button"
                className="icon-button"
                onClick={openDatePicker}
                aria-label="Selecionar data no calendário"
            >
                📅
            </button>
            <input
                ref={datePickerInputRef}
                type="date"
                className="date-header__hidden-date-input"
                value={selectedDate}
                onChange={handleDatePickerChange}
                tabIndex={-1}
                aria-hidden="true"
            />
            <SyncStatusBadge />
            <button type="button" className="secondary-button" onClick={goToToday}>
                Hoje
            </button>
        </header>
    )
}

function formatDateLabel(isoDate: string): string {
    const [, month, day] = isoDate.split('-')
    const weekday = weekdayOfIsoDate(isoDate)
    const formattedLabel = `${WEEKDAY_ABBREVIATION[weekday]} ${day}/${month}`

    return formattedLabel
}
