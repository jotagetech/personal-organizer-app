import { useSelectedDate } from '@/contexts/SelectedDateContext'
import { shiftIsoDate, todayInTimezone } from '@/lib/dateUtils'

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
})

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
    const [year, month, day] = isoDate.split('-').map(Number)
    const dateAtNoonUtc = new Date(Date.UTC(year, month - 1, day, 12))
    const formattedLabel = DAY_LABEL_FORMATTER.format(dateAtNoonUtc)

    return formattedLabel
}
