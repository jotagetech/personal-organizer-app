import { formatDropResult, formatSetResult } from '@/features/results/setResultText'
import type { WorkoutExerciseSummary, WorkoutSetSummary, WorkoutSummary } from '@/features/results/daySummary'
import { formatIntervalPrescription, formatIntervalResult } from '@/features/workout/intervalPresentation'
import type { SetStatus } from '@/features/workout/sessionProgress'
import type { WorkoutSnapshotInterval } from '@/features/workout/types'

type WorkoutSummaryViewProps = {
    summary: WorkoutSummary
}

export function WorkoutSummaryView({ summary }: WorkoutSummaryViewProps) {
    return (
        <>
            <div className="day-workout__exercises">
                {summary.exercises.map((exercise) => (
                    <WorkoutExerciseDetail key={exercise.exerciseKey} exercise={exercise} />
                ))}
            </div>
            {summary.orphanSets.length > 0 && (
                <p className="day-workout__orphans">
                    {summary.orphanSets.length} série(s) de um treino trocado depois, sem exercício
                    correspondente no plano atual.
                </p>
            )}
        </>
    )
}

// O intervalado vira uma linha só, com o que foi feito ("8 × 30 s / 90 s ·
// RPE 8") e, embaixo, a meta do dia; rodada por rodada fica na exportação.
type IntervalExerciseDetailProps = {
    exercise: WorkoutExerciseSummary
    interval: WorkoutSnapshotInterval
}

function IntervalExerciseDetail({ exercise, interval }: IntervalExerciseDetailProps) {
    const rounds = exercise.sets.map((set) => ({
        status: set.status,
        durationSeconds: set.durationSeconds,
        rpe: set.rpe,
    }))

    return (
        <div className="day-workout__exercise">
            <p className="day-workout__exercise-name">
                {exercise.exerciseName} · {interval.modalidade}
            </p>
            <ul className="day-workout__sets">
                <li className="day-workout__set">
                    <span className="day-workout__set-label">Feito</span>
                    <div className="day-workout__set-body">
                        <span className="day-workout__set-value">{formatIntervalResult(interval, rounds)}</span>
                        <span className="day-workout__set-drop">meta {formatIntervalPrescription(interval)}</span>
                    </div>
                </li>
            </ul>
        </div>
    )
}

function WorkoutExerciseDetail({ exercise }: { exercise: WorkoutExerciseSummary }) {
    if (exercise.interval) {
        return <IntervalExerciseDetail exercise={exercise} interval={exercise.interval} />
    }

    return (
        <div className="day-workout__exercise">
            <p className="day-workout__exercise-name">{exercise.exerciseName}</p>
            <ul className="day-workout__sets">
                {exercise.sets.map((set) => (
                    <li key={set.setIndex} className={SET_STATUS_CLASS_NAMES[set.status]}>
                        <span className="day-workout__set-label">Série {set.setIndex}</span>
                        <div className="day-workout__set-body">
                            <span className="day-workout__set-value">{formatSetSummary(set, exercise)}</span>
                            {set.status === 'completed' &&
                                set.drops.map((drop, dropPosition) => (
                                    <span key={dropPosition} className="day-workout__set-drop">
                                        {formatDropResult(exercise.loadConvention, set.metric, drop, exercise.perSide)}
                                    </span>
                                ))}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    )
}

const SET_STATUS_CLASS_NAMES: Record<SetStatus, string> = {
    completed: 'day-workout__set',
    skipped: 'day-workout__set day-workout__set--skipped',
    pending: 'day-workout__set day-workout__set--pending',
}

function formatSetSummary(set: WorkoutSetSummary, exercise: WorkoutExerciseSummary): string {
    if (set.status === 'skipped') {
        return set.note ? `pulada · ${set.note}` : 'pulada'
    }
    if (set.status === 'pending') {
        return 'não registrada'
    }

    const resultText = formatSetResult(exercise.loadConvention, set.metric, set, exercise.perSide)
    const rirText = set.rir !== null ? ` · RIR ${set.rir}` : ''
    const noteText = set.note ? ` · ${set.note}` : ''
    const setSummaryText = `${resultText}${rirText}${noteText}`

    return setSummaryText
}
