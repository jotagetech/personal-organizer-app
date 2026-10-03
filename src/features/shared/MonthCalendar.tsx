import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { buildMonthGrid, formatMonthTitle, parseTypedDate } from '@/features/shared/monthGrid'
import type { IsoDate } from '@/lib/dateUtils'

interface MonthCalendarProps {
    value: IsoDate | null
    onChange: (date: IsoDate) => void
    today: IsoDate
    minDate?: IsoDate
}

const WEEKDAY_INITIALS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const NAVIGATION_ICON_SIZE = 22
const INVALID_DATE_MESSAGE = 'Data inválida. Use dd/mm ou dd/mm/aaaa.'
const BEFORE_MIN_DATE_MESSAGE = 'Essa data já passou.'

interface VisibleMonth {
    year: number
    month: number
}

function monthOf(isoDate: IsoDate): VisibleMonth {
    const [year, month] = isoDate.split('-').map(Number)

    return { year, month }
}

function shiftMonth(visible: VisibleMonth, delta: number): VisibleMonth {
    const zeroBasedIndex = visible.year * 12 + (visible.month - 1) + delta
    const shifted = { year: Math.floor(zeroBasedIndex / 12), month: (zeroBasedIndex % 12) + 1 }

    return shifted
}

function longDateLabel(isoDate: IsoDate): string {
    const [year, month, day] = isoDate.split('-').map(Number)
    const label = new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'full',
        timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day, 12)))

    return label
}

function dayClassName(isoDate: IsoDate, value: IsoDate | null, today: IsoDate): string {
    const classNames = ['month-calendar__day']
    if (isoDate === value) {
        classNames.push('month-calendar__day--selected')
    }
    if (isoDate === today) {
        classNames.push('month-calendar__day--today')
    }

    return classNames.join(' ')
}

export function MonthCalendar({ value, onChange, today, minDate }: MonthCalendarProps) {
    const [visibleMonth, setVisibleMonth] = useState<VisibleMonth>(() => monthOf(value ?? today))
    const [isTyping, setIsTyping] = useState(false)
    const [typedText, setTypedText] = useState('')
    const [typedError, setTypedError] = useState<string | null>(null)

    function submitTypedDate() {
        const parsed = parseTypedDate(typedText, today)
        if (parsed === null) {
            setTypedError(INVALID_DATE_MESSAGE)
            return
        }
        if (minDate !== undefined && parsed < minDate) {
            setTypedError(BEFORE_MIN_DATE_MESSAGE)
            return
        }

        setTypedError(null)
        setVisibleMonth(monthOf(parsed))
        setIsTyping(false)
        onChange(parsed)
    }

    function renderDays() {
        const cells = buildMonthGrid(visibleMonth.year, visibleMonth.month)
        const days = cells.map((isoDate, index) => {
            if (isoDate === null) {
                return <span key={`blank-${index}`} aria-hidden="true" />
            }

            const isSelected = isoDate === value
            const isBeforeMin = minDate !== undefined && isoDate < minDate

            return (
                <button
                    key={isoDate}
                    type="button"
                    className={dayClassName(isoDate, value, today)}
                    aria-label={longDateLabel(isoDate)}
                    aria-pressed={isSelected}
                    disabled={isBeforeMin}
                    onClick={() => onChange(isoDate)}
                >
                    {Number(isoDate.slice(8, 10))}
                </button>
            )
        })

        return days
    }

    if (isTyping) {
        return (
            <div className="month-calendar">
                <div className="month-calendar__typed">
                    <label className="month-calendar__typed-label" htmlFor="month-calendar-typed-date">
                        Data
                    </label>
                    <div className="month-calendar__typed-row">
                        <input
                            id="month-calendar-typed-date"
                            className="month-calendar__typed-input"
                            type="text"
                            inputMode="numeric"
                            placeholder="dd/mm/aaaa"
                            autoComplete="off"
                            value={typedText}
                            aria-invalid={typedError !== null}
                            onChange={(event) => {
                                setTypedText(event.target.value)
                                setTypedError(null)
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault()
                                    submitTypedDate()
                                }
                            }}
                        />
                        <button type="button" className="month-calendar__use" onClick={submitTypedDate}>
                            Usar
                        </button>
                    </div>
                    {typedError !== null && (
                        <p className="month-calendar__typed-error" role="alert">
                            {typedError}
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    className="month-calendar__link"
                    onClick={() => {
                        setTypedError(null)
                        setIsTyping(false)
                    }}
                >
                    Voltar ao calendário
                </button>
            </div>
        )
    }

    return (
        <div className="month-calendar">
            <div className="month-calendar__header">
                <button
                    type="button"
                    className="month-calendar__nav"
                    aria-label="Mês anterior"
                    onClick={() => setVisibleMonth(shiftMonth(visibleMonth, -1))}
                >
                    <ChevronLeft size={NAVIGATION_ICON_SIZE} aria-hidden="true" />
                </button>
                <span className="month-calendar__title" aria-live="polite">
                    {formatMonthTitle(visibleMonth.year, visibleMonth.month)}
                </span>
                <button
                    type="button"
                    className="month-calendar__nav"
                    aria-label="Próximo mês"
                    onClick={() => setVisibleMonth(shiftMonth(visibleMonth, 1))}
                >
                    <ChevronRight size={NAVIGATION_ICON_SIZE} aria-hidden="true" />
                </button>
            </div>
            <div className="month-calendar__weekdays" aria-hidden="true">
                {WEEKDAY_INITIALS.map((initial, index) => (
                    <span key={index}>{initial}</span>
                ))}
            </div>
            <div className="month-calendar__grid">{renderDays()}</div>
            <button type="button" className="month-calendar__link" onClick={() => setIsTyping(true)}>
                Digitar a data
            </button>
        </div>
    )
}
