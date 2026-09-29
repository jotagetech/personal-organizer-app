import { useEffect, useMemo, useRef, useState } from 'react'

import { useAppNavigation } from '@/contexts/AppNavigationContext'
import { useDayStatus } from '@/contexts/DayStatusContext'
import { useSelectedDate } from '@/contexts/SelectedDateContext'
import { useUndoableActions } from '@/contexts/UndoableActionContext'
import { validateAdhocTaskInput } from '@/features/routine/adhocTaskInput'
import {
    createAdhocRoutineEntry,
    deleteRoutineDayEntry,
    listRoutineEntriesVisibleOn,
    listRoutineItems,
    markAdhocRoutineEntryDone,
    markRoutineItemDone,
    seedSuggestedRoutineItems,
    unmarkAdhocRoutineEntryDone,
} from '@/features/routine/api'
import { RoutineItemsEditor } from '@/features/routine/RoutineItemsEditor'
import { deriveRoutineEmptyState, resolveRoutineForDate } from '@/features/routine/resolveRoutine'
import { deriveRoutineRowActions, type RoutineRowActions, type RoutineRowRemoval } from '@/features/routine/routineRowActions'
import { ROUTINE_LINK_KIND_TARGET_TAB } from '@/features/routine/types'
import type { RoutineDayEntryRow, RoutineItemRow, RoutineRow, RoutineRowState } from '@/features/routine/types'
import { fetchDaySignals, type DaySignals } from '@/features/shared/daySignals'
import { shiftIsoDate, type IsoDate } from '@/lib/dateUtils'

export function RoutineTab() {
    const { selectedDate } = useSelectedDate()
    const { goToTab } = useAppNavigation()
    const { refreshDayStatus } = useDayStatus()
    const { scheduleDeletion, isPendingDeletion } = useUndoableActions()
    const [items, setItems] = useState<RoutineItemRow[]>([])
    const [dayEntries, setDayEntries] = useState<RoutineDayEntryRow[]>([])
    const [signals, setSignals] = useState<DaySignals | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [editorTarget, setEditorTarget] = useState<{ initialEditingItemId: string | null } | null>(null)
    const [isCreatingSuggested, setIsCreatingSuggested] = useState(false)
    const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    async function reloadRoutine() {
        setIsLoading(true)
        setErrorMessage(null)
        try {
            const [nextItems, nextDayEntries, nextSignals] = await Promise.all([
                listRoutineItems(),
                listRoutineEntriesVisibleOn(selectedDate),
                fetchDaySignals(selectedDate),
            ])
            setItems(nextItems)
            setDayEntries(nextDayEntries)
            setSignals(nextSignals)
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : 'Falha ao carregar a rotina'
            setErrorMessage(message)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        void reloadRoutine()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate])

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const resolvedRows = useMemo(
        () => (signals ? resolveRoutineForDate(selectedDate, items, dayEntries, signals) : []),
        [selectedDate, items, dayEntries, signals],
    )
    const rows = resolvedRows.filter((row) => !(row.source === 'adhoc' && isPendingDeletion(row.id)))
    const emptyState = useMemo(() => deriveRoutineEmptyState(items, rows), [items, rows])
    const activeItemIds = useMemo(
        () => new Set(items.filter((item) => item.archived_on === null).map((item) => item.id)),
        [items],
    )

    async function runRoutineAction(action: () => Promise<unknown>) {
        setActionErrorMessage(null)
        try {
            await action()
            await reloadRoutine()
            refreshDayStatus()
        } catch (actionError) {
            const message = actionError instanceof Error ? actionError.message : 'Falha ao atualizar a rotina'
            setActionErrorMessage(message)
            throw actionError
        }
    }

    async function handleMarkDone(routineItemId: string) {
        await runRoutineAction(() => markRoutineItemDone(routineItemId, selectedDate))
    }

    async function handleConfirmDone(row: RoutineRow) {
        if (row.source === 'adhoc' && row.dayEntryId) {
            await runRoutineAction(() => markAdhocRoutineEntryDone(row.dayEntryId!, selectedDate))
            return
        }
        if (row.routineItemId) {
            await handleMarkDone(row.routineItemId)
        }
    }

    async function handleRemove(row: RoutineRow, removal: RoutineRowRemoval) {
        if (!row.dayEntryId || !removal) {
            return
        }
        if (row.source === 'adhoc' && removal === 'delete_day_entry') {
            scheduleAdhocDeletion(row, row.dayEntryId)
            return
        }
        await runRoutineAction(() =>
            removal === 'unmark_adhoc'
                ? unmarkAdhocRoutineEntryDone(row.dayEntryId!)
                : deleteRoutineDayEntry(row.dayEntryId!),
        )
    }

    // Descartar uma tarefa avulsa apaga a linha inteira (título e prazo
    // inclusos), então passa pela janela de desfazer em vez de sumir na hora.
    function scheduleAdhocDeletion(row: RoutineRow, dayEntryId: string) {
        setActionErrorMessage(null)
        scheduleDeletion({
            id: dayEntryId,
            label: `Rotina: ${row.title}`,
            commit: () => deleteRoutineDayEntry(dayEntryId),
            onCommitted: () => {
                void reloadRoutine()
                refreshDayStatus()
            },
            onRestored: () => setActionErrorMessage('Não foi possível remover essa tarefa.'),
        })
    }

    async function handleCreateSuggested() {
        setIsCreatingSuggested(true)
        setErrorMessage(null)
        try {
            await seedSuggestedRoutineItems()
            await reloadRoutine()
            refreshDayStatus()
        } catch (createError) {
            const message = createError instanceof Error ? createError.message : 'Falha ao criar rotina sugerida'
            setErrorMessage(message)
        } finally {
            setIsCreatingSuggested(false)
        }
    }

    if (editorTarget) {
        return (
            <RoutineItemsEditor
                items={items}
                initialEditingItemId={editorTarget.initialEditingItemId}
                onClose={() => setEditorTarget(null)}
                onChanged={reloadRoutine}
            />
        )
    }

    return (
        <div>
            <div className="workout-toolbar">
                <h2 style={{ fontSize: 16, margin: 0 }}>Rotina do dia</h2>
                <div className="overflow-menu" ref={menuRef}>
                    <button
                        type="button"
                        className="icon-button"
                        aria-label="Mais ações"
                        onClick={() => setIsMenuOpen((previous) => !previous)}
                    >
                        ⋮
                    </button>
                    {isMenuOpen && (
                        <div className="overflow-menu__panel">
                            <button
                                type="button"
                                className="overflow-menu__item"
                                onClick={() => {
                                    setEditorTarget({ initialEditingItemId: null })
                                    setIsMenuOpen(false)
                                }}
                            >
                                Gerenciar itens de rotina
                            </button>
                        </div>
                    )}
                </div>
            </div>
            {isLoading && <p>Carregando...</p>}
            {errorMessage && <div className="error-list">{errorMessage}</div>}
            {!isLoading && !errorMessage && emptyState === 'offer_suggested' && (
                <div className="card">
                    <p style={{ marginTop: 0 }}>Nenhum item de rotina criado ainda.</p>
                    <button
                        type="button"
                        className="primary-button"
                        disabled={isCreatingSuggested}
                        onClick={handleCreateSuggested}
                    >
                        {isCreatingSuggested ? 'Criando...' : 'Criar rotina sugerida'}
                    </button>
                </div>
            )}
            {!isLoading && !errorMessage && emptyState === 'nothing_for_day' && (
                <div className="card">
                    <p style={{ margin: 0 }}>Nada de rotina pra este dia.</p>
                </div>
            )}
            {actionErrorMessage && <div className="error-list">{actionErrorMessage}</div>}
            {!isLoading && !errorMessage && rows.length > 0 && (
                <div className="card">
                    {rows.map((row) => (
                        <RoutineRowView
                            key={`${selectedDate}:${row.id}`}
                            row={row}
                            actions={deriveRoutineRowActions(row, activeItemIds)}
                            onNavigate={() => row.linkKind && goToTab(ROUTINE_LINK_KIND_TARGET_TAB[row.linkKind])}
                            onMarkWithoutRegistering={() => row.routineItemId && void handleMarkDone(row.routineItemId)}
                            onConfirmDone={() => handleConfirmDone(row)}
                            onEdit={() => setEditorTarget({ initialEditingItemId: row.routineItemId })}
                            onRemove={(removal) => handleRemove(row, removal)}
                        />
                    ))}
                </div>
            )}
            {!isLoading && !errorMessage && <NewAdhocTaskField entryDate={selectedDate} onCreated={reloadRoutine} />}
        </div>
    )
}

type RoutineRowViewProps = {
    row: RoutineRow
    actions: RoutineRowActions
    onNavigate: () => void
    onMarkWithoutRegistering: () => void
    onConfirmDone: () => Promise<void>
    onEdit: () => void
    onRemove: (removal: RoutineRowRemoval) => Promise<void>
}

function RoutineRowView({
    row,
    actions,
    onNavigate,
    onMarkWithoutRegistering,
    onConfirmDone,
    onEdit,
    onRemove,
}: RoutineRowViewProps) {
    const [isConfirming, setIsConfirming] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    if (actions.primary === 'linked_register') {
        return (
            <div className="routine-row">
                <span className="routine-row__title">{row.title}</span>
                <div className="routine-row__linked-actions">
                    <button type="button" className="primary-button" onClick={onNavigate}>
                        Registrar agora
                    </button>
                    <button
                        type="button"
                        className="routine-row__secondary-action"
                        onClick={onMarkWithoutRegistering}
                    >
                        Marcar feito sem registrar
                    </button>
                </div>
            </div>
        )
    }

    async function handleConfirm() {
        setIsSubmitting(true)
        try {
            await onConfirmDone()
        } finally {
            setIsSubmitting(false)
            setIsConfirming(false)
        }
    }

    async function handleRemoveClick() {
        setIsSubmitting(true)
        try {
            await onRemove(actions.removal)
        } finally {
            setIsSubmitting(false)
        }
    }

    if (actions.primary === 'confirm_done' && isConfirming) {
        return (
            <div className="routine-row">
                <span className="routine-row__title">Confirmar conclusão de {row.title}?</span>
                <div className="routine-row__linked-actions">
                    <button type="button" className="primary-button" disabled={isSubmitting} onClick={handleConfirm}>
                        Confirmar
                    </button>
                    <button
                        type="button"
                        className="routine-row__secondary-action"
                        disabled={isSubmitting}
                        onClick={() => setIsConfirming(false)}
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        )
    }

    const isDone = row.state === 'done' || row.state === 'done_manual_override'
    const isTappable = actions.primary === 'confirm_done'
    const hasRowActions = actions.canEdit || actions.removal !== null
    const deadlineHint = isDone ? null : describeDeadline(row)
    const isOverdue = !isDone && row.deadline === 'overdue'

    return (
        <div className={isOverdue ? 'routine-row routine-row--overdue' : 'routine-row'}>
            <button
                type="button"
                className="routine-row__toggle"
                onClick={isTappable ? () => setIsConfirming(true) : undefined}
                disabled={!isTappable}
                aria-pressed={isDone}
            >
                <span className={routineCheckClassName(row.state)} aria-hidden="true">
                    {isDone ? '✓' : ''}
                </span>
                <span className={isDone ? 'routine-row__title routine-row__title--done' : 'routine-row__title'}>
                    {row.title}
                </span>
            </button>
            {hasRowActions && (
                <div className="routine-row__linked-actions">
                    {actions.canEdit && (
                        <button type="button" className="routine-row__secondary-action" onClick={onEdit}>
                            Editar
                        </button>
                    )}
                    {actions.removal !== null && (
                        <button
                            type="button"
                            className="routine-row__secondary-action"
                            disabled={isSubmitting}
                            aria-label={removalAriaLabel(row, actions.removal)}
                            onClick={handleRemoveClick}
                        >
                            Remover
                        </button>
                    )}
                </div>
            )}
            {row.state === 'done_manual_override' && (
                <p className="routine-row__hint">Marcado sem registro na aba de origem.</p>
            )}
            {deadlineHint && <p className={deadlineHint.className}>{deadlineHint.text}</p>}
        </div>
    )
}

function removalAriaLabel(row: RoutineRow, removal: RoutineRowRemoval): string {
    if (removal === 'unmark_adhoc') {
        return 'Remover conclusão'
    }

    return row.source === 'adhoc' ? `Remover tarefa ${row.title}` : 'Remover'
}

// "Atrasada desde" aponta o primeiro dia depois do prazo, que é quando a
// tarefa passou de fato a estar atrasada.
function describeDeadline(row: RoutineRow): { text: string; className: string } | null {
    if (row.dueDate === null || row.deadline === null) {
        return null
    }

    switch (row.deadline) {
        case 'on_time':
            return {
                text: `Prazo ${formatDayMonthLabel(row.dueDate)}`,
                className: 'routine-row__hint routine-row__hint--muted',
            }
        case 'due_today':
            return { text: 'Vence hoje', className: 'routine-row__hint' }
        case 'overdue':
            return {
                text: `Atrasada desde ${formatDayMonthLabel(shiftIsoDate(row.dueDate, 1))}`,
                className: 'routine-row__hint routine-row__hint--overdue',
            }
        default:
            return null
    }
}

function routineCheckClassName(state: RoutineRowState): string {
    if (state === 'done_manual_override') {
        return 'routine-row__check routine-row__check--override'
    }
    if (state === 'done') {
        return 'routine-row__check routine-row__check--done'
    }

    return 'routine-row__check'
}

type NewAdhocTaskFieldProps = {
    entryDate: IsoDate
    onCreated: () => Promise<void>
}

function NewAdhocTaskField({ entryDate, onCreated }: NewAdhocTaskFieldProps) {
    const [title, setTitle] = useState('')
    const [targetDate, setTargetDate] = useState<string>(entryDate)
    const [hasDueDate, setHasDueDate] = useState(false)
    const [dueDate, setDueDate] = useState<string>(entryDate)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null)

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault()
        const validation = validateAdhocTaskInput(title, targetDate, hasDueDate ? dueDate : null)
        if (!validation.ok) {
            setErrorMessage(validation.message)
            return
        }
        const input = validation.value

        setErrorMessage(null)
        setConfirmationMessage(null)
        setIsSubmitting(true)
        try {
            await createAdhocRoutineEntry(input.entryDate, input.title, input.dueDate)
            setTitle('')
            setHasDueDate(false)
            // Uma tarefa com prazo criada num dia anterior ao selecionado já
            // aparece na lista aberta, carregada do dia de origem.
            const isCarriedIntoSelectedDate = input.dueDate !== null && input.entryDate < entryDate
            if (input.entryDate === entryDate || isCarriedIntoSelectedDate) {
                await onCreated()
            }
            if (input.entryDate !== entryDate) {
                // Data diferente da selecionada na tela: a confirmação local
                // deixa claro pra qual dia a tarefa foi.
                setConfirmationMessage(`Tarefa adicionada para ${formatDayMonthLabel(input.entryDate)}.`)
            }
        } catch (submitError) {
            const message = submitError instanceof Error ? submitError.message : 'Falha ao criar tarefa'
            setErrorMessage(message)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            {errorMessage && <div className="error-list">{errorMessage}</div>}
            {confirmationMessage && (
                <p style={{ fontSize: 13, color: '#52525b', margin: '0 0 8px' }}>{confirmationMessage}</p>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="+ Nova tarefa avulsa"
                    aria-label="Nova tarefa avulsa"
                    className="routine-adhoc-input"
                />
                <input
                    type="date"
                    value={targetDate}
                    onChange={(event) => setTargetDate(event.target.value)}
                    aria-label="Data da tarefa"
                    className="routine-adhoc-input"
                    style={{ flex: '0 0 auto' }}
                />
                {hasDueDate && (
                    <input
                        type="date"
                        value={dueDate}
                        min={targetDate}
                        onChange={(event) => setDueDate(event.target.value)}
                        aria-label="Prazo da tarefa"
                        className="routine-adhoc-input"
                        style={{ flex: '0 0 auto' }}
                    />
                )}
                <button
                    type="button"
                    className="secondary-button"
                    aria-pressed={hasDueDate}
                    onClick={() => {
                        if (!hasDueDate) {
                            setDueDate(targetDate)
                        }
                        setHasDueDate((previous) => !previous)
                    }}
                >
                    {hasDueDate ? 'Sem prazo' : '+ Prazo'}
                </button>
                <button type="submit" className="secondary-button" disabled={isSubmitting}>
                    {isSubmitting ? 'Adicionando...' : 'Adicionar'}
                </button>
            </div>
        </form>
    )
}

function formatDayMonthLabel(isoDate: IsoDate): string {
    const [, month, day] = isoDate.split('-')
    return `${day}/${month}`
}
