import { useState } from 'react'

import { archiveRoutineItem, createRoutineItem, updateRoutineItem } from '@/features/routine/api'
import { routineItemInputSchema, type RoutineItemInput } from '@/features/routine/routineSchema'
import { ROUTINE_LINK_KIND_LABELS, ROUTINE_LINK_KINDS } from '@/features/routine/types'
import type { RoutineItemRow, RoutineLinkKind } from '@/features/routine/types'
import { todayInTimezone } from '@/lib/dateUtils'
import { WEEKDAY_LABELS } from '@/lib/weekdayLabels'
import { WEEKDAYS, type Weekday } from '@/lib/workoutPlanSchema'

const NO_LINK_OPTION_VALUE = 'nenhum'

type RoutineItemsEditorProps = {
    items: RoutineItemRow[]
    onClose: () => void
    onChanged: () => Promise<void>
}

export function RoutineItemsEditor({ items, onClose, onChanged }: RoutineItemsEditorProps) {
    const [editingItemId, setEditingItemId] = useState<string | null>(null)
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
            <div className="workout-toolbar">
                <h2 style={{ fontSize: 16, margin: 0 }}>Itens de rotina</h2>
                <button type="button" className="secondary-button" onClick={onClose}>
                    Voltar
                </button>
            </div>
            {errorMessage && <div className="error-list">{errorMessage}</div>}
            {activeItems.map((item) =>
                editingItemId === item.id ? (
                    <div key={item.id} className="card">
                        <RoutineItemForm
                            initialValues={{
                                title: item.title,
                                weekdays: item.weekdays as Weekday[],
                                linkKind: (item.link_kind as RoutineLinkKind | null) ?? undefined,
                            }}
                            submitLabel="Salvar"
                            onSubmit={(input) => handleUpdate(item.id, input)}
                            onCancel={() => setEditingItemId(null)}
                        />
                    </div>
                ) : (
                    <div key={item.id} className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <strong>{item.title}</strong>
                                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#52525b' }}>
                                    {formatWeekdays(item.weekdays as Weekday[])}
                                    {item.link_kind
                                        ? ` · ${ROUTINE_LINK_KIND_LABELS[item.link_kind as RoutineLinkKind]}`
                                        : ''}
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                    type="button"
                                    className="secondary-button"
                                    onClick={() => setEditingItemId(item.id)}
                                >
                                    Editar
                                </button>
                                <button type="button" className="secondary-button" onClick={() => handleArchive(item)}>
                                    Arquivar
                                </button>
                            </div>
                        </div>
                    </div>
                ),
            )}
            {isCreating ? (
                <div className="card">
                    <RoutineItemForm
                        submitLabel="Criar"
                        onSubmit={handleCreate}
                        onCancel={() => setIsCreating(false)}
                    />
                </div>
            ) : (
                <button type="button" className="secondary-button" onClick={() => setIsCreating(true)}>
                    + Novo item de rotina
                </button>
            )}
        </div>
    )
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
            <div style={{ display: 'flex', gap: 8 }}>
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
