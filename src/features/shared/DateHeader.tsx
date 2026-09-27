import { useSelectedDate } from '@/contexts/SelectedDateContext'
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

    return (
        <header className="date-header">
            <button type="button" className="icon-button" onClick={goToPreviousDay} aria-label="Dia anterior">
                ‹
            </button>
            <span className="date-header__label">{formatDateLabel(selectedDate)}</span>
            <button type="button" className="icon-button" onClick={goToNextDay} aria-label="Próximo dia">
                ›
            </button>
            <input
                type="date"
                className="icon-button"
                value={selectedDate}
                onChange={handleDatePickerChange}
                aria-label="Selecionar data no calendário"
            />
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
