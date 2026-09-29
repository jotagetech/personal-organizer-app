import { setRangeFixed, setRangeValue } from '@/features/workout/builder/builderState'
import type { BuilderRange } from '@/features/workout/builder/builderTypes'

type BuilderRangeFieldProps = {
    id: string
    label: string
    unit: string
    range: BuilderRange
    onChange: (range: BuilderRange) => void
    inputMode?: 'numeric' | 'decimal'
    hint?: string
}

export function BuilderRangeField({
    id,
    label,
    unit,
    range,
    onChange,
    inputMode = 'numeric',
    hint,
}: BuilderRangeFieldProps) {
    const labelId = `${id}-rotulo`

    return (
        <div className="field builder-range" id={id} role="group" aria-labelledby={labelId}>
            <div className="builder-range__header">
                <span className="builder-range__label" id={labelId}>
                    {label} <span className="text-muted">({unit})</span>
                </span>
                <div className="builder-segmented builder-segmented--small" role="group" aria-label={`Modo de ${label}`}>
                    <button
                        type="button"
                        className={segmentClassName(range.fixo)}
                        aria-pressed={range.fixo}
                        onClick={() => onChange(setRangeFixed(range, true))}
                    >
                        Fixo
                    </button>
                    <button
                        type="button"
                        className={segmentClassName(!range.fixo)}
                        aria-pressed={!range.fixo}
                        onClick={() => onChange(setRangeFixed(range, false))}
                    >
                        Faixa
                    </button>
                </div>
            </div>
            {range.fixo ? (
                <input
                    type="text"
                    inputMode={inputMode}
                    aria-label={`${label} (${unit})`}
                    value={range.min}
                    onChange={(event) => onChange(setRangeValue(range, 'min', event.target.value))}
                />
            ) : (
                <div className="builder-range__pair">
                    <input
                        type="text"
                        inputMode={inputMode}
                        aria-label={`${label} mínimo (${unit})`}
                        placeholder="mín."
                        value={range.min}
                        onChange={(event) => onChange(setRangeValue(range, 'min', event.target.value))}
                    />
                    <span className="builder-range__separator" aria-hidden="true">
                        a
                    </span>
                    <input
                        type="text"
                        inputMode={inputMode}
                        aria-label={`${label} máximo (${unit})`}
                        placeholder="máx."
                        value={range.max}
                        onChange={(event) => onChange(setRangeValue(range, 'max', event.target.value))}
                    />
                </div>
            )}
            {hint && <span className="builder-hint">{hint}</span>}
        </div>
    )
}

export function segmentClassName(isSelected: boolean): string {
    const className = isSelected ? 'builder-segmented__option builder-segmented__option--selected' : 'builder-segmented__option'

    return className
}
