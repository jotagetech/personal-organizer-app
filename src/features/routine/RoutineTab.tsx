import { Check, ChevronDown, ChevronRight, EllipsisVertical, Plus, Star } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useAppNavigation } from '@/contexts/AppNavigationContext'
import { useDayStatus } from '@/contexts/DayStatusContext'
import { useProfile } from '@/contexts/ProfileContext'
import { useSelectedDate } from '@/contexts/SelectedDateContext'
import { useUndoableActions } from '@/contexts/UndoableActionContext'
import { greetingText } from '@/features/account/profileGreeting'
import { useCurrentHour } from '@/features/account/useCurrentHour'
import {
    deleteRoutineDayEntry,
    deleteRoutineTask,
    bringTasksForward,
    listRoutineCategories,
    listTasksToBringForward,
    loadRoutineDataForDate,
    loadRoutineDataForRange,
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
import { CarryOverBanner } from '@/features/routine/CarryOverBanner'
import { CategoriesScreen } from '@/features/routine/CategoriesScreen'
import { CategoryDot } from '@/features/routine/CategoryDot'
import { CategoryFilter } from '@/features/routine/CategoryFilter'
import { NewTaskSheet } from '@/features/routine/NewTaskSheet'
import { RoutineProgressSummary } from '@/features/routine/RoutineProgressSummary'
import { RoutineItemsEditor } from '@/features/routine/RoutineItemsEditor'
import { RoutineOnboarding } from '@/features/routine/RoutineOnboarding'
import { wasRoutineOnboardingSkipped } from '@/features/routine/onboardingSession'
import {
    countRoutineProgress,
    deriveRoutineEmptyState,
    shouldShowRoutineOnboarding,
    isRoutineRowDone,
    listUndatedTasks,
    resolveRoutineForDate,
    resolveTaskRow,
    type RoutineProgress,
} from '@/features/routine/resolveRoutine'
import { shouldCelebrate } from '@/features/routine/routineCelebration'
import { deriveRoutineRowActions, type RoutineRowActions, type RoutineRowRemoval } from '@/features/routine/routineRowActions'
import { ROUTINE_LINK_KIND_TARGET_TAB } from '@/features/routine/types'
import type { RoutineCategoryRow, RoutineData, RoutineRow, RoutineRowState, RoutineTaskRow } from '@/features/routine/types'
import { dayMonthLabel } from '@/features/routine/shortDateLabel'
import { buildWeekProgress, weekDatesOf, type WeekDayProgress } from '@/features/routine/weekProgress'
import { fetchDaySignals, fetchDaySignalsForRange, type DaySignals } from '@/features/shared/daySignals'
import { todayInTimezone } from '@/lib/dateUtils'
import { playCelebration, unlockAudio } from '@/lib/sound'

const MENU_ICON_SIZE = 22
const CHECK_ICON_SIZE = 16
const CHECK_ICON_STROKE = 3
const FAB_ICON_SIZE = 26
const SECTION_ICON_SIZE = 18
const META_ICON_SIZE = 12
const EMPTY_ROUTINE_DATA: RoutineData = { items: [], schedules: [], entries: [], tasks: [] }

export function RoutineTab() {
    const { selectedDate, setSelectedDate } = useSelectedDate()
    const { goToTab } = useAppNavigation()
    const { refreshDayStatus } = useDayStatus()
    const { displayName, routineSoundEnabled } = useProfile()
    const currentHour = useCurrentHour()
    const { scheduleDeletion, isPendingDeletion } = useUndoableActions()
    const [routineData, setRoutineData] = useState<RoutineData>(EMPTY_ROUTINE_DATA)
    const [signals, setSignals] = useState<DaySignals | null>(null)
    const [loadedDate, setLoadedDate] = useState<string | null>(null)
    const [weekProgress, setWeekProgress] = useState<WeekDayProgress[] | null>(null)
    const [weekRefreshTick, setWeekRefreshTick] = useState(0)
    const weekRequestRef = useRef(0)
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [editorTarget, setEditorTarget] = useState<{ initialEditingItemId: string | null } | null>(null)
    const [isNewTaskOpen, setIsNewTaskOpen] = useState(false)
    const [editingTask, setEditingTask] = useState<RoutineTaskRow | null>(null)
    const [carryOverTasks, setCarryOverTasks] = useState<RoutineTaskRow[]>([])
    const [categories, setCategories] = useState<RoutineCategoryRow[]>([])
    const [isCategoriesOpen, setIsCategoriesOpen] = useState(false)
    const [categoryFilter, setCategoryFilter] = useState<CategoryFilterValue>(ALL_CATEGORIES_FILTER)
    const [isUndatedOpen, setIsUndatedOpen] = useState(false)
    const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const [celebrationKey, setCelebrationKey] = useState(0)
    const lastProgressRef = useRef<{ date: string; progress: RoutineProgress } | null>(null)
    const isTapPendingRef = useRef(false)

    async function loadSelectedDay() {
        setIsLoading(true)
        setErrorMessage(null)
        try {
            const today = todayInTimezone()
            const [nextRoutineData, nextSignals, nextCategories, nextCarryOverTasks] = await Promise.all([
                loadRoutineDataForDate(selectedDate),
                fetchDaySignals(selectedDate),
                listRoutineCategories(),
                selectedDate === today ? listTasksToBringForward(today) : Promise.resolve([]),
            ])
            setRoutineData(nextRoutineData)
            setCarryOverTasks(nextCarryOverTasks)
            setCategories(nextCategories)
            setSignals(nextSignals)
            setLoadedDate(selectedDate)
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : 'Falha ao carregar a rotina'
            setErrorMessage(message)
        } finally {
            setIsLoading(false)
        }
    }

    // A semana é recarregada à parte, sem passar pelo estado de carregamento
    // da lista: os anéis mantêm o valor anterior até o novo chegar.
    async function reloadRoutine() {
        await loadSelectedDay()
        setWeekRefreshTick((previous) => previous + 1)
    }

    useEffect(() => {
        void loadSelectedDay()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate])

    const weekStart = weekDatesOf(selectedDate)[0]

    useEffect(() => {
        const weekDates = weekDatesOf(weekStart)
        const requestId = weekRequestRef.current + 1
        weekRequestRef.current = requestId

        async function loadWeek() {
            try {
                const [weekRoutineData, signalsByDate] = await Promise.all([
                    loadRoutineDataForRange(weekDates[0], weekDates[6]),
                    fetchDaySignalsForRange(weekDates[0], weekDates[6]),
                ])
                if (weekRequestRef.current === requestId) {
                    setWeekProgress(buildWeekProgress(weekDates, weekRoutineData, signalsByDate, todayInTimezone()))
                }
            } catch {
                // Sem a semana a tela segue útil: os anéis ficam como estavam.
            }
        }
        void loadWeek()
    }, [weekStart, weekRefreshTick])

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

    // Só a passagem para "tudo feito" causada por um toque comemora: abrir o
    // dia já completo, trocar de dia ou recarregar apenas atualizam a referência.
    useEffect(() => {
        if (loadedDate !== selectedDate || !signals) {
            return
        }
        const previous = lastProgressRef.current
        lastProgressRef.current = { date: selectedDate, progress }
        if (previous === null || previous.date !== selectedDate) {
            isTapPendingRef.current = false
            return
        }
        if (previous.progress.done === progress.done && previous.progress.total === progress.total) {
            return
        }
        const isCelebrating = isTapPendingRef.current && shouldCelebrate(previous.progress, progress)
        isTapPendingRef.current = false
        if (isCelebrating) {
            setCelebrationKey((key) => key + 1)
            if (routineSoundEnabled) {
                playCelebration()
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadedDate, selectedDate, signals, progress.done, progress.total])

    async function runRoutineAction(action: () => Promise<unknown>) {
        setActionErrorMessage(null)
        try {
            await action()
            await reloadRoutine()
            refreshDayStatus()
        } catch (actionError) {
            isTapPendingRef.current = false
            const message = actionError instanceof Error ? actionError.message : 'Falha ao atualizar a rotina'
            setActionErrorMessage(message)
            throw actionError
        }
    }

    async function handleBringForward() {
        await runRoutineAction(() => bringTasksForward(carryOverTasks, todayInTimezone()))
    }

    // O iPhone só libera o áudio dentro do gesto, então o desbloqueio vem antes
    // de qualquer espera da gravação.
    function registerCompletionTap() {
        unlockAudio()
        isTapPendingRef.current = true
    }

    async function handleMarkDone(routineItemId: string) {
        registerCompletionTap()
        await runRoutineAction(() => markRoutineItemDone(routineItemId, selectedDate))
    }

    async function handleConfirmDone(row: RoutineRow) {
        if (row.source === 'task' && row.taskId) {
            registerCompletionTap()
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

    function handleEdit(row: RoutineRow) {
        if (row.taskId) {
            setEditingTask(routineData.tasks.find((task) => task.id === row.taskId) ?? null)
            return
        }
        setEditorTarget({ initialEditingItemId: row.routineItemId })
    }

    async function handleTaskSaved() {
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
                onEdit={() => handleEdit(row)}
                onRemove={(removal) => handleRemove(row, removal)}
            />
        )
    }

    if (!isLoading && !errorMessage && shouldShowRoutineOnboarding(items, wasRoutineOnboardingSkipped())) {
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
                categories={categories}
                initialEditingItemId={editorTarget.initialEditingItemId}
                onOpenCategories={() => {
                    setEditorTarget(null)
                    setIsCategoriesOpen(true)
                }}
                onClose={() => setEditorTarget(null)}
                onChanged={reloadRoutine}
            />
        )
    }

    return (
        <div>
            <p className="routine-greeting">{greetingText(currentHour, displayName)}</p>
            {!errorMessage && (
                <RoutineProgressSummary
                    selectedDate={selectedDate}
                    today={todayInTimezone()}
                    dayProgress={loadedDate === selectedDate && signals ? progress : null}
                    week={weekProgress}
                    celebrationKey={celebrationKey}
                    onSelectDate={setSelectedDate}
                />
            )}
            <div className="page-header">
                <div className="page-header__title-group">
                    <h2 className="page-title">Rotina do dia</h2>
                    {!isLoading && !errorMessage && progress.total > 0 && (
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
            {!isLoading && !errorMessage && carryOverTasks.length > 0 && (
                <CarryOverBanner
                    titles={carryOverTasks.map((task) => task.title)}
                    onBringForward={handleBringForward}
                />
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
            {(isNewTaskOpen || editingTask) && (
                <NewTaskSheet
                    initialDate={selectedDate}
                    task={editingTask ?? undefined}
                    categories={categories}
                    onOpenCategories={() => {
                        setIsNewTaskOpen(false)
                        setEditingTask(null)
                        setIsCategoriesOpen(true)
                    }}
                    onClose={() => {
                        setIsNewTaskOpen(false)
                        setEditingTask(null)
                    }}
                    onSaved={handleTaskSaved}
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

    if (row.state === 'moved') {
        return (
            <div className="routine-row routine-row--moved">
                <span className="routine-row__title routine-row__title--moved">{row.title}</span>
                <p className="routine-row__moved-note">{movedNoteText(row.movedToDate)}</p>
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
            {(category || showStar || row.carriedFromDate) && (
                <p className="routine-row__meta">
                    {showStar && (
                        <span className="routine-row__meta-item">
                            <Star size={META_ICON_SIZE} className="routine-row__star" aria-hidden="true" />
                            Importante
                        </span>
                    )}
                    {row.carriedFromDate && (
                        <span className="routine-row__meta-item">Trazida de {dayMonthLabel(row.carriedFromDate)}</span>
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

function movedNoteText(movedToDate: string | null): string {
    if (movedToDate === null || movedToDate === todayInTimezone()) {
        return 'Levada para hoje'
    }

    return `Levada para ${dayMonthLabel(movedToDate)}`
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
