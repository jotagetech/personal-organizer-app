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
    const [isEditorOpen, setIsEditorOpen] = useState(false)
    const [isCreatingSuggested, setIsCreatingSuggested] = useState(false)
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

    async function handleMarkDone(routineItemId: string) {
        await markRoutineItemDone(routineItemId, selectedDate)
        await reloadRoutine()
        refreshDayStatus()
    }

    async function handleMarkAdhocDone(dayEntryId: string) {
        await markAdhocRoutineEntryDone(dayEntryId)
        await reloadRoutine()
        refreshDayStatus()
    }

    async function handleUnmark(row: RoutineRow) {
        if (!row.dayEntryId) {
            return
        }
        if (row.source === 'adhoc') {
            await unmarkAdhocRoutineEntryDone(row.dayEntryId)
        } else {
            await deleteRoutineDayEntry(row.dayEntryId)
        }
        await reloadRoutine()
        refreshDayStatus()
    }

    function handleCheckboxTap(row: RoutineRow) {
        if (row.state === 'pending' && row.source === 'manual' && row.routineItemId) {
            void handleMarkDone(row.routineItemId)
            return
        }
        if (row.state === 'pending' && row.source === 'adhoc' && row.dayEntryId) {
            void handleMarkAdhocDone(row.dayEntryId)
            return
        }
        // Concluído só pelo sinal, sem marcação manual pra remover: o
        // checkbox nem chega a ficar tocável nesse caso (ver isTappable em
        // RoutineRowView), então esse branch só roda com dayEntryId presente.
        if (row.dayEntryId) {
            void handleUnmark(row)
        }
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

    if (isEditorOpen) {
        return <RoutineItemsEditor items={items} onClose={() => setIsEditorOpen(false)} onChanged={reloadRoutine} />
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
                                    setIsEditorOpen(true)
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
            {!isLoading && !errorMessage && rows.length > 0 && (
                <div className="card">
                    {rows.map((row) => (
                        <RoutineRowView
                            key={row.id}
                            row={row}
                            onCheckboxTap={() => handleCheckboxTap(row)}
                            onNavigate={() => row.linkKind && goToTab(ROUTINE_LINK_KIND_TARGET_TAB[row.linkKind])}
                            onMarkWithoutRegistering={() => row.routineItemId && void handleMarkDone(row.routineItemId)}
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
    onCheckboxTap: () => void
    onNavigate: () => void
    onMarkWithoutRegistering: () => void
}

function RoutineRowView({ row, onCheckboxTap, onNavigate, onMarkWithoutRegistering }: RoutineRowViewProps) {
    if (row.source === 'linked' && row.state === 'pending') {
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

    const isDone = row.state === 'done' || row.state === 'done_manual_override'
    const isTappable = row.state === 'pending' || row.dayEntryId !== null

    return (
        <div className="routine-row">
            <button
                type="button"
                className="routine-row__toggle"
                onClick={isTappable ? onCheckboxTap : undefined}
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
