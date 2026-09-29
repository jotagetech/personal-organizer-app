import { Copy, CornerDownRight, Plus, Timer, Trash2 } from 'lucide-react'

import { BuilderRangeField } from '@/features/workout/builder/BuilderRangeField'
import { builderFieldId } from '@/features/workout/builder/builderValidation'
import {
    copySet,
    createDrop,
    createSet,
    emptyRange,
    insertAfter,
    removeAt,
    replaceAt,
    SET_METRIC_OPTIONS,
} from '@/features/workout/builder/builderState'
import type { BuilderDrop, BuilderRange, BuilderSet } from '@/features/workout/builder/builderTypes'
import type { SetMetric } from '@/lib/workoutPlanSchema'

const ACTION_ICON_SIZE = 18

type FieldPath = (string | number)[]

type BuilderSetListProps = {
    fieldPath: FieldPath
    sets: BuilderSet[]
    onChange: (sets: BuilderSet[]) => void
}

function metricUnit(metric: SetMetric): string {
    const option = SET_METRIC_OPTIONS.find((candidate) => candidate.value === metric)
    const unit = option?.unidade ?? ''

    return unit
}

export function BuilderSetList({ fieldPath, sets, onChange }: BuilderSetListProps) {
    const seriesPath = [...fieldPath, 'series']

    // "Adicionar série" repete a última: o caso comum é várias séries iguais.
    function addSet() {
        const lastSet = sets[sets.length - 1]
        const newSet = lastSet ? copySet(lastSet) : createSet()
        onChange([...sets, newSet])
    }

    return (
        <div className="builder-sets" id={builderFieldId(seriesPath)}>
            {sets.map((set, index) => (
                <BuilderSetRow
                    key={set.uid}
                    fieldPath={[...seriesPath, index]}
                    position={index + 1}
                    set={set}
                    canRemove={sets.length > 1}
                    onChange={(nextSet) => onChange(replaceAt(sets, index, nextSet))}
                    onDuplicate={() => onChange(insertAfter(sets, index, copySet(set)))}
                    onRemove={() => onChange(removeAt(sets, index))}
                />
            ))}
            <button type="button" className="secondary-button full-width" onClick={addSet}>
                <Plus size={ACTION_ICON_SIZE} aria-hidden="true" />
                Adicionar série
            </button>
        </div>
    )
}

type BuilderSetRowProps = {
    fieldPath: FieldPath
    position: number
    set: BuilderSet
    canRemove: boolean
    onChange: (set: BuilderSet) => void
    onDuplicate: () => void
    onRemove: () => void
}

function BuilderSetRow({ fieldPath, position, set, canRemove, onChange, onDuplicate, onRemove }: BuilderSetRowProps) {
    const unit = metricUnit(set.metrica)
    const metricId = builderFieldId([...fieldPath, 'metrica'])
    const loadId = builderFieldId([...fieldPath, 'carga_sugerida'])
    const dropsPath = [...fieldPath, 'quedas']

    function updateDrop(index: number, drop: BuilderDrop) {
        onChange({ ...set, quedas: replaceAt(set.quedas, index, drop) })
    }

    return (
        <div className="builder-set" id={builderFieldId(fieldPath)}>
            <div className="builder-set__header">
                <span className="builder-set__title">Série {position}</span>
                <select
                    id={metricId}
                    className="builder-set__metric"
                    aria-label={`Métrica da série ${position}`}
                    value={set.metrica}
                    onChange={(event) => onChange({ ...set, metrica: event.target.value as SetMetric })}
                >
                    {SET_METRIC_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>
            <div className="builder-set__fields">
                <BuilderRangeField
                    id={builderFieldId([...fieldPath, 'alvo'])}
                    label="Alvo"
                    unit={unit}
                    inputMode={set.metrica === 'distancia' ? 'decimal' : 'numeric'}
                    range={set.alvo}
                    onChange={(alvo) => onChange({ ...set, alvo })}
                />
                <div className="field builder-set__load">
                    <label htmlFor={loadId}>Carga sugerida (kg)</label>
                    <input
                        id={loadId}
                        type="text"
                        inputMode="decimal"
                        placeholder="opcional"
                        value={set.carga}
                        onChange={(event) => onChange({ ...set, carga: event.target.value })}
                    />
                </div>
            </div>
            {set.descanso && (
                <BuilderSetRest
                    fieldPath={fieldPath}
                    position={position}
                    range={set.descanso}
                    onChange={(descanso) => onChange({ ...set, descanso })}
                    onRemove={() => onChange({ ...set, descanso: null })}
                />
            )}
            {set.quedas.length > 0 && (
                <div className="builder-drops" id={builderFieldId(dropsPath)}>
                    {set.quedas.map((drop, dropIndex) => (
                        <BuilderDropRow
                            key={drop.uid}
                            fieldPath={[...dropsPath, dropIndex]}
                            position={dropIndex + 1}
                            unit={unit}
                            drop={drop}
                            onChange={(nextDrop) => updateDrop(dropIndex, nextDrop)}
                            onRemove={() => onChange({ ...set, quedas: removeAt(set.quedas, dropIndex) })}
                        />
                    ))}
                </div>
            )}
            <div className="builder-row-actions">
                <button type="button" className="ghost-button" onClick={onDuplicate}>
                    <Copy size={ACTION_ICON_SIZE} aria-hidden="true" />
                    Duplicar
                </button>
                <button
                    type="button"
                    className="ghost-button"
                    onClick={() => onChange({ ...set, quedas: [...set.quedas, createDrop()] })}
                >
                    <CornerDownRight size={ACTION_ICON_SIZE} aria-hidden="true" />
                    {set.quedas.length > 0 ? 'Mais uma queda' : 'Drop set'}
                </button>
                {!set.descanso && (
                    <button
                        type="button"
                        className="ghost-button"
                        onClick={() => onChange({ ...set, descanso: emptyRange(true) })}
                    >
                        <Timer size={ACTION_ICON_SIZE} aria-hidden="true" />
                        Descanso próprio
                    </button>
                )}
                {canRemove && (
                    <button type="button" className="ghost-button builder-danger" onClick={onRemove}>
                        <Trash2 size={ACTION_ICON_SIZE} aria-hidden="true" />
                        Remover
                    </button>
                )}
            </div>
        </div>
    )
}

type BuilderSetRestProps = {
    fieldPath: FieldPath
    position: number
    range: BuilderRange
    onChange: (range: BuilderRange) => void
    onRemove: () => void
}

// Fica escondido até ser pedido: a maioria das séries usa o descanso do
// exercício (ou o padrão do plano), e o campo sempre à mostra só poluiria.
function BuilderSetRest({ fieldPath, position, range, onChange, onRemove }: BuilderSetRestProps) {
    return (
        <div className="builder-set-rest">
            <div className="builder-set__header">
                <span className="builder-drop__title">
                    <Timer size={ACTION_ICON_SIZE} aria-hidden="true" />
                    Descanso depois desta série
                </span>
                <button
                    type="button"
                    className="icon-button builder-danger"
                    aria-label={`Remover descanso próprio da série ${position}`}
                    onClick={onRemove}
                >
                    <Trash2 size={ACTION_ICON_SIZE} aria-hidden="true" />
                </button>
            </div>
            <BuilderRangeField
                id={builderFieldId([...fieldPath, 'descanso'])}
                label="Descanso"
                unit="s"
                range={range}
                onChange={onChange}
                hint="Vence o descanso do exercício só nesta série."
            />
        </div>
    )
}

type BuilderDropRowProps = {
    fieldPath: FieldPath
    position: number
    unit: string
    drop: BuilderDrop
    onChange: (drop: BuilderDrop) => void
    onRemove: () => void
}

function BuilderDropRow({ fieldPath, position, unit, drop, onChange, onRemove }: BuilderDropRowProps) {
    const loadId = builderFieldId([...fieldPath, 'carga_sugerida'])

    return (
        <div className="builder-drop" id={builderFieldId(fieldPath)}>
            <div className="builder-set__header">
                <span className="builder-drop__title">
                    <CornerDownRight size={ACTION_ICON_SIZE} aria-hidden="true" />
                    Queda {position}
                </span>
                <button
                    type="button"
                    className="icon-button builder-danger"
                    aria-label={`Remover queda ${position}`}
                    onClick={onRemove}
                >
                    <Trash2 size={ACTION_ICON_SIZE} aria-hidden="true" />
                </button>
            </div>
            <div className="builder-set__fields">
                <BuilderRangeField
                    id={builderFieldId([...fieldPath, 'alvo'])}
                    label="Alvo"
                    unit={unit}
                    range={drop.alvo}
                    onChange={(alvo) => onChange({ ...drop, alvo })}
                />
                <div className="field builder-set__load">
                    <label htmlFor={loadId}>Carga (kg)</label>
                    <input
                        id={loadId}
                        type="text"
                        inputMode="decimal"
                        placeholder="opcional"
                        value={drop.carga}
                        onChange={(event) => onChange({ ...drop, carga: event.target.value })}
                    />
                </div>
            </div>
        </div>
    )
}
