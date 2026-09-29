import { useRef } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

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

const WEEKDAY_FULL_NAME: Record<Weekday, string> = {
    segunda: 'Segunda',
    terca: 'Terça',
    quarta: 'Quarta',
    quinta: 'Quinta',
    sexta: 'Sexta',
    sabado: 'Sábado',
    domingo: 'Domingo',
}

const MONTH_NAMES = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
]

const NAVIGATION_ICON_SIZE = 22

export function DateHeader() {
    const { selectedDate, setSelectedDate } = useSelectedDate()
    const datePickerInputRef = useRef<HTMLInputElement>(null)
    const isViewingToday = selectedDate === todayInTimezone()
    const weekdayName = WEEKDAY_FULL_NAME[weekdayOfIsoDate(selectedDate)]

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
            <button
                type="button"
                className={isViewingToday ? 'date-header__date' : 'date-header__date date-header__date--not-today'}
                onClick={openDatePicker}
                aria-label={`${weekdayName}, ${formatLongDayMonth(selectedDate)}. Selecionar data no calendário`}
            >
                <span className="date-header__weekday">
                    {weekdayName}
                    <ChevronDown size={16} strokeWidth={2.5} aria-hidden="true" />
                </span>
                <span className="date-header__day-month">{formatLongDayMonth(selectedDate)}</span>
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
            {!isViewingToday && (
                <button type="button" className="date-header__today" onClick={goToToday}>
                    Hoje
                </button>
            )}
            <div className="date-header__stepper">
                <button type="button" className="icon-button" onClick={goToPreviousDay} aria-label="Dia anterior">
                    <ChevronLeft size={NAVIGATION_ICON_SIZE} aria-hidden="true" />
                </button>
                <button type="button" className="icon-button" onClick={goToNextDay} aria-label="Próximo dia">
                    <ChevronRight size={NAVIGATION_ICON_SIZE} aria-hidden="true" />
                </button>
            </div>
        </header>
    )
}

export function formatDateLabel(isoDate: string): string {
    const [, month, day] = isoDate.split('-')
    const weekday = weekdayOfIsoDate(isoDate)
    const formattedLabel = `${WEEKDAY_ABBREVIATION[weekday]} ${day}/${month}`

    return formattedLabel
}

function formatLongDayMonth(isoDate: string): string {
    const [, month, day] = isoDate.split('-')
    const monthName = MONTH_NAMES[Number(month) - 1]
    const formattedLabel = `${Number(day)} de ${monthName}`

    return formattedLabel
}
