import { AlertCircle, ArrowDown, ArrowUp, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { BuilderExerciseCard } from '@/features/workout/builder/BuilderExerciseCard'
import { resolveExerciseIds } from '@/features/workout/builder/builderIds'
import {
    createExercise,
    duplicateExercise,
    insertAfter,
    moveItem,
    removeAt,
    replaceAt,
} from '@/features/workout/builder/builderState'
import type { BuilderWorkout } from '@/features/workout/builder/builderTypes'
import { builderFieldId } from '@/features/workout/builder/builderValidation'
import { WEEKDAY_LABELS } from '@/lib/weekdayLabels'
import { WEEKDAYS, type Weekday } from '@/lib/workoutPlanSchema'

const ACTION_ICON_SIZE = 18
const HEADER_ICON_SIZE = 20

type BuilderWorkoutSectionProps = {
    position: number
    workout: BuilderWorkout
    isFirst: boolean
    isLast: boolean
    canRemove: boolean
    usaProgressao: boolean
    blockWeeks: number | null
    issueOwnerUids: Set<string>
    isExpanded: (uid: string) => boolean
    onToggleExpanded: (uid: string) => void
    onExpand: (uid: string) => void
    onChange: (workout: BuilderWorkout) => void
    onMove: (offset: number) => void
    onRemove: () => void
}

function workoutSummary(workout: BuilderWorkout): string {
    const exerciseCount = workout.exercicios.length
    const exercisesText = `${exerciseCount} ${exerciseCount === 1 ? 'exercício' : 'exercícios'}`
    const days = WEEKDAYS.filter((weekday) => workout.dias_semana.includes(weekday)).map(
        (weekday) => WEEKDAY_LABELS[weekday],
    )
    const summary = days.length > 0 ? `${exercisesText} · ${days.join(', ')}` : exercisesText

    return summary
}

export function BuilderWorkoutSection(props: BuilderWorkoutSectionProps) {
    const { position, workout, isExpanded, onToggleExpanded, onExpand, onChange, issueOwnerUids } = props
    const fieldPath = ['treinos', position - 1]
    const expanded = isExpanded(workout.uid)
    const exerciseIds = resolveExerciseIds(workout)
    const nameId = builderFieldId([...fieldPath, 'nome'])
    const hasIssue = issueOwnerUids.has(workout.uid)

    function toggleWeekday(weekday: Weekday) {
        const weekdays = workout.dias_semana.includes(weekday)
            ? workout.dias_semana.filter((current) => current !== weekday)
            : [...workout.dias_semana, weekday]
        onChange({ ...workout, dias_semana: weekdays })
    }

    function addExercise() {
        const exercise = createExercise()
        onChange({ ...workout, exercicios: [...workout.exercicios, exercise] })
        onExpand(exercise.uid)
    }

    function duplicateAt(index: number) {
        const copy = duplicateExercise(workout.exercicios[index])
        onChange({ ...workout, exercicios: insertAfter(workout.exercicios, index, copy) })
        onExpand(copy.uid)
    }

    return (
        <section className={hasIssue ? 'card builder-workout builder-workout--issue' : 'card builder-workout'} id={builderFieldId(fieldPath)}>
            <div className="builder-header-row">
                <button
                    type="button"
                    className="builder-collapse builder-collapse--workout"
                    aria-expanded={expanded}
                    onClick={() => onToggleExpanded(workout.uid)}
                >
                    <span className="builder-collapse__text">
                        <span className="builder-collapse__title builder-collapse__title--workout">
                            {workout.nome.trim() || `Treino ${position}`}
                        </span>
                        <span className="builder-collapse__meta">{workoutSummary(workout)}</span>
                    </span>
                    {hasIssue && <AlertCircle size={HEADER_ICON_SIZE} className="builder-issue-icon" aria-label="Com problema" />}
                    {expanded ? (
                        <ChevronUp size={HEADER_ICON_SIZE} aria-hidden="true" />
                    ) : (
                        <ChevronDown size={HEADER_ICON_SIZE} aria-hidden="true" />
                    )}
                </button>
                <button
                    type="button"
                    className="icon-button"
                    aria-label="Subir treino"
                    disabled={props.isFirst}
                    onClick={() => props.onMove(-1)}
                >
                    <ArrowUp size={ACTION_ICON_SIZE} aria-hidden="true" />
                </button>
                <button
                    type="button"
                    className="icon-button"
                    aria-label="Descer treino"
                    disabled={props.isLast}
                    onClick={() => props.onMove(1)}
                >
                    <ArrowDown size={ACTION_ICON_SIZE} aria-hidden="true" />
                </button>
            </div>
            {expanded && (
                <div className="builder-workout__body">
                    <div className="field">
                        <label htmlFor={nameId}>Nome do treino</label>
                        <input
                            id={nameId}
                            type="text"
                            placeholder="ex: A: peito e tríceps"
                            value={workout.nome}
                            onChange={(event) => onChange({ ...workout, nome: event.target.value })}
                        />
                    </div>
                    <div className="field">
                        <span className="builder-range__label">Dias da semana (opcional)</span>
                        <div className="weekday-chip-row" id={builderFieldId([...fieldPath, 'dias_semana'])}>
                            {WEEKDAYS.map((weekday) => (
                                <button
                                    key={weekday}
                                    type="button"
                                    className={
                                        workout.dias_semana.includes(weekday)
                                            ? 'weekday-chip weekday-chip--selected'
                                            : 'weekday-chip'
                                    }
                                    aria-pressed={workout.dias_semana.includes(weekday)}
                                    onClick={() => toggleWeekday(weekday)}
                                >
                                    {WEEKDAY_LABELS[weekday]}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="builder-exercises" id={builderFieldId([...fieldPath, 'exercicios'])}>
                        {workout.exercicios.length === 0 && (
                            <p className="builder-hint">Nenhum exercício ainda.</p>
                        )}
                        {workout.exercicios.map((exercise, index) => (
                            <BuilderExerciseCard
                                key={exercise.uid}
                                fieldPath={[...fieldPath, 'exercicios', index]}
                                position={index + 1}
                                exercise={exercise}
                                resolvedId={exerciseIds[index]}
                                isFirst={index === 0}
                                isLast={index === workout.exercicios.length - 1}
                                hasIssue={issueOwnerUids.has(exercise.uid)}
                                usaProgressao={props.usaProgressao}
                                blockWeeks={props.blockWeeks}
                                isExpanded={isExpanded}
                                onToggleExpanded={onToggleExpanded}
                                onChange={(nextExercise) =>
                                    onChange({ ...workout, exercicios: replaceAt(workout.exercicios, index, nextExercise) })
                                }
                                onMove={(offset) =>
                                    onChange({ ...workout, exercicios: moveItem(workout.exercicios, index, offset) })
                                }
                                onDuplicate={() => duplicateAt(index)}
                                onRemove={() => onChange({ ...workout, exercicios: removeAt(workout.exercicios, index) })}
                            />
                        ))}
                    </div>
                    <button type="button" className="secondary-button full-width" onClick={addExercise}>
                        <Plus size={ACTION_ICON_SIZE} aria-hidden="true" />
                        Adicionar exercício
                    </button>
                    {props.canRemove && <RemoveWorkoutButton onRemove={props.onRemove} />}
                </div>
            )}
        </section>
    )
}

function RemoveWorkoutButton({ onRemove }: { onRemove: () => void }) {
    const [isConfirming, setIsConfirming] = useState(false)

    if (!isConfirming) {
        return (
            <button type="button" className="ghost-button builder-danger builder-workout__remove" onClick={() => setIsConfirming(true)}>
                <Trash2 size={ACTION_ICON_SIZE} aria-hidden="true" />
                Remover treino
            </button>
        )
    }

    return (
        <div className="builder-confirm">
            <span>Remover este treino e todos os exercícios dele?</span>
            <div className="form-actions">
                <button type="button" className="secondary-button" onClick={() => setIsConfirming(false)}>
                    Cancelar
                </button>
                <button type="button" className="primary-button builder-danger-button" onClick={onRemove}>
                    Remover
                </button>
            </div>
        </div>
    )
}
