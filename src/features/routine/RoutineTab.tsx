import { Check, ChevronDown, ChevronRight, EllipsisVertical, Plus, Star } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useAppNavigation } from '@/contexts/AppNavigationContext'
import { useDayStatus } from '@/contexts/DayStatusContext'
import { useSelectedDate } from '@/contexts/SelectedDateContext'
import { useUndoableActions } from '@/contexts/UndoableActionContext'
import {
    deleteRoutineDayEntry,
    deleteRoutineTask,
    getRoutineOnboardedAt,
    listRoutineCategories,
    loadRoutineDataForDate,
    markRoutineItemDone,
    markRoutineTaskDone,
    unmarkRoutineTaskDone,
} from '@/features/routine/api'
import {
    ALL_CATEGORIES_FILTER,
    filterRowsByCategory,
    findCategory,
    splitImportant,
    type CategoryFilter as CategoryFilterValue,
} from '@/features/routine/categories'
import { CategoriesScreen } from '@/features/routine/CategoriesScreen'
import { CategoryDot } from '@/features/routine/CategoryDot'
import { CategoryFilter } from '@/features/routine/CategoryFilter'
import { NewTaskSheet } from '@/features/routine/NewTaskSheet'
import { RoutineItemsEditor } from '@/features/routine/RoutineItemsEditor'
import { RoutineOnboarding } from '@/features/routine/RoutineOnboarding'
import {
    countRoutineProgress,
    deriveRoutineEmptyState,
    isRoutineRowDone,
    listUndatedTasks,
    resolveRoutineForDate,
    resolveTaskRow,
} from '@/features/routine/resolveRoutine'
import { deriveRoutineRowActions, type RoutineRowActions, type RoutineRowRemoval } from '@/features/routine/routineRowActions'
import { ROUTINE_LINK_KIND_TARGET_TAB } from '@/features/routine/types'
import type { RoutineCategoryRow, RoutineData, RoutineRow, RoutineRowState } from '@/features/routine/types'
import { fetchDaySignals, type DaySignals } from '@/features/shared/daySignals'

const MENU_ICON_SIZE = 22
const CHECK_ICON_SIZE = 16
const CHECK_ICON_STROKE = 3
const FAB_ICON_SIZE = 26
const SECTION_ICON_SIZE = 18
const META_ICON_SIZE = 12
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
    const [isNewTaskOpen, setIsNewTaskOpen] = useState(false)
    const [categories, setCategories] = useState<RoutineCategoryRow[]>([])
    const [isCategoriesOpen, setIsCategoriesOpen] = useState(false)
    const [categoryFilter, setCategoryFilter] = useState<CategoryFilterValue>(ALL_CATEGORIES_FILTER)
    const [isUndatedOpen, setIsUndatedOpen] = useState(false)
    const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null)
    const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    async function reloadRoutine() {
        setIsLoading(true)
        setErrorMessage(null)
        try {
            const [nextRoutineData, nextSignals, onboardedAt, nextCategories] = await Promise.all([
                loadRoutineDataForDate(selectedDate),
                fetchDaySignals(selectedDate),
                getRoutineOnboardedAt(),
                listRoutineCategories(),
            ])
            setRoutineData(nextRoutineData)
            setCategories(nextCategories)
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
    const undatedRows = useMemo(
        () =>
            listUndatedTasks(routineData.tasks)
                .map(resolveTaskRow)
                .filter((row) => !isPendingDeletion(row.id)),
        [routineData.tasks, isPendingDeletion],
    )
    // Um filtro que aponta para uma categoria apagada volta para todas.
    const isFilterValid = categoryFilter === ALL_CATEGORIES_FILTER || findCategory(categories, categoryFilter) !== null
    const activeFilter = isFilterValid ? categoryFilter : ALL_CATEGORIES_FILTER
    const { important: importantDayRows, rest: regularDayRows } = splitImportant(
        filterRowsByCategory(rows, activeFilter),
    )
    const visibleUndatedRows = filterRowsByCategory(undatedRows, activeFilter)
    const hasFilteredOutEverything =
        rows.length > 0 && importantDayRows.length === 0 && regularDayRows.length === 0
    const pendingUndatedCount = undatedRows.filter((row) => !isRoutineRowDone(row.state)).length
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

    async function handleTaskCreated() {
        await reloadRoutine()
        refreshDayStatus()
    }

    async function handleOnboardingFinished() {
        await reloadRoutine()
        refreshDayStatus()
    }

    function renderRow(row: RoutineRow, showStar = false) {
        return (
            <RoutineRowView
                key={`${selectedDate}:${row.id}`}
                row={row}
                category={findCategory(categories, row.categoryId)}
                showStar={showStar}
                actions={deriveRoutineRowActions(row, activeItemIds)}
                onNavigate={() => row.linkKind && goToTab(ROUTINE_LINK_KIND_TARGET_TAB[row.linkKind])}
                onMarkWithoutRegistering={() => row.routineItemId && void handleMarkDone(row.routineItemId)}
                onConfirmDone={() => handleConfirmDone(row)}
                onEdit={() => setEditorTarget({ initialEditingItemId: row.routineItemId })}
                onRemove={(removal) => handleRemove(row, removal)}
            />
        )
    }

    if (!isLoading && !errorMessage && isOnboarded === false) {
        return <RoutineOnboarding onFinished={handleOnboardingFinished} />
    }

    if (isCategoriesOpen) {
        return (
            <CategoriesScreen
                categories={categories}
                onClose={() => setIsCategoriesOpen(false)}
                onChanged={reloadRoutine}
            />
        )
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
                            <button
                                type="button"
                                className="overflow-menu__item"
                                onClick={() => {
                                    setIsCategoriesOpen(true)
                                    setIsMenuOpen(false)
                                }}
                            >
                                Categorias
                            </button>
                        </div>
                    )}
                </div>
            </div>
            {!isLoading && !errorMessage && (
                <CategoryFilter categories={categories} value={activeFilter} onChange={setCategoryFilter} />
            )}
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
            {!isLoading && !errorMessage && importantDayRows.length > 0 && (
                <section className="important-section">
                    <h3 className="important-section__title">
                        <Star size={SECTION_ICON_SIZE} aria-hidden="true" />
                        Importantes
                    </h3>
                    <div className="card">{importantDayRows.map((row) => renderRow(row))}</div>
                </section>
            )}
            {!isLoading && !errorMessage && regularDayRows.length > 0 && (
                <div className="card">{regularDayRows.map((row) => renderRow(row))}</div>
            )}
            {!isLoading && !errorMessage && hasFilteredOutEverything && (
                <div className="card">
                    <p className="empty-state__text">Nada nesta categoria hoje.</p>
                </div>
            )}
            {!isLoading && !errorMessage && visibleUndatedRows.length > 0 && (
                <section className="undated-section">
                    <button
                        type="button"
                        className="undated-section__toggle"
                        aria-expanded={isUndatedOpen}
                        onClick={() => setIsUndatedOpen((previous) => !previous)}
                    >
                        {isUndatedOpen ? (
                            <ChevronDown size={SECTION_ICON_SIZE} aria-hidden="true" />
                        ) : (
                            <ChevronRight size={SECTION_ICON_SIZE} aria-hidden="true" />
                        )}
                        Sem data ({pendingUndatedCount})
                    </button>
                    {isUndatedOpen && (
                        <div className="card">{visibleUndatedRows.map((row) => renderRow(row, row.isImportant))}</div>
                    )}
                </section>
            )}
            <button
                type="button"
                className="fab"
                aria-label="Nova tarefa"
                onClick={() => setIsNewTaskOpen(true)}
            >
                <Plus size={FAB_ICON_SIZE} aria-hidden="true" />
            </button>
            {isNewTaskOpen && (
                <NewTaskSheet
                    initialDate={selectedDate}
                    categories={categories}
                    onOpenCategories={() => {
                        setIsNewTaskOpen(false)
                        setIsCategoriesOpen(true)
                    }}
                    onClose={() => setIsNewTaskOpen(false)}
                    onCreated={handleTaskCreated}
                />
            )}
        </div>
    )
}

type RoutineRowViewProps = {
    row: RoutineRow
    category: RoutineCategoryRow | null
    showStar: boolean
    actions: RoutineRowActions
    onNavigate: () => void
    onMarkWithoutRegistering: () => void
    onConfirmDone: () => Promise<void>
    onEdit: () => void
    onRemove: (removal: RoutineRowRemoval) => Promise<void>
}

function RoutineRowView({
    row,
    category,
    showStar,
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
            {(category || showStar) && (
                <p className="routine-row__meta">
                    {showStar && (
                        <span className="routine-row__meta-item">
                            <Star size={META_ICON_SIZE} className="routine-row__star" aria-hidden="true" />
                            Importante
                        </span>
                    )}
                    {category && (
                        <span className="routine-row__meta-item">
                            <CategoryDot color={category.color} />
                            {category.name}
                        </span>
                    )}
                </p>
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
