import { Pencil } from 'lucide-react'
import { useId, type ReactNode } from 'react'

import type { WorkoutExerciseSummary, WorkoutSetSummary } from '@/features/results/daySummary'
import { correctionShapeOf, type SetCorrectionFields, type SetCorrectionShape } from '@/features/results/setCorrection'
import { useSetCorrection, type SetCorrectionState } from '@/features/results/useSetCorrection'
import { loadFieldLabel, resultFieldLabel, resultFieldPlaceholder } from '@/features/workout/setPresentation'
import type { WorkoutSetRow } from '@/features/workout/types'
import { MAX_RIR } from '@/lib/workoutPlanSchema'

const EDIT_ICON_SIZE = 16

// Onde a correção grava e quem fica sabendo dela. Só existe para treino
// finalizado; sem ele o resumo fica só para leitura.
export type SetCorrectionTarget = {
    sessionDate: string
    onSetCorrected: (row: WorkoutSetRow) => void
}

type SetCorrectionItemProps = {
    set: WorkoutSetSummary
    exercise: WorkoutExerciseSummary
    target: SetCorrectionTarget
    children: ReactNode
}

export function SetCorrectionItem({ set, exercise, target, children }: SetCorrectionItemProps) {
    const shape = correctionShapeOf(set, exercise.loadConvention)
    const correction = useSetCorrection({
        set,
        shape,
        sessionDate: target.sessionDate,
        onCorrected: target.onSetCorrected,
    })

    if (correction.isOpen) {
        return (
            <li className="day-workout__set day-workout__set--correcting">
                <SetCorrectionForm set={set} exercise={exercise} shape={shape} correction={correction} />
            </li>
        )
    }

    return (
        <li className="day-workout__set day-workout__set--correctable">
            {children}
            <button
                type="button"
                className="icon-button day-workout__set-edit"
                aria-label={`Corrigir série ${set.setIndex}`}
                onClick={correction.open}
            >
                <Pencil size={EDIT_ICON_SIZE} aria-hidden="true" />
            </button>
            {correction.noticeMessage && (
                <p className="save-status save-status--error day-workout__set-notice">{correction.noticeMessage}</p>
            )}
        </li>
    )
}

type SetCorrectionFormProps = {
    set: WorkoutSetSummary
    exercise: WorkoutExerciseSummary
    shape: SetCorrectionShape
    correction: SetCorrectionState
}

function SetCorrectionForm({ set, exercise, shape, correction }: SetCorrectionFormProps) {
    const fieldIdPrefix = useId()
    const { fields, validation, noticeMessage, isSaving } = correction

    function fieldProps(fieldName: keyof SetCorrectionFields) {
        return {
            id: `${fieldIdPrefix}-${fieldName}`,
            value: fields[fieldName],
            disabled: isSaving,
            onChange: (value: string) => correction.changeField(fieldName, value),
        }
    }

    return (
        <div className="set-correction">
            <p className="set-correction__title">Corrigir série {set.setIndex}</p>
            <div className="set-correction__fields">
                {shape.hasLoadField && (
                    <CorrectionInput
                        {...fieldProps('loadText')}
                        label={`${loadFieldLabel(exercise.loadConvention, exercise.equipment)} (kg)`}
                        inputMode="decimal"
                    />
                )}
                <CorrectionInput
                    {...fieldProps('resultText')}
                    label={resultFieldLabel(shape.metric)}
                    inputMode={shape.metric === 'distancia' ? 'decimal' : 'numeric'}
                    placeholder={resultFieldPlaceholder(shape.metric)}
                />
                <CorrectionInput {...fieldProps('rirText')} label="RIR" inputMode="numeric" placeholder={`0-${MAX_RIR}`} />
            </div>
            {shape.hasNoteField && (
                <div className="field set-correction__note">
                    <label htmlFor={`${fieldIdPrefix}-noteText`}>Comentário</label>
                    <textarea
                        id={`${fieldIdPrefix}-noteText`}
                        rows={2}
                        value={fields.noteText}
                        disabled={isSaving}
                        onChange={(event) => correction.changeField('noteText', event.target.value)}
                    />
                </div>
            )}
            {!validation.isValid && <p className="save-status save-status--error">{validation.errorMessage}</p>}
            {noticeMessage && <p className="save-status save-status--error">{noticeMessage}</p>}
            <div className="form-actions">
                <button
                    type="button"
                    className="primary-button"
                    disabled={!validation.isValid || isSaving}
                    onClick={() => void correction.save()}
                >
                    {isSaving ? 'Salvando...' : 'Salvar'}
                </button>
                <button type="button" className="secondary-button" disabled={isSaving} onClick={correction.cancel}>
                    Cancelar
                </button>
            </div>
        </div>
    )
}

type CorrectionInputProps = {
    id: string
    label: string
    value: string
    disabled: boolean
    inputMode: 'decimal' | 'numeric'
    placeholder?: string
    onChange: (value: string) => void
}

function CorrectionInput({ id, label, value, disabled, inputMode, placeholder, onChange }: CorrectionInputProps) {
    return (
        <div className="field set-correction__field">
            <label htmlFor={id}>{label}</label>
            <input
                id={id}
                type="text"
                inputMode={inputMode}
                value={value}
                disabled={disabled}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
            />
        </div>
    )
}
