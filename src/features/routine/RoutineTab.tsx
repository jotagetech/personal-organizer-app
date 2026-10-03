import { Check, EllipsisVertical, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useAppNavigation } from '@/contexts/AppNavigationContext'
import { useDayStatus } from '@/contexts/DayStatusContext'
import { useSelectedDate } from '@/contexts/SelectedDateContext'
import { useUndoableActions } from '@/contexts/UndoableActionContext'
import { validateAdhocTaskInput } from '@/features/routine/adhocTaskInput'
import {
    createRoutineTask,
    deleteRoutineDayEntry,
    deleteRoutineTask,
    getRoutineOnboardedAt,
    loadRoutineDataForDate,
    markRoutineItemDone,
    markRoutineTaskDone,
    unmarkRoutineTaskDone,
} from '@/features/routine/api'
import { RoutineItemsEditor } from '@/features/routine/RoutineItemsEditor'
import { RoutineOnboarding } from '@/features/routine/RoutineOnboarding'
import {
    countRoutineProgress,
    deriveRoutineEmptyState,
    isRoutineRowDone,
    resolveRoutineForDate,
} from '@/features/routine/resolveRoutine'
import { deriveRoutineRowActions, type RoutineRowActions, type RoutineRowRemoval } from '@/features/routine/routineRowActions'
import { ROUTINE_LINK_KIND_TARGET_TAB } from '@/features/routine/types'
import type { RoutineData, RoutineRow, RoutineRowState } from '@/features/routine/types'
import { fetchDaySignals, type DaySignals } from '@/features/shared/daySignals'
import type { IsoDate } from '@/lib/dateUtils'

const MENU_ICON_SIZE = 22
const CHECK_ICON_SIZE = 16
const CHECK_ICON_STROKE = 3
const BUTTON_ICON_SIZE = 18
const EMPTY_ROUTINE_DATA: RoutineData = { items: [], schedules: [], entries: [], tasks: [] }

export function RoutineTab() {
    const { selectedDate } = useSelectedDate()
    const { goToTab } = useAppNavigation()
    const { refreshDayStatus } = useDayStatus()
    const { scheduleDeletion, isPendingDeletion } = useUndoableActions()
    const [routineData, setRoutineData] = useState<RoutineData>(EMPTY_ROUTINE_DATA)
    const [signals, setSignals] = useState<DaySignals | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [editorTarget, setEditorTarget] = useState<{ initialEditingItemId: string | null } | null>(null)
    const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null)
    const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    async function reloadRoutine() {
        setIsLoading(true)
        setErrorMessage(null)
        try {
            const [nextRoutineData, nextSignals, onboardedAt] = await Promise.all([
                loadRoutineDataForDate(selectedDate),
                fetchDaySignals(selectedDate),
                getRoutineOnboardedAt(),
            ])
            setRoutineData(nextRoutineData)
            setSignals(nextSignals)
            setIsOnboarded(onboardedAt !== null)
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

    const items = routineData.items
    const resolvedRows = useMemo(
        () => (signals ? resolveRoutineForDate(selectedDate, routineData, signals) : []),
        [selectedDate, routineData, signals],
    )
    const rows = resolvedRows.filter((row) => !(row.source === 'task' && isPendingDeletion(row.id)))
    const emptyState = useMemo(() => deriveRoutineEmptyState(items, rows), [items, rows])
    const progress = countRoutineProgress(rows)
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
        if (row.source === 'task' && row.taskId) {
            await runRoutineAction(() => markRoutineTaskDone(row.taskId!, selectedDate))
            return
        }
        if (row.routineItemId) {
            await handleMarkDone(row.routineItemId)
        }
    }

    async function handleRemove(row: RoutineRow, removal: RoutineRowRemoval) {
        if (removal === 'delete_task' && row.taskId) {
            scheduleTaskDeletion(row, row.taskId)
            return
        }
        if (removal === 'unmark_task' && row.taskId) {
            await runRoutineAction(() => unmarkRoutineTaskDone(row.taskId!))
            return
        }
        if (removal === 'delete_day_entry' && row.dayEntryId) {
            await runRoutineAction(() => deleteRoutineDayEntry(row.dayEntryId!))
        }
    }

    // Descartar uma tarefa apaga a linha inteira, então passa pela janela de
    // desfazer em vez de sumir na hora.
    function scheduleTaskDeletion(row: RoutineRow, taskId: string) {
        setActionErrorMessage(null)
        scheduleDeletion({
            id: taskId,
            label: `Rotina: ${row.title}`,
            commit: () => deleteRoutineTask(taskId),
            onCommitted: () => {
                void reloadRoutine()
                refreshDayStatus()
            },
            onRestored: () => setActionErrorMessage('Não foi possível remover essa tarefa.'),
        })
    }

    async function handleOnboardingFinished() {
        await reloadRoutine()
        refreshDayStatus()
    }

    if (!isLoading && !errorMessage && isOnboarded === false) {
        return <RoutineOnboarding onFinished={handleOnboardingFinished} />
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
            <div className="page-header">
                <div className="page-header__title-group">
                    <h2 className="page-title">Rotina do dia</h2>
                    {!isLoading && !errorMessage && rows.length > 0 && (
                        <span className="page-header__count">
                            {progress.done} de {progress.total}
                        </span>
                    )}
                </div>
                <div className="overflow-menu" ref={menuRef}>
                    <button
                        type="button"
                        className="icon-button"
                        aria-label="Mais ações"
                        onClick={() => setIsMenuOpen((previous) => !previous)}
                    >
                        <EllipsisVertical size={MENU_ICON_SIZE} aria-hidden="true" />
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
            {isLoading && <p className="text-muted">Carregando...</p>}
            {errorMessage && <div className="error-list">{errorMessage}</div>}
            {!isLoading && !errorMessage && emptyState === 'no_items' && (
                <div className="card">
                    <p className="empty-state__text">Sua rotina ainda não tem itens.</p>
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setEditorTarget({ initialEditingItemId: null })}
                    >
                        Gerenciar itens de rotina
                    </button>
                </div>
            )}
            {!isLoading && !errorMessage && emptyState === 'nothing_for_day' && (
                <div className="card">
                    <p className="empty-state__text">Nada de rotina pra este dia.</p>
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

    const isDone = isRoutineRowDone(row.state)
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
                    {isDone && <Check size={CHECK_ICON_SIZE} strokeWidth={CHECK_ICON_STROKE} />}
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
        </div>
    )
}

function removalAriaLabel(row: RoutineRow, removal: RoutineRowRemoval): string {
    if (removal === 'unmark_task') {
        return 'Remover conclusão'
    }

    return removal === 'delete_task' ? `Remover tarefa ${row.title}` : 'Remover'
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
        const validation = validateAdhocTaskInput(title, targetDate)
        if (!validation.ok) {
            setErrorMessage(validation.message)
            return
        }
        const input = validation.value

        setErrorMessage(null)
        setConfirmationMessage(null)
        setIsSubmitting(true)
        try {
            await createRoutineTask(input.scheduledOn, input.title)
            setTitle('')
            if (input.scheduledOn === entryDate) {
                await onCreated()
            } else {
                // Data diferente da selecionada na tela: a confirmação local
                // deixa claro pra qual dia a tarefa foi.
                setConfirmationMessage(`Tarefa adicionada para ${formatDayMonthLabel(input.scheduledOn)}.`)
            }
        } catch (submitError) {
            const message = submitError instanceof Error ? submitError.message : 'Falha ao criar tarefa'
            setErrorMessage(message)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <form className="card adhoc-task-form" onSubmit={handleSubmit}>
            {errorMessage && <div className="error-list">{errorMessage}</div>}
            {confirmationMessage && <p className="adhoc-task-form__confirmation">{confirmationMessage}</p>}
            <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="+ Nova tarefa avulsa"
                aria-label="Nova tarefa avulsa"
                className="adhoc-task-form__input"
            />
            <div className="adhoc-task-form__dates">
                <input
                    type="date"
                    value={targetDate}
                    onChange={(event) => setTargetDate(event.target.value)}
                    aria-label="Data da tarefa"
                    className="adhoc-task-form__input"
                />
            </div>
            <button type="submit" className="primary-button adhoc-task-form__submit" disabled={isSubmitting}>
                <Plus size={BUTTON_ICON_SIZE} aria-hidden="true" />
                {isSubmitting ? 'Adicionando...' : 'Adicionar'}
            </button>
        </form>
    )
}

function formatDayMonthLabel(isoDate: IsoDate): string {
    const [, month, day] = isoDate.split('-')
    return `${day}/${month}`
}
