import { CalendarRange, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'

import { BuilderPrescriptionFields } from '@/features/workout/builder/BuilderPrescriptionFields'
import { builderFieldId } from '@/features/workout/builder/builderValidation'
import {
    createVariation,
    removeAt,
    replaceAt,
    toggleWeek,
    weeksUsedByOtherVariations,
} from '@/features/workout/builder/builderState'
import type { BuilderExercise, BuilderVariation } from '@/features/workout/builder/builderTypes'

const ACTION_ICON_SIZE = 18

type BuilderVariationsProps = {
    fieldPath: (string | number)[]
    exercise: BuilderExercise
    blockWeeks: number | null
    isExpanded: (uid: string) => boolean
    onToggleExpanded: (uid: string) => void
    onChange: (variations: BuilderVariation[]) => void
}

function variationTitle(variation: BuilderVariation): string {
    if (variation.semanas.length === 0) {
        return 'Semana diferente (escolha a semana)'
    }
    const plural = variation.semanas.length > 1 ? 'Semanas' : 'Semana'
    const title = `${plural} ${variation.semanas.join(', ')}`

    return title
}

// Semanas fora do bloco continuam na lista enquanto marcadas, para dar para
// desmarcar depois de diminuir o bloco.
function selectableWeeks(variation: BuilderVariation, blockWeeks: number): number[] {
    const blockWeekList = Array.from({ length: blockWeeks }, (_, index) => index + 1)
    const outsideWeeks = variation.semanas.filter((week) => week > blockWeeks)
    const weeks = [...blockWeekList, ...outsideWeeks]

    return weeks
}

export function BuilderVariations({
    fieldPath,
    exercise,
    blockWeeks,
    isExpanded,
    onToggleExpanded,
    onChange,
}: BuilderVariationsProps) {
    const variationsPath = [...fieldPath, 'variacoes_semana']

    function addVariation() {
        if (blockWeeks === null) {
            return
        }
        const variation = createVariation(exercise, blockWeeks)
        onChange([...exercise.variacoes, variation])
        if (!isExpanded(variation.uid)) {
            onToggleExpanded(variation.uid)
        }
    }

    return (
        <div className="builder-variations" id={builderFieldId(variationsPath)}>
            <h4 className="builder-subtitle">Progressão por semana</h4>
            {blockWeeks === null ? (
                <p className="builder-hint">Informe as semanas do bloco, no topo do plano, para mudar semanas.</p>
            ) : (
                <p className="builder-hint">
                    Semanas sem variação usam a prescrição acima. A variação começa como cópia dela.
                </p>
            )}
            {exercise.variacoes.map((variation, index) => {
                const variationPath = [...variationsPath, index]
                const expanded = isExpanded(variation.uid)
                const usedWeeks = weeksUsedByOtherVariations(exercise, variation.uid)

                return (
                    <div key={variation.uid} className="builder-variation" id={builderFieldId(variationPath)}>
                        <button
                            type="button"
                            className="builder-collapse"
                            aria-expanded={expanded}
                            onClick={() => onToggleExpanded(variation.uid)}
                        >
                            <CalendarRange size={ACTION_ICON_SIZE} aria-hidden="true" />
                            <span className="builder-collapse__title">{variationTitle(variation)}</span>
                            {expanded ? (
                                <ChevronUp size={ACTION_ICON_SIZE} aria-hidden="true" />
                            ) : (
                                <ChevronDown size={ACTION_ICON_SIZE} aria-hidden="true" />
                            )}
                        </button>
                        {expanded && (
                            <div className="builder-variation__body">
                                {blockWeeks !== null && (
                                    <div className="field">
                                        <span className="builder-range__label">Vale nas semanas</span>
                                        <div
                                            className="builder-week-chips"
                                            id={builderFieldId([...variationPath, 'semanas'])}
                                        >
                                            {selectableWeeks(variation, blockWeeks).map((week) => (
                                                <button
                                                    key={week}
                                                    type="button"
                                                    className={weekChipClassName(variation.semanas.includes(week))}
                                                    aria-pressed={variation.semanas.includes(week)}
                                                    disabled={usedWeeks.has(week)}
                                                    onClick={() =>
                                                        onChange(
                                                            replaceAt(exercise.variacoes, index, {
                                                                ...variation,
                                                                semanas: toggleWeek(variation.semanas, week),
                                                            }),
                                                        )
                                                    }
                                                >
                                                    {week}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <BuilderPrescriptionFields
                                    fieldPath={variationPath}
                                    tipo={exercise.tipo}
                                    prescription={variation}
                                    onChange={(changes) =>
                                        onChange(replaceAt(exercise.variacoes, index, { ...variation, ...changes }))
                                    }
                                />
                                <button
                                    type="button"
                                    className="ghost-button builder-danger"
                                    onClick={() => onChange(removeAt(exercise.variacoes, index))}
                                >
                                    <Trash2 size={ACTION_ICON_SIZE} aria-hidden="true" />
                                    Remover variação
                                </button>
                            </div>
                        )}
                    </div>
                )
            })}
            <button
                type="button"
                className="secondary-button full-width"
                disabled={blockWeeks === null}
                onClick={addVariation}
            >
                <CalendarRange size={ACTION_ICON_SIZE} aria-hidden="true" />
                Semana diferente
            </button>
        </div>
    )
}

function weekChipClassName(isSelected: boolean): string {
    const className = isSelected ? 'weekday-chip weekday-chip--selected' : 'weekday-chip'

    return className
}
