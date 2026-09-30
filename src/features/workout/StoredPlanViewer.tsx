import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'

import { getStoredPlan, type StoredPlanDetail } from '@/features/workout/api'
import { GroupBox } from '@/features/workout/GroupBlocks'
import {
    exerciseTagsText,
    formatBlockWeeks,
    formatWorkoutWeekdays,
    groupPositionOf,
    groupWorkoutExercises,
    planExerciseLines,
    weekVariationNote,
    type GroupPosition,
} from '@/features/workout/planViewText'
import { formatPlanImportedAt, storedPlanDisplayName, type StoredPlanEntry } from '@/features/workout/storedPlans'
import type { Exercise, Workout, WorkoutPlan } from '@/lib/workoutPlanSchema'

const BACK_ICON_SIZE = 18

type StoredPlanViewerProps = {
    entry: StoredPlanEntry
    onBack: () => void
}

export function StoredPlanViewer({ entry, onBack }: StoredPlanViewerProps) {
    const [detail, setDetail] = useState<StoredPlanDetail | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    useEffect(() => {
        let isCurrent = true
        getStoredPlan(entry.id)
            .then((loaded) => {
                if (isCurrent) {
                    setDetail(loaded)
                }
            })
            .catch((loadError: unknown) => {
                if (isCurrent) {
                    setErrorMessage(loadError instanceof Error ? loadError.message : 'Falha ao carregar o plano')
                }
            })
        return () => {
            isCurrent = false
        }
    }, [entry.id])

    return (
        <div className="plan-view">
            <div className="page-header">
                <h2 className="page-title">{storedPlanDisplayName(entry)}</h2>
                <button type="button" className="secondary-button" onClick={onBack}>
                    <ArrowLeft size={BACK_ICON_SIZE} aria-hidden="true" />
                    Voltar
                </button>
            </div>
            <p className="text-small text-secondary plan-view__meta">
                Importado em {formatPlanImportedAt(entry.importedAt)}
                {entry.isActive && ' · plano ativo'}
            </p>
            {errorMessage && <div className="error-list">{errorMessage}</div>}
            {detail === null && !errorMessage && <p className="text-muted">Carregando plano...</p>}
            {detail && <PlanContent plan={detail.plan} />}
        </div>
    )
}

function PlanContent({ plan }: { plan: WorkoutPlan }) {
    const blockText = formatBlockWeeks(plan.bloco_semanas)
    const hasWeeks = plan.semanas.length > 0

    return (
        <>
            {(blockText || hasWeeks) && (
                <section className="card plan-view__block">
                    {blockText && <h3 className="plan-view__heading">{blockText}</h3>}
                    {hasWeeks && (
                        <ul className="plan-view__weeks">
                            {plan.semanas.map((week) => (
                                <li key={week.semana} className="plan-view__week">
                                    <span className="plan-view__week-label">Semana {week.semana}</span>
                                    <span>{week.descricao}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
            {plan.treinos.map((workout) => (
                <WorkoutCard key={workout.id} workout={workout} plan={plan} />
            ))}
        </>
    )
}

function WorkoutCard({ workout, plan }: { workout: Workout; plan: WorkoutPlan }) {
    const weekdaysText = formatWorkoutWeekdays(workout.dias_semana)

    return (
        <section className="card plan-view__workout">
            <div className="plan-view__workout-header">
                <h3 className="plan-view__heading">{workout.nome}</h3>
                {weekdaysText && <span className="text-small text-secondary">{weekdaysText}</span>}
            </div>
            {groupWorkoutExercises(workout.exercicios).map((block) => {
                const details = block.exercises.map((exercise, memberIndex) => (
                    <ExerciseDetail
                        key={exercise.id}
                        exercise={exercise}
                        plan={plan}
                        group={groupPositionOf(block, memberIndex)}
                    />
                ))
                if (block.groupLabel === null) {
                    return details
                }

                return (
                    <GroupBox key={block.exercises[0].id} label={block.groupLabel}>
                        {details}
                    </GroupBox>
                )
            })}
        </section>
    )
}

type ExerciseDetailProps = { exercise: Exercise; plan: WorkoutPlan; group: GroupPosition | null }

function ExerciseDetail({ exercise, plan, group }: ExerciseDetailProps) {
    const tags = exerciseTagsText(exercise)
    const variationNote = weekVariationNote(exercise)

    return (
        <div className="day-workout__exercise">
            <p className="day-workout__exercise-name">
                {exercise.nome}
                {exercise.intervalado && ` · ${exercise.intervalado.modalidade}`}
            </p>
            {tags.length > 0 && <p className="plan-view__tags">{tags.join(' · ')}</p>}
            <ul className="day-workout__sets">
                {planExerciseLines(exercise, plan, group).map((line) => (
                    <li key={line.label} className="day-workout__set">
                        <span className="day-workout__set-label">{line.label}</span>
                        <div className="day-workout__set-body">
                            <span className="day-workout__set-value">{line.value}</span>
                            {line.drops.map((drop, dropIndex) => (
                                <span key={`${line.label}-drop-${dropIndex}`} className="day-workout__set-drop">
                                    {drop}
                                </span>
                            ))}
                            {line.details.length > 0 && (
                                <span className="day-workout__set-drop">{line.details.join(' · ')}</span>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
            {variationNote && <p className="plan-view__note">{variationNote}</p>}
            {exercise.observacoes && <p className="plan-view__note">{exercise.observacoes}</p>}
        </div>
    )
}
