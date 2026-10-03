import { ProgressRing } from '@/features/routine/ProgressRing'
import type { RoutineProgress } from '@/features/routine/resolveRoutine'
import { shortDateLabel } from '@/features/routine/shortDateLabel'
import type { WeekDayProgress, WeekDayStatus } from '@/features/routine/weekProgress'
import { weekdayOfIsoDate, type IsoDate } from '@/lib/dateUtils'
import { WEEKDAY_LABELS } from '@/lib/weekdayLabels'

const DAY_RING_SIZE = 56
const DAY_RING_STROKE = 6
const WEEK_RING_SIZE = 30
const WEEK_RING_STROKE = 4

const MUTED_DAY_LABELS: Record<Exclude<WeekDayStatus, 'counted'>, string> = {
    future: 'Dia que ainda não chegou',
    before_start: 'Antes do início da rotina',
    empty: 'Nada previsto',
}

type RoutineProgressSummaryProps = {
    selectedDate: IsoDate
    today: IsoDate
    dayProgress: RoutineProgress | null
    week: WeekDayProgress[] | null
    celebrationKey: number
    onSelectDate: (date: IsoDate) => void
}

function weekdayInitial(date: IsoDate): string {
    return WEEKDAY_LABELS[weekdayOfIsoDate(date)].toLowerCase()
}

function dayCaption(selectedDate: IsoDate, today: IsoDate): string {
    return selectedDate === today ? 'Hoje' : shortDateLabel(selectedDate)
}

function weekRingLabel(day: WeekDayProgress): string {
    if (day.status === 'counted') {
        return `${day.done} de ${day.total} feitos`
    }

    return MUTED_DAY_LABELS[day.status]
}

// Sem o progresso do dia carregado, guarda o espaço do anel para o resumo não
// pular de altura quando o número chegar.
function DayRing({ progress, celebrationKey }: { progress: RoutineProgress | null; celebrationKey: number }) {
    if (progress === null) {
        return (
            <span
                className="routine-summary__day-placeholder"
                style={{ width: DAY_RING_SIZE, height: DAY_RING_SIZE }}
            />
        )
    }
    const hasItems = progress.total > 0
    const label = hasItems ? `${progress.done} de ${progress.total} feitos` : 'Nada previsto'

    return (
        <ProgressRing
            size={DAY_RING_SIZE}
            strokeWidth={DAY_RING_STROKE}
            done={progress.done}
            total={progress.total}
            ariaLabel={label}
            centerLabel={hasItems ? `${progress.done}/${progress.total}` : undefined}
            isMuted={!hasItems}
            celebrationKey={celebrationKey}
        />
    )
}

export function RoutineProgressSummary({
    selectedDate,
    today,
    dayProgress,
    week,
    celebrationKey,
    onSelectDate,
}: RoutineProgressSummaryProps) {
    return (
        <section className="routine-summary" aria-label="Progresso da rotina">
            <div className="routine-summary__day">
                <DayRing progress={dayProgress} celebrationKey={celebrationKey} />
                <span className="routine-summary__caption">{dayCaption(selectedDate, today)}</span>
            </div>
            {week && (
                <div className="routine-summary__week">
                    {week.map((day) => {
                        const isSelected = day.date === selectedDate
                        const className = isSelected
                            ? 'routine-summary__week-day routine-summary__week-day--selected'
                            : 'routine-summary__week-day'

                        return (
                            <button
                                key={day.date}
                                type="button"
                                className={className}
                                aria-current={isSelected ? 'date' : undefined}
                                onClick={() => onSelectDate(day.date)}
                            >
                                <ProgressRing
                                    size={WEEK_RING_SIZE}
                                    strokeWidth={WEEK_RING_STROKE}
                                    done={day.done}
                                    total={day.total}
                                    ariaLabel={weekRingLabel(day)}
                                    isMuted={day.status !== 'counted'}
                                />
                                <span className="routine-summary__week-initial">{weekdayInitial(day.date)}</span>
                            </button>
                        )
                    })}
                </div>
            )}
        </section>
    )
}
