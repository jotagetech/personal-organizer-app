import { Archive, ArrowLeft, CalendarDays, Pencil, Plus, Star } from 'lucide-react'
import { useState } from 'react'

import { archiveRoutineItem, createRoutineItem, updateRoutineItem } from '@/features/routine/api'
import { findCategory } from '@/features/routine/categories'
import { CategoryDot } from '@/features/routine/CategoryDot'
import { CategoryPicker } from '@/features/routine/CategoryPicker'
import { MAX_INTERVAL_DAYS, MIN_INTERVAL_DAYS } from '@/features/routine/newTaskInput'
import { routineItemInputSchema, type RoutineItemInput } from '@/features/routine/routineSchema'
import { formatRoutineSchedule } from '@/features/routine/routineSchedule'
import { shortDateLabel } from '@/features/routine/shortDateLabel'
import { ROUTINE_LINK_KIND_LABELS, ROUTINE_LINK_KINDS } from '@/features/routine/types'
import type { RoutineCategoryRow, RoutineItemRow, RoutineLinkKind } from '@/features/routine/types'
import { MonthCalendar } from '@/features/shared/MonthCalendar'
import { isValidIsoDate, todayInTimezone, type IsoDate } from '@/lib/dateUtils'
import { WEEKDAY_LABELS } from '@/lib/weekdayLabels'
import { WEEKDAYS, type Weekday } from '@/lib/workoutPlanSchema'

const NO_LINK_OPTION_VALUE = 'nenhum'
const BUTTON_ICON_SIZE = 18
const ROW_ACTION_ICON_SIZE = 20
const META_ICON_SIZE = 12

type RepeatKind = RoutineItemInput['repeatKind']

const REPEAT_OPTIONS: { value: RepeatKind; label: string }[] = [
    { value: 'weekdays', label: 'Dias da semana' },
    { value: 'interval', label: 'A cada N dias' },
]

type RoutineItemsEditorProps = {
    items: RoutineItemRow[]
    categories: RoutineCategoryRow[]
    initialEditingItemId?: string | null
    onOpenCategories: () => void
    onClose: () => void
    onChanged: () => Promise<void>
}

export function RoutineItemsEditor({
    items,
    categories,
    initialEditingItemId,
    onOpenCategories,
    onClose,
    onChanged,
}: RoutineItemsEditorProps) {
    const [editingItemId, setEditingItemId] = useState<string | null>(initialEditingItemId ?? null)
    const [isCreating, setIsCreating] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    const activeItems = items.filter((item) => item.archived_on === null)

    async function handleArchive(item: RoutineItemRow) {
        setErrorMessage(null)
        try {
            await archiveRoutineItem(item.id, todayInTimezone())
            await onChanged()
        } catch (archiveError) {
            const message = archiveError instanceof Error ? archiveError.message : 'Falha ao arquivar item'
            setErrorMessage(message)
        }
    }

    async function handleCreate(input: RoutineItemInput) {
        await createRoutineItem(input, activeItems.length)
        await onChanged()
        setIsCreating(false)
    }

    async function handleUpdate(itemId: string, input: RoutineItemInput) {
        await updateRoutineItem(itemId, input)
        await onChanged()
        setEditingItemId(null)
    }

    return (
        <div>
            <div className="page-header">
                <h2 className="page-title">Itens de rotina</h2>
                <button type="button" className="secondary-button" onClick={onClose}>
                    <ArrowLeft size={BUTTON_ICON_SIZE} aria-hidden="true" />
                    Voltar
                </button>
            </div>
            {errorMessage && <div className="error-list">{errorMessage}</div>}
            {activeItems.length > 0 && (
                <div className="card routine-item-list">
                    {activeItems.map((item) =>
                        editingItemId === item.id ? (
                            <div key={item.id} className="routine-item-list__row routine-item-list__row--editing">
                                <RoutineItemForm
                                    initialValues={initialValuesOf(item)}
                                    categories={categories}
                                    onOpenCategories={onOpenCategories}
                                    submitLabel="Salvar"
                                    onSubmit={(input) => handleUpdate(item.id, input)}
                                    onCancel={() => setEditingItemId(null)}
                                />
                            </div>
                        ) : (
                            <div key={item.id} className="routine-item-list__row">
                                <div className="routine-item-list__text">
                                    <strong className="routine-item-list__title">{item.title}</strong>
                                    <p className="routine-item-list__meta">
                                        {formatRoutineSchedule(item)}
                                        {item.link_kind
                                            ? ` · ${ROUTINE_LINK_KIND_LABELS[item.link_kind as RoutineLinkKind]}`
                                            : ''}
                                    </p>
                                    <RoutineItemFlags item={item} category={findCategory(categories, item.category_id)} />
                                </div>
                                <div className="routine-item-list__actions">
                                    <button
                                        type="button"
                                        className="icon-button"
                                        aria-label="Editar"
                                        onClick={() => setEditingItemId(item.id)}
                                    >
                                        <Pencil size={ROW_ACTION_ICON_SIZE} aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        className="icon-button"
                                        aria-label="Arquivar"
                                        onClick={() => handleArchive(item)}
                                    >
                                        <Archive size={ROW_ACTION_ICON_SIZE} aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                        ),
                    )}
                </div>
            )}
            {isCreating ? (
                <div className="card">
                    <h3 className="section-title routine-item-form__heading">Novo item</h3>
                    <RoutineItemForm
                        categories={categories}
                        onOpenCategories={onOpenCategories}
                        submitLabel="Criar"
                        onSubmit={handleCreate}
                        onCancel={() => setIsCreating(false)}
                    />
                </div>
            ) : (
                <button type="button" className="secondary-button full-width" onClick={() => setIsCreating(true)}>
                    <Plus size={BUTTON_ICON_SIZE} aria-hidden="true" />
                    Novo item de rotina
                </button>
            )}
        </div>
    )
}

function initialValuesOf(item: RoutineItemRow): RoutineItemInput {
    const common = {
        title: item.title,
        linkKind: (item.link_kind as RoutineLinkKind | null) ?? undefined,
        categoryId: item.category_id,
        isImportant: item.is_important,
    }
    if (item.repeat_kind === 'interval' && item.interval_days !== null && item.interval_anchor !== null) {
        return { ...common, repeatKind: 'interval', intervalDays: item.interval_days, intervalAnchor: item.interval_anchor }
    }

    return { ...common, repeatKind: 'weekdays', weekdays: (item.weekdays ?? []) as Weekday[] }
}

type RoutineItemFlagsProps = {
    item: RoutineItemRow
    category: RoutineCategoryRow | null
}

function RoutineItemFlags({ item, category }: RoutineItemFlagsProps) {
    if (!category && !item.is_important) {
        return null
    }

    return (
        <p className="routine-item-list__flags">
            {category && (
                <span className="routine-item-list__flag">
                    <CategoryDot color={category.color} />
                    {category.name}
                </span>
            )}
            {item.is_important && (
                <span className="routine-item-list__flag">
                    <Star size={META_ICON_SIZE} className="routine-item-list__star" aria-hidden="true" />
                    Importante
                </span>
            )}
        </p>
    )
}

type RoutineItemFormProps = {
    initialValues?: RoutineItemInput
    categories: RoutineCategoryRow[]
    onOpenCategories: () => void
    submitLabel: string
    onSubmit: (input: RoutineItemInput) => Promise<void>
    onCancel: () => void
}

type FormDraft = {
    title: string
    repeatKind: RepeatKind
    weekdays: Weekday[]
    intervalText: string
    intervalAnchor: IsoDate
    linkKindOption: string
    categoryId: string | null
    isImportant: boolean
}

function draftOf(initialValues: RoutineItemInput | undefined): FormDraft {
    const draft: FormDraft = {
        title: initialValues?.title ?? '',
        repeatKind: initialValues?.repeatKind ?? 'weekdays',
        weekdays: initialValues?.repeatKind === 'weekdays' ? initialValues.weekdays : [],
        intervalText: initialValues?.repeatKind === 'interval' ? String(initialValues.intervalDays) : '',
        intervalAnchor: initialValues?.repeatKind === 'interval' ? initialValues.intervalAnchor : todayInTimezone(),
        linkKindOption: initialValues?.linkKind ?? NO_LINK_OPTION_VALUE,
        categoryId: initialValues?.categoryId ?? null,
        isImportant: initialValues?.isImportant ?? false,
    }
    return draft
}

// O tipo de repetição escolhido decide quais campos de agenda seguem: os do
// outro tipo ficam de fora, e o schema recusa o que estiver incompleto.
function buildCandidate(draft: FormDraft): unknown {
    const linkKind = draft.linkKindOption === NO_LINK_OPTION_VALUE ? undefined : draft.linkKindOption
    const common = {
        title: draft.title.trim(),
        linkKind,
        categoryId: draft.categoryId,
        isImportant: draft.isImportant,
    }
    if (draft.repeatKind === 'interval') {
        return {
            ...common,
            repeatKind: 'interval',
            intervalDays: Number(draft.intervalText.trim()),
            intervalAnchor: draft.intervalAnchor,
        }
    }

    return { ...common, repeatKind: 'weekdays', weekdays: draft.weekdays }
}

function RoutineItemForm({
    initialValues,
    categories,
    onOpenCategories,
    submitLabel,
    onSubmit,
    onCancel,
}: RoutineItemFormProps) {
    const [draft, setDraft] = useState<FormDraft>(() => draftOf(initialValues))
    const [isCalendarOpen, setIsCalendarOpen] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const today = todayInTimezone()

    function updateDraft(changes: Partial<FormDraft>) {
        setDraft((previousDraft) => ({ ...previousDraft, ...changes }))
    }

    function toggleWeekday(weekday: Weekday) {
        const nextWeekdays = draft.weekdays.includes(weekday)
            ? draft.weekdays.filter((selectedWeekday) => selectedWeekday !== weekday)
            : [...draft.weekdays, weekday]
        updateDraft({ weekdays: nextWeekdays })
    }

    function chooseAnchor(anchor: IsoDate) {
        updateDraft({ intervalAnchor: anchor })
        setIsCalendarOpen(false)
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault()

        const parseResult = routineItemInputSchema.safeParse(buildCandidate(draft))
        if (!parseResult.success) {
            setErrorMessage(parseResult.error.issues[0]?.message ?? 'Dados inválidos')
            return
        }

        setErrorMessage(null)
        setIsSubmitting(true)
        try {
            await onSubmit(parseResult.data)
        } catch (submitError) {
            const message = submitError instanceof Error ? submitError.message : 'Falha ao salvar item de rotina'
            setErrorMessage(message)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            {errorMessage && <div className="error-list">{errorMessage}</div>}
            <div className="field">
                <label htmlFor="routine-item-title">Título</label>
                <input
                    id="routine-item-title"
                    type="text"
                    value={draft.title}
                    onChange={(event) => updateDraft({ title: event.target.value })}
                    placeholder="ex: Tomar creatina"
                />
            </div>
            <div className="routine-item-form__group">
                <span className="routine-item-form__label">Repetir</span>
                <div className="choice-chip-row">
                    {REPEAT_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            className={choiceChipClassName(draft.repeatKind === option.value)}
                            aria-pressed={draft.repeatKind === option.value}
                            onClick={() => updateDraft({ repeatKind: option.value })}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                {draft.repeatKind === 'weekdays' && (
                    <div className="weekday-chip-row">
                        {WEEKDAYS.map((weekday) => (
                            <button
                                key={weekday}
                                type="button"
                                className={weekdayChipClassName(draft.weekdays.includes(weekday))}
                                aria-pressed={draft.weekdays.includes(weekday)}
                                onClick={() => toggleWeekday(weekday)}
                            >
                                {WEEKDAY_LABELS[weekday]}
                            </button>
                        ))}
                    </div>
                )}
                {draft.repeatKind === 'interval' && (
                    <>
                        <div className="routine-item-form__interval">
                            <span>A cada</span>
                            <input
                                type="number"
                                inputMode="numeric"
                                min={MIN_INTERVAL_DAYS}
                                max={MAX_INTERVAL_DAYS}
                                value={draft.intervalText}
                                aria-label="Intervalo em dias"
                                onChange={(event) => updateDraft({ intervalText: event.target.value })}
                            />
                            <span>dias, a partir de</span>
                            <button
                                type="button"
                                className={choiceChipClassName(isCalendarOpen)}
                                aria-expanded={isCalendarOpen}
                                onClick={() => setIsCalendarOpen((previous) => !previous)}
                            >
                                <CalendarDays size={BUTTON_ICON_SIZE} aria-hidden="true" />
                                {isValidIsoDate(draft.intervalAnchor)
                                    ? shortDateLabel(draft.intervalAnchor)
                                    : 'Escolher data'}
                            </button>
                        </div>
                        {isCalendarOpen && (
                            <MonthCalendar value={draft.intervalAnchor} onChange={chooseAnchor} today={today} />
                        )}
                    </>
                )}
            </div>
            <div className="routine-item-form__group">
                <span className="routine-item-form__label">Categoria</span>
                <CategoryPicker
                    categories={categories}
                    value={draft.categoryId}
                    onChange={(categoryId) => updateDraft({ categoryId })}
                    onCreateCategory={onOpenCategories}
                />
            </div>
            <div className="field">
                <label htmlFor="routine-item-link">Vínculo com outra aba</label>
                <select
                    id="routine-item-link"
                    value={draft.linkKindOption}
                    onChange={(event) => updateDraft({ linkKindOption: event.target.value })}
                >
                    <option value={NO_LINK_OPTION_VALUE}>Nenhum</option>
                    {ROUTINE_LINK_KINDS.map((linkKind) => (
                        <option key={linkKind} value={linkKind}>
                            {ROUTINE_LINK_KIND_LABELS[linkKind]}
                        </option>
                    ))}
                </select>
            </div>
            <div className="routine-item-form__group">
                <button
                    type="button"
                    className={importantButtonClassName(draft.isImportant)}
                    aria-pressed={draft.isImportant}
                    onClick={() => updateDraft({ isImportant: !draft.isImportant })}
                >
                    <Star size={BUTTON_ICON_SIZE} aria-hidden="true" />
                    Importante
                </button>
            </div>
            <div className="inline-actions routine-item-form__actions">
                <button type="submit" className="primary-button" disabled={isSubmitting}>
                    {isSubmitting ? 'Salvando...' : submitLabel}
                </button>
                <button type="button" className="secondary-button" onClick={onCancel}>
                    Cancelar
                </button>
            </div>
        </form>
    )
}

function choiceChipClassName(isSelected: boolean): string {
    return isSelected ? 'choice-chip choice-chip--selected' : 'choice-chip'
}

function importantButtonClassName(isImportant: boolean): string {
    return isImportant ? 'routine-item-form__star routine-item-form__star--on' : 'routine-item-form__star'
}

function weekdayChipClassName(isSelected: boolean): string {
    const baseClassName = 'weekday-chip'
    if (!isSelected) {
        return baseClassName
    }

    return `${baseClassName} weekday-chip--selected`
}
