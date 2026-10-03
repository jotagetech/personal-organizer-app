import { Archive, ArrowLeft, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'

import { archiveRoutineItem, createRoutineItem, updateRoutineItem } from '@/features/routine/api'
import { routineItemInputSchema, type RoutineItemInput } from '@/features/routine/routineSchema'
import { ROUTINE_LINK_KIND_LABELS, ROUTINE_LINK_KINDS } from '@/features/routine/types'
import type { RoutineItemRow, RoutineLinkKind } from '@/features/routine/types'
import { todayInTimezone } from '@/lib/dateUtils'
import { WEEKDAY_LABELS } from '@/lib/weekdayLabels'
import { WEEKDAYS, type Weekday } from '@/lib/workoutPlanSchema'

const NO_LINK_OPTION_VALUE = 'nenhum'
const BUTTON_ICON_SIZE = 18
const ROW_ACTION_ICON_SIZE = 20

type RoutineItemsEditorProps = {
    items: RoutineItemRow[]
    initialEditingItemId?: string | null
    onClose: () => void
    onChanged: () => Promise<void>
}

export function RoutineItemsEditor({ items, initialEditingItemId, onClose, onChanged }: RoutineItemsEditorProps) {
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
                                    initialValues={{
                                        title: item.title,
                                        weekdays: (item.weekdays ?? []) as Weekday[],
                                        linkKind: (item.link_kind as RoutineLinkKind | null) ?? undefined,
                                    }}
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
                                        {formatSchedule(item)}
                                        {item.link_kind
                                            ? ` · ${ROUTINE_LINK_KIND_LABELS[item.link_kind as RoutineLinkKind]}`
                                            : ''}
                                    </p>
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

function formatSchedule(item: RoutineItemRow): string {
    if (item.repeat_kind === 'interval') {
        return `A cada ${item.interval_days} dias`
    }

    return formatWeekdays((item.weekdays ?? []) as Weekday[])
}

function formatWeekdays(weekdays: Weekday[]): string {
    const orderedLabels = WEEKDAYS.filter((weekday) => weekdays.includes(weekday)).map(
        (weekday) => WEEKDAY_LABELS[weekday],
    )
    return orderedLabels.join(', ')
}

type RoutineItemFormProps = {
    initialValues?: RoutineItemInput
    submitLabel: string
    onSubmit: (input: RoutineItemInput) => Promise<void>
    onCancel: () => void
}

function RoutineItemForm({ initialValues, submitLabel, onSubmit, onCancel }: RoutineItemFormProps) {
    const [title, setTitle] = useState(initialValues?.title ?? '')
    const [weekdays, setWeekdays] = useState<Weekday[]>(initialValues?.weekdays ?? [])
    const [linkKindOption, setLinkKindOption] = useState<string>(initialValues?.linkKind ?? NO_LINK_OPTION_VALUE)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    function toggleWeekday(weekday: Weekday) {
        setWeekdays((previousWeekdays) =>
            previousWeekdays.includes(weekday)
                ? previousWeekdays.filter((selectedWeekday) => selectedWeekday !== weekday)
                : [...previousWeekdays, weekday],
        )
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault()

        const linkKind = linkKindOption === NO_LINK_OPTION_VALUE ? undefined : (linkKindOption as RoutineLinkKind)
        const parseResult = routineItemInputSchema.safeParse({ title: title.trim(), weekdays, linkKind })
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
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="ex: Tomar creatina"
                />
            </div>
            <div className="field">
                <label>Dias da semana</label>
                <div className="weekday-chip-row">
                    {WEEKDAYS.map((weekday) => (
                        <button
                            key={weekday}
                            type="button"
                            className={weekdayChipClassName(weekdays.includes(weekday))}
                            aria-pressed={weekdays.includes(weekday)}
                            onClick={() => toggleWeekday(weekday)}
                        >
                            {WEEKDAY_LABELS[weekday]}
                        </button>
                    ))}
                </div>
            </div>
            <div className="field">
                <label htmlFor="routine-item-link">Vínculo com outra aba</label>
                <select
                    id="routine-item-link"
                    value={linkKindOption}
                    onChange={(event) => setLinkKindOption(event.target.value)}
                >
                    <option value={NO_LINK_OPTION_VALUE}>Nenhum</option>
                    {ROUTINE_LINK_KINDS.map((linkKind) => (
                        <option key={linkKind} value={linkKind}>
                            {ROUTINE_LINK_KIND_LABELS[linkKind]}
                        </option>
                    ))}
                </select>
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

function weekdayChipClassName(isSelected: boolean): string {
    const baseClassName = 'weekday-chip'
    if (!isSelected) {
        return baseClassName
    }

    return `${baseClassName} weekday-chip--selected`
}
