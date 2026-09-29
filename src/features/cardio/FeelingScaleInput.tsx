import { FEELING_SCALE_OPTIONS } from '@/features/cardio/types'

type FeelingScaleInputProps = {
    value: number | null
    onChange: (value: number) => void
}

export function FeelingScaleInput({ value, onChange }: FeelingScaleInputProps) {
    return (
        <div className="feeling-scale">
            {FEELING_SCALE_OPTIONS.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    className={feelingOptionClass(value === option.value)}
                    onClick={() => onChange(option.value)}
                    aria-label={option.label}
                    aria-pressed={value === option.value}
                >
                    <span className="feeling-scale__value" aria-hidden="true">
                        {option.value}
                    </span>
                    <span className="feeling-scale__label" aria-hidden="true">
                        {option.label}
                    </span>
                </button>
            ))}
        </div>
    )
}

function feelingOptionClass(isSelected: boolean): string {
    const className = isSelected ? 'feeling-scale__option feeling-scale__option--selected' : 'feeling-scale__option'

    return className
}
