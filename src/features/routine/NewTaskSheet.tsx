import { CalendarDays, Star } from 'lucide-react'
import { useId, useState } from 'react'

import { createNewRoutineEntry, updateRoutineTask } from '@/features/routine/api'
import {
    MAX_INTERVAL_DAYS,
    MIN_INTERVAL_DAYS,
    validateNewTask,
    type NewTaskErrors,
    type NewTaskInsert,
    type NewTaskRepeat,
} from '@/features/routine/newTaskInput'
import { CategoryPicker } from '@/features/routine/CategoryPicker'
import { shortDateLabel } from '@/features/routine/shortDateLabel'
import type { RoutineCategoryRow, RoutineTaskRow } from '@/features/routine/types'
import { BottomSheet } from '@/features/shared/BottomSheet'
import { MonthCalendar } from '@/features/shared/MonthCalendar'
import { shiftIsoDate, todayInTimezone, weekdayOfIsoDate, type IsoDate } from '@/lib/dateUtils'
import type { Weekday } from '@/lib/workoutPlanSchema'

// Com task preenchida a folha edita essa tarefa avulsa: sem a parte de
// repetir e salvando por update em vez de criar.
interface NewTaskSheetProps {
    initialDate: IsoDate
    task?: RoutineTaskRow
    categories: RoutineCategoryRow[]
    onOpenCategories: () => void
    onClose: () => void
    onSaved: () => Promise<void>
}

const ICON_SIZE = 18
const SAVE_FAILED_MESSAGE = 'Não foi possível salvar. Confira a conexão e tente de novo.'

const REPEAT_OPTIONS: { value: NewTaskRepeat; label: string }[] = [
    { value: 'none', label: 'Não repete' },
    { value: 'weekdays', label: 'Dias da semana' },
    { value: 'interval', label: 'A cada N dias' },
]

// Domingo primeiro, como no calendário do app.
const WEEKDAY_PICKER: { weekday: Weekday; initial: string; name: string }[] = [
    { weekday: 'domingo', initial: 'D', name: 'Domingo' },
    { weekday: 'segunda', initial: 'S', name: 'Segunda' },
    { weekday: 'terca', initial: 'T', name: 'Terça' },
    { weekday: 'quarta', initial: 'Q', name: 'Quarta' },
    { weekday: 'quinta', initial: 'Q', name: 'Quinta' },
    { weekday: 'sexta', initial: 'S', name: 'Sexta' },
    { weekday: 'sabado', initial: 'S', name: 'Sábado' },
]

function chipClassName(isSelected: boolean): string {
    return isSelected ? 'choice-chip choice-chip--selected' : 'choice-chip'
}

function weekdayButtonClassName(isSelected: boolean): string {
    return isSelected ? 'weekday-chip weekday-chip--selected' : 'weekday-chip'
}

export function NewTaskSheet({
    initialDate,
    task,
    categories,
    onOpenCategories,
    onClose,
    onSaved,
}: NewTaskSheetProps) {
    const isEditing = task !== undefined
    const today = todayInTimezone()
    const tomorrow = shiftIsoDate(today, 1)
    const fieldId = useId()
    const [title, setTitle] = useState(task?.title ?? '')
    const [date, setDate] = useState<IsoDate | null>(task ? task.scheduled_on : initialDate)
    const [isCalendarOpen, setIsCalendarOpen] = useState(false)
    const [repeat, setRepeat] = useState<NewTaskRepeat>('none')
    const [weekdays, setWeekdays] = useState<Weekday[]>([])
    const [hasPickedWeekdays, setHasPickedWeekdays] = useState(false)
    const [intervalText, setIntervalText] = useState('')
    const [isImportant, setIsImportant] = useState(task?.is_important ?? false)
    const [categoryId, setCategoryId] = useState<string | null>(task?.category_id ?? null)
    const [errors, setErrors] = useState<NewTaskErrors>({})
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const isUndated = date === null
    const isCustomDate = date !== null && date !== today && date !== tomorrow

    // Enquanto o usuário não mexeu nos dias, o marcado acompanha o dia da
    // semana da data escolhida.
    function followDateWeekday(nextDate: IsoDate | null) {
        if (!hasPickedWeekdays && nextDate !== null) {
            setWeekdays([weekdayOfIsoDate(nextDate)])
        }
    }

    function chooseDate(nextDate: IsoDate | null) {
        setDate(nextDate)
        setIsCalendarOpen(false)
        setErrors((previous) => ({ ...previous, date: undefined }))
        if (nextDate === null) {
            setRepeat('none')
        }
        followDateWeekday(nextDate)
    }

    function chooseRepeat(nextRepeat: NewTaskRepeat) {
        setRepeat(nextRepeat)
        setErrors((previous) => ({ ...previous, weekdays: undefined, interval: undefined }))
        if (nextRepeat === 'weekdays' && weekdays.length === 0 && date !== null) {
            setWeekdays([weekdayOfIsoDate(date)])
        }
    }

    function toggleWeekday(weekday: Weekday) {
        setHasPickedWeekdays(true)
        setErrors((previous) => ({ ...previous, weekdays: undefined }))
        setWeekdays((previous) =>
            previous.includes(weekday) ? previous.filter((day) => day !== weekday) : [...previous, weekday],
        )
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault()
        const validation = validateNewTask(
            { title, date, repeat, weekdays, intervalText, isImportant, categoryId },
            isEditing ? 'edit' : 'create',
        )
        if (!validation.ok) {
            setErrors(validation.errors)
            return
        }

        setErrors({})
        setSubmitError(null)
        setIsSubmitting(true)
        try {
            await saveEntry(validation.value)
        } catch {
            setSubmitError(SAVE_FAILED_MESSAGE)
            setIsSubmitting(false)
            return
        }
        setIsSubmitting(false)
        onClose()
        await onSaved()
    }

    async function saveEntry(insert: NewTaskInsert) {
        if (task && insert.kind === 'task') {
            await updateRoutineTask(task.id, insert)
            return
        }
        await createNewRoutineEntry(insert)
    }

    return (
        <BottomSheet title={isEditing ? 'Editar tarefa' : 'Nova tarefa'} onClose={onClose}>
            <form className="new-task-form" onSubmit={handleSubmit} noValidate>
                <div className="field">
                    <label htmlFor={`${fieldId}-title`}>{isEditing ? 'Tarefa' : 'Nova tarefa'}</label>
                    <input
                        id={`${fieldId}-title`}
                        type="text"
                        value={title}
                        autoComplete="off"
                        aria-invalid={errors.title !== undefined}
                        onChange={(event) => {
                            setTitle(event.target.value)
                            setErrors((previous) => ({ ...previous, title: undefined }))
                        }}
                    />
                    {errors.title && <p className="new-task-form__error">{errors.title}</p>}
                    {!isEditing && <p className="new-task-form__hint">Só o nome já basta. O resto é opcional.</p>}
                </div>

                <div className="new-task-form__group">
                    <span className="new-task-form__label">Quando</span>
                    <div className="choice-chip-row">
                        <button
                            type="button"
                            className={chipClassName(date === today)}
                            aria-pressed={date === today}
                            onClick={() => chooseDate(today)}
                        >
                            Hoje
                        </button>
                        <button
                            type="button"
                            className={chipClassName(date === tomorrow)}
                            aria-pressed={date === tomorrow}
                            onClick={() => chooseDate(tomorrow)}
                        >
                            Amanhã
                        </button>
                        <button
                            type="button"
                            className={chipClassName(isCustomDate || isCalendarOpen)}
                            aria-pressed={isCustomDate || isCalendarOpen}
                            aria-expanded={isCalendarOpen}
                            onClick={() => setIsCalendarOpen((previous) => !previous)}
                        >
                            <CalendarDays size={ICON_SIZE} aria-hidden="true" />
                            {date === null ? 'Escolher data' : shortDateLabel(date)}
                        </button>
                        <button
                            type="button"
                            className={chipClassName(isUndated)}
                            aria-pressed={isUndated}
                            onClick={() => chooseDate(null)}
                        >
                            Sem data
                        </button>
                    </div>
                    {isCalendarOpen && <MonthCalendar value={date} onChange={chooseDate} today={today} />}
                    {errors.date && <p className="new-task-form__error">{errors.date}</p>}
                </div>

                {!isEditing && (
                    <div className="new-task-form__group">
                        <span className="new-task-form__label">Repetir</span>
                        <div className="choice-chip-row">
                            {REPEAT_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    className={chipClassName(repeat === option.value)}
                                    aria-pressed={repeat === option.value}
                                    disabled={isUndated && option.value !== 'none'}
                                    onClick={() => chooseRepeat(option.value)}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                        {repeat === 'weekdays' && (
                            <div className="weekday-chip-row">
                                {WEEKDAY_PICKER.map((entry) => (
                                    <button
                                        key={entry.weekday}
                                        type="button"
                                        className={weekdayButtonClassName(weekdays.includes(entry.weekday))}
                                        aria-label={entry.name}
                                        aria-pressed={weekdays.includes(entry.weekday)}
                                        onClick={() => toggleWeekday(entry.weekday)}
                                    >
                                        {entry.initial}
                                    </button>
                                ))}
                            </div>
                        )}
                        {errors.weekdays && <p className="new-task-form__error">{errors.weekdays}</p>}
                        {repeat === 'interval' && date !== null && (
                            <div className="new-task-form__interval">
                                <span>A cada</span>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min={MIN_INTERVAL_DAYS}
                                    max={MAX_INTERVAL_DAYS}
                                    value={intervalText}
                                    aria-label="Intervalo em dias"
                                    aria-invalid={errors.interval !== undefined}
                                    onChange={(event) => {
                                        setIntervalText(event.target.value)
                                        setErrors((previous) => ({ ...previous, interval: undefined }))
                                    }}
                                />
                                <span>dias, a partir de {shortDateLabel(date)}</span>
                            </div>
                        )}
                        {errors.interval && <p className="new-task-form__error">{errors.interval}</p>}
                    </div>
                )}

                <div className="new-task-form__group">
                    <span className="new-task-form__label">Categoria</span>
                    <CategoryPicker
                        categories={categories}
                        value={categoryId}
                        onChange={setCategoryId}
                        onCreateCategory={onOpenCategories}
                    />
                </div>

                {submitError && <div className="error-list">{submitError}</div>}

                <div className="new-task-form__actions">
                    <button
                        type="button"
                        className={isImportant ? 'new-task-form__star new-task-form__star--on' : 'new-task-form__star'}
                        aria-pressed={isImportant}
                        onClick={() => setIsImportant((previous) => !previous)}
                    >
                        <Star size={ICON_SIZE} aria-hidden="true" />
                        Importante
                    </button>
                    <button type="submit" className="primary-button new-task-form__save" disabled={isSubmitting}>
                        {isSubmitting ? 'Salvando...' : 'Salvar'}
                    </button>
                </div>
            </form>
        </BottomSheet>
    )
}
