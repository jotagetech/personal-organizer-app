import { Check, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useAppNavigation } from '@/contexts/AppNavigationContext'
import { useDayStatus } from '@/contexts/DayStatusContext'
import { useProfile } from '@/contexts/ProfileContext'
import { useSelectedDate } from '@/contexts/SelectedDateContext'
import {
    listRoutineCategories,
    loadRoutineDataForDate,
    markRoutineItemDone,
    markRoutineTaskDone,
} from '@/features/routine/api'
import { findCategory } from '@/features/routine/categories'
import { CategoryDot } from '@/features/routine/CategoryDot'
import { ProgressRing } from '@/features/routine/ProgressRing'
import { shouldShowRoutineOnboarding } from '@/features/routine/resolveRoutine'
import { shouldCelebrate } from '@/features/routine/routineCelebration'
import { buildRoutineDayCardModel, type RoutineDayCardModel } from '@/features/routine/routineDayCardRows'
import {
    ROUTINE_LINK_KIND_TARGET_TAB,
    type RoutineCategoryRow,
    type RoutineRow,
} from '@/features/routine/types'
import { fetchDaySignals } from '@/features/shared/daySignals'
import type { IsoDate } from '@/lib/dateUtils'
import { playCelebration, unlockAudio } from '@/lib/sound'

const RING_SIZE = 48
const RING_STROKE = 5
const CHECK_ICON_SIZE = 16
const CHECK_ICON_STROKE = 3
const LINK_ICON_SIZE = 16
const OFFLINE_MESSAGE = 'Sem conexão. Marque de novo quando a internet voltar.'

type LoadedCard = {
    model: RoutineDayCardModel
    categories: RoutineCategoryRow[]
    hasActiveItem: boolean
}

type RoutineDayCardProps = {
    sessionDate: IsoDate
}

async function loadCard(sessionDate: IsoDate): Promise<LoadedCard> {
    const [data, signals, categories] = await Promise.all([
        loadRoutineDataForDate(sessionDate),
        fetchDaySignals(sessionDate),
        listRoutineCategories(),
    ])
    const loaded: LoadedCard = {
        model: buildRoutineDayCardModel(sessionDate, data, signals),
        categories,
        hasActiveItem: !shouldShowRoutineOnboarding(data.items, false),
    }

    return loaded
}

async function markRow(row: RoutineRow, date: IsoDate): Promise<void> {
    if (row.source === 'task' && row.taskId) {
        await markRoutineTaskDone(row.taskId, date)
        return
    }
    if (row.routineItemId) {
        await markRoutineItemDone(row.routineItemId, date)
    }
}

export function RoutineDayCard({ sessionDate }: RoutineDayCardProps) {
    const { goToTab } = useAppNavigation()
    const { setSelectedDate } = useSelectedDate()
    const { refreshDayStatus } = useDayStatus()
    const { routineSoundEnabled } = useProfile()
    const [card, setCard] = useState<LoadedCard | null>(null)
    const [hasLoadFailed, setHasLoadFailed] = useState(false)
    const [busyRowId, setBusyRowId] = useState<string | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [celebrationKey, setCelebrationKey] = useState(0)
    const requestRef = useRef(0)

    // Só a resposta mais recente entra no card: uma leitura lenta, de antes
    // de uma marcação, não desfaz a marcação na tela.
    async function refreshCard(): Promise<LoadedCard> {
        const requestId = requestRef.current + 1
        requestRef.current = requestId
        const loaded = await loadCard(sessionDate)
        if (requestRef.current === requestId) {
            setCard(loaded)
        }

        return loaded
    }

    useEffect(() => {
        setHasLoadFailed(false)
        refreshCard().catch(() => setHasLoadFailed(true))
        return () => {
            requestRef.current += 1
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionDate])

    function goToRoutine() {
        setSelectedDate(sessionDate)
        goToTab('rotina')
    }

    function celebrateIfComplete(previous: RoutineDayCardModel, next: RoutineDayCardModel) {
        if (!shouldCelebrate(previous.progress, next.progress)) {
            return
        }
        setCelebrationKey((key) => key + 1)
        if (routineSoundEnabled) {
            playCelebration()
        }
    }

    // O iPhone só libera o áudio dentro do gesto, então o desbloqueio vem
    // antes de qualquer espera da gravação.
    async function handleMark(row: RoutineRow, previous: RoutineDayCardModel) {
        unlockAudio()
        setErrorMessage(null)
        setBusyRowId(row.id)
        try {
            await markRow(row, sessionDate)
        } catch {
            setErrorMessage(OFFLINE_MESSAGE)
            setBusyRowId(null)
            return
        }
        try {
            const loaded = await refreshCard()
            celebrateIfComplete(previous, loaded.model)
        } catch {
            // A marcação já foi gravada: o card só fica com o valor anterior.
        }
        refreshDayStatus()
        setBusyRowId(null)
    }

    function handleRowTap(row: RoutineRow, previous: RoutineDayCardModel) {
        if (row.source === 'linked' && row.linkKind) {
            goToTab(ROUTINE_LINK_KIND_TARGET_TAB[row.linkKind])
            return
        }
        void handleMark(row, previous)
    }

    if (hasLoadFailed || !card) {
        return null
    }

    if (!card.hasActiveItem) {
        return (
            <div className="card routine-day-card">
                <p className="routine-day-card__title">Monte sua rotina em poucos toques</p>
                <button type="button" className="primary-button routine-day-card__setup" onClick={goToRoutine}>
                    Montar rotina
                </button>
            </div>
        )
    }

    const { model, categories } = card
    const hasPending = model.pending.length > 0
    const title = model.hasWorkoutItem ? 'Academia marcada na rotina' : 'Sua rotina de hoje'

    return (
        <div className="card routine-day-card">
            <div className="routine-day-card__header">
                <ProgressRing
                    size={RING_SIZE}
                    strokeWidth={RING_STROKE}
                    done={model.progress.done}
                    total={model.progress.total}
                    centerLabel={`${model.progress.done}/${model.progress.total}`}
                    ariaLabel={`${model.progress.done} de ${model.progress.total} da rotina de hoje feitos`}
                    celebrationKey={celebrationKey}
                />
                <div className="routine-day-card__heading">
                    <p className="routine-day-card__title">{title}</p>
                    <p className="routine-day-card__subtitle">
                        {hasPending ? 'Aproveita e resolve mais alguma?' : 'Tudo feito hoje'}
                    </p>
                </div>
            </div>
            {hasPending && (
                <ul className="routine-day-card__list">
                    {model.pending.map((row) => (
                        <DayCardRow
                            key={row.id}
                            row={row}
                            category={findCategory(categories, row.categoryId)}
                            isBusy={busyRowId === row.id}
                            onTap={() => handleRowTap(row, model)}
                        />
                    ))}
                </ul>
            )}
            {errorMessage && (
                <p className="save-status save-status--error" role="alert">
                    {errorMessage}
                </p>
            )}
            <button type="button" className="routine-day-card__link" onClick={goToRoutine}>
                Ver a rotina inteira
                <ChevronRight size={LINK_ICON_SIZE} aria-hidden="true" />
            </button>
        </div>
    )
}

type DayCardRowProps = {
    row: RoutineRow
    category: RoutineCategoryRow | null
    isBusy: boolean
    onTap: () => void
}

function DayCardRow({ row, category, isBusy, onTap }: DayCardRowProps) {
    const isLinked = row.source === 'linked'

    return (
        <li className="routine-row">
            <button type="button" className="routine-row__toggle" disabled={isBusy} onClick={onTap}>
                <span className={isBusy ? 'routine-row__check routine-row__check--done' : 'routine-row__check'} aria-hidden="true">
                    {isBusy && <Check size={CHECK_ICON_SIZE} strokeWidth={CHECK_ICON_STROKE} />}
                </span>
                <span className="routine-row__title">{row.title}</span>
                {isLinked && <ChevronRight size={LINK_ICON_SIZE} aria-hidden="true" />}
            </button>
            {category && (
                <p className="routine-row__meta">
                    <span className="routine-row__meta-item">
                        <CategoryDot color={category.color} />
                        {category.name}
                    </span>
                </p>
            )}
        </li>
    )
}
