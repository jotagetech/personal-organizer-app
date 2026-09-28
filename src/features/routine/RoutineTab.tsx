import { useEffect, useMemo, useRef, useState } from 'react'

import { useAppNavigation } from '@/contexts/AppNavigationContext'
import { useDayStatus } from '@/contexts/DayStatusContext'
import { useSelectedDate } from '@/contexts/SelectedDateContext'
import {
    createAdhocRoutineEntry,
    deleteRoutineDayEntry,
    listRoutineDayEntries,
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
import { isValidIsoDate, type IsoDate } from '@/lib/dateUtils'

export function RoutineTab() {
    const { selectedDate } = useSelectedDate()
    const { goToTab } = useAppNavigation()
    const { refreshDayStatus } = useDayStatus()
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
                listRoutineDayEntries(selectedDate),
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

    const rows = useMemo(
        () => (signals ? resolveRoutineForDate(selectedDate, items, dayEntries, signals) : []),
        [selectedDate, items, dayEntries, signals],
    )
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
            await runRoutineAction(() => markAdhocRoutineEntryDone(row.dayEntryId!))
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
        await runRoutineAction(() =>
            removal === 'unmark_adhoc'
                ? unmarkAdhocRoutineEntryDone(row.dayEntryId!)
                : deleteRoutineDayEntry(row.dayEntryId!),
        )
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

    return (
        <div className="routine-row">
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
                            aria-label={actions.removal === 'unmark_adhoc' ? 'Remover conclusão' : 'Remover'}
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
        </div>
    )
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
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null)

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault()
        const trimmedTitle = title.trim()
        if (trimmedTitle === '') {
            setErrorMessage('Informe a tarefa.')
            return
        }
        if (!isValidIsoDate(targetDate)) {
            setErrorMessage('Informe a data.')
            return
        }

        setErrorMessage(null)
        setConfirmationMessage(null)
        setIsSubmitting(true)
        try {
            await createAdhocRoutineEntry(targetDate, trimmedTitle)
            setTitle('')
            if (targetDate === entryDate) {
                await onCreated()
            } else {
                // Data diferente da selecionada na tela: a lista visível não
                // muda, então uma confirmação local substitui o reload.
                setConfirmationMessage(`Tarefa adicionada para ${formatDayMonthLabel(targetDate)}.`)
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
