import { AlertCircle, ArrowDown, ArrowUp, ChevronDown, ChevronUp, Copy, History, Link2, Link2Off, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { BuilderPrescriptionFields } from '@/features/workout/builder/BuilderPrescriptionFields'
import { segmentClassName } from '@/features/workout/builder/BuilderRangeField'
import { BuilderVariations } from '@/features/workout/builder/BuilderVariations'
import { exerciseIdStatus } from '@/features/workout/builder/builderIds'
import { EQUIPMENT_CHOICES, LOAD_CONVENTION_OPTIONS, suggestLoadConvention } from '@/features/workout/builder/builderState'
import type { BuilderExercise, EquipmentChoice } from '@/features/workout/builder/builderTypes'
import { builderFieldId } from '@/features/workout/builder/builderValidation'
import type { LoadConvention } from '@/lib/workoutPlanSchema'

const ACTION_ICON_SIZE = 18
const HEADER_ICON_SIZE = 20

export type BuilderExerciseCardProps = {
    fieldPath: (string | number)[]
    position: number
    exercise: BuilderExercise
    resolvedId: string
    isFirst: boolean
    isLast: boolean
    hasIssue: boolean
    usaProgressao: boolean
    blockWeeks: number | null
    canGroupWithNext: boolean
    isExpanded: (uid: string) => boolean
    onToggleExpanded: (uid: string) => void
    onChange: (exercise: BuilderExercise) => void
    onMove: (offset: number) => void
    onDuplicate: () => void
    onRemove: () => void
    onGroupWithNext: () => void
    onUngroup: () => void
}

function exerciseSummary(exercise: BuilderExercise): string {
    if (exercise.tipo === 'intervalado') {
        const modality = exercise.modalidade.trim() || 'intervalado'
        const rounds = exercise.rodadas.trim()
        const summary = rounds ? `${modality} · ${rounds} rodadas` : modality

        return summary
    }
    const setCount = exercise.series.length
    const summary = `${setCount} ${setCount === 1 ? 'série' : 'séries'}`

    return summary
}

export function BuilderExerciseCard(props: BuilderExerciseCardProps) {
    const { fieldPath, position, exercise, hasIssue, isExpanded, onToggleExpanded, onChange } = props
    const expanded = isExpanded(exercise.uid)
    const title = exercise.nome.trim() || `Exercício ${position}`

    return (
        <div
            className={hasIssue ? 'builder-exercise builder-exercise--issue' : 'builder-exercise'}
            id={builderFieldId(fieldPath)}
        >
            <div className="builder-header-row">
                <button
                    type="button"
                    className="builder-collapse builder-collapse--exercise"
                    aria-expanded={expanded}
                    onClick={() => onToggleExpanded(exercise.uid)}
                >
                    <span className="builder-collapse__text">
                        <span className="builder-collapse__title">{title}</span>
                        <span className="builder-collapse__meta">{exerciseSummary(exercise)}</span>
                    </span>
                    {hasIssue && <AlertCircle size={HEADER_ICON_SIZE} className="builder-issue-icon" aria-label="Com problema" />}
                    {expanded ? (
                        <ChevronUp size={HEADER_ICON_SIZE} aria-hidden="true" />
                    ) : (
                        <ChevronDown size={HEADER_ICON_SIZE} aria-hidden="true" />
                    )}
                </button>
                <MoveButtons {...props} />
            </div>
            {expanded && (
                <div className="builder-exercise__body">
                    <ExerciseKindSwitch exercise={exercise} onChange={onChange} />
                    <ExerciseNameField {...props} />
                    {exercise.tipo === 'intervalado' ? (
                        <IntervalIdentityFields {...props} />
                    ) : (
                        <SeriesIdentityFields {...props} />
                    )}
                    <BuilderPrescriptionFields
                        fieldPath={fieldPath}
                        tipo={exercise.tipo}
                        prescription={exercise}
                        onChange={(changes) => onChange({ ...exercise, ...changes })}
                    />
                    <ObservationsField {...props} />
                    {exercise.tipo === 'series' && <GroupActions {...props} />}
                    {props.usaProgressao && (
                        <BuilderVariations
                            fieldPath={fieldPath}
                            exercise={exercise}
                            blockWeeks={props.blockWeeks}
                            isExpanded={isExpanded}
                            onToggleExpanded={onToggleExpanded}
                            onChange={(variacoes) => onChange({ ...exercise, variacoes })}
                        />
                    )}
                    <ExerciseActions {...props} />
                </div>
            )}
        </div>
    )
}

function ExerciseKindSwitch({ exercise, onChange }: Pick<BuilderExerciseCardProps, 'exercise' | 'onChange'>) {
    return (
        <div className="builder-segmented builder-segmented--full" role="group" aria-label="Tipo de exercício">
            <button
                type="button"
                className={segmentClassName(exercise.tipo === 'series')}
                aria-pressed={exercise.tipo === 'series'}
                onClick={() => onChange({ ...exercise, tipo: 'series' })}
            >
                Séries
            </button>
            <button
                type="button"
                className={segmentClassName(exercise.tipo === 'intervalado')}
                aria-pressed={exercise.tipo === 'intervalado'}
                onClick={() => onChange({ ...exercise, tipo: 'intervalado' })}
            >
                Cardio intervalado
            </button>
        </div>
    )
}

// O id é a chave do histórico. Num exercício que já existia, renomear não
// troca o id; perder o histórico só acontece pedindo explicitamente.
function ExerciseNameField({ fieldPath, exercise, resolvedId, onChange }: BuilderExerciseCardProps) {
    const nameId = builderFieldId([...fieldPath, 'nome'])
    const status = exerciseIdStatus(exercise)

    return (
        <div className="field">
            <label htmlFor={nameId}>Nome</label>
            <input
                id={nameId}
                type="text"
                placeholder={exercise.tipo === 'intervalado' ? 'ex: Tiros na bike' : 'ex: Supino reto'}
                value={exercise.nome}
                onChange={(event) => onChange({ ...exercise, nome: event.target.value })}
            />
            <div className="builder-id-note">
                <History size={ACTION_ICON_SIZE} aria-hidden="true" />
                <span className="builder-id-note__text">
                    {status === 'mantido' && (
                        <>
                            Histórico mantido: o id continua <code>{resolvedId}</code> mesmo mudando o nome.
                        </>
                    )}
                    {status === 'renovado' && (
                        <>
                            Exercício novo, id <code>{resolvedId}</code>: o histórico de <code>{exercise.idSalvo}</code>{' '}
                            não aparece nele.
                        </>
                    )}
                    {status === 'novo' && (
                        <>
                            id <code>{resolvedId}</code>, gerado pelo nome.
                        </>
                    )}
                </span>
            </div>
            {status === 'mantido' && (
                <button
                    type="button"
                    className="ghost-button builder-id-note__action"
                    onClick={() => onChange({ ...exercise, tratarComoNovo: true })}
                >
                    Tratar como exercício novo
                </button>
            )}
            {status === 'renovado' && (
                <button
                    type="button"
                    className="ghost-button builder-id-note__action"
                    onClick={() => onChange({ ...exercise, tratarComoNovo: false })}
                >
                    Manter o histórico
                </button>
            )}
        </div>
    )
}

function SeriesIdentityFields({ fieldPath, exercise, onChange }: BuilderExerciseCardProps) {
    const equipmentId = builderFieldId([...fieldPath, 'equipamento'])
    const loadId = builderFieldId([...fieldPath, 'forma_carga'])
    const sideId = builderFieldId([...fieldPath, 'por_lado'])
    const loadOption = LOAD_CONVENTION_OPTIONS.find((option) => option.value === exercise.forma_carga)

    function changeEquipment(choice: EquipmentChoice | '') {
        const formaCarga = suggestLoadConvention(choice, exercise.forma_carga)
        onChange({ ...exercise, equipamento: choice, forma_carga: formaCarga })
    }

    return (
        <>
            <div className="field">
                <label htmlFor={equipmentId}>Equipamento</label>
                <select
                    id={equipmentId}
                    value={exercise.equipamento}
                    onChange={(event) => changeEquipment(event.target.value as EquipmentChoice | '')}
                >
                    <option value="">Não informar</option>
                    {EQUIPMENT_CHOICES.map((choice) => (
                        <option key={choice.value} value={choice.value}>
                            {choice.label}
                        </option>
                    ))}
                </select>
            </div>
            <div className="field">
                <label htmlFor={loadId}>Forma de carga</label>
                <select
                    id={loadId}
                    value={exercise.forma_carga}
                    onChange={(event) => onChange({ ...exercise, forma_carga: event.target.value as LoadConvention })}
                >
                    {LOAD_CONVENTION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                {loadOption && <span className="builder-hint">{loadOption.explicacao}</span>}
            </div>
            <label className="builder-check" htmlFor={sideId}>
                <input
                    id={sideId}
                    type="checkbox"
                    checked={exercise.por_lado}
                    onChange={(event) => onChange({ ...exercise, por_lado: event.target.checked })}
                />
                <span>
                    Unilateral (cada lado)
                    <span className="builder-hint">O alvo vale para cada perna ou braço.</span>
                </span>
            </label>
        </>
    )
}

function IntervalIdentityFields({ fieldPath, exercise, onChange }: BuilderExerciseCardProps) {
    const modalityId = builderFieldId([...fieldPath, 'modalidade'])

    return (
        <div className="field">
            <label htmlFor={modalityId}>Modalidade</label>
            <input
                id={modalityId}
                type="text"
                placeholder="ex: bike, esteira, remo"
                value={exercise.modalidade}
                onChange={(event) => onChange({ ...exercise, modalidade: event.target.value })}
            />
        </div>
    )
}

function ObservationsField({ fieldPath, exercise, onChange }: BuilderExerciseCardProps) {
    const observationsId = builderFieldId([...fieldPath, 'observacoes'])

    return (
        <div className="field">
            <label htmlFor={observationsId}>Observações</label>
            <textarea
                id={observationsId}
                rows={2}
                placeholder="opcional"
                value={exercise.observacoes}
                onChange={(event) => onChange({ ...exercise, observacoes: event.target.value })}
            />
        </div>
    )
}

// Bi-set, tri-set e circuito: o rótulo do grupo nunca aparece aqui, a tela
// só junta ou separa vizinhos (o caixa em volta dos cartões mostra o grupo).
function GroupActions({ fieldPath, exercise, canGroupWithNext, onGroupWithNext, onUngroup }: BuilderExerciseCardProps) {
    const isGrouped = exercise.grupo != null

    return (
        <div className="field builder-group-actions" id={builderFieldId([...fieldPath, 'grupo'])}>
            <span className="builder-range__label">Bi-set, tri-set ou circuito</span>
            <div className="builder-row-actions">
                <button type="button" className="ghost-button" disabled={!canGroupWithNext} onClick={onGroupWithNext}>
                    <Link2 size={ACTION_ICON_SIZE} aria-hidden="true" />
                    Agrupar com o próximo
                </button>
                {isGrouped && (
                    <button type="button" className="ghost-button" onClick={onUngroup}>
                        <Link2Off size={ACTION_ICON_SIZE} aria-hidden="true" />
                        Desagrupar
                    </button>
                )}
            </div>
            <span className="builder-hint">
                {isGrouped
                    ? 'Os exercícios do grupo alternam uma série de cada, e o descanso vem só no fim da rodada.'
                    : 'Junta este exercício com o de baixo para alternar as séries, sem descanso entre eles.'}
            </span>
        </div>
    )
}

function MoveButtons({ isFirst, isLast, onMove }: BuilderExerciseCardProps) {
    return (
        <>
            <button type="button" className="icon-button" aria-label="Subir exercício" disabled={isFirst} onClick={() => onMove(-1)}>
                <ArrowUp size={ACTION_ICON_SIZE} aria-hidden="true" />
            </button>
            <button type="button" className="icon-button" aria-label="Descer exercício" disabled={isLast} onClick={() => onMove(1)}>
                <ArrowDown size={ACTION_ICON_SIZE} aria-hidden="true" />
            </button>
        </>
    )
}

function ExerciseActions({ onDuplicate, onRemove }: BuilderExerciseCardProps) {
    const [isConfirmingRemoval, setIsConfirmingRemoval] = useState(false)

    if (isConfirmingRemoval) {
        return (
            <div className="builder-confirm">
                <span>Remover este exercício do plano?</span>
                <div className="form-actions">
                    <button type="button" className="secondary-button" onClick={() => setIsConfirmingRemoval(false)}>
                        Cancelar
                    </button>
                    <button type="button" className="primary-button builder-danger-button" onClick={onRemove}>
                        Remover
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="builder-row-actions builder-row-actions--footer">
            <button type="button" className="ghost-button" onClick={onDuplicate}>
                <Copy size={ACTION_ICON_SIZE} aria-hidden="true" />
                Duplicar
            </button>
            <button type="button" className="ghost-button builder-danger" onClick={() => setIsConfirmingRemoval(true)}>
                <Trash2 size={ACTION_ICON_SIZE} aria-hidden="true" />
                Remover
            </button>
        </div>
    )
}
