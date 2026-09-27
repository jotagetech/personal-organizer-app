import { FEELING_SCALE_OPTIONS } from '@/features/cardio/types'

type FeelingScaleInputProps = {
    value: number | null
    onChange: (value: number) => void
}

export function FeelingScaleInput({ value, onChange }: FeelingScaleInputProps) {
    return (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
            {FEELING_SCALE_OPTIONS.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    className={value === option.value ? 'primary-button' : 'secondary-button'}
                    style={{ flex: 1, fontSize: 22, minHeight: 48, padding: 0 }}
                    onClick={() => onChange(option.value)}
                    aria-label={option.label}
                    aria-pressed={value === option.value}
                >
                    {option.emoji}
                </button>
            ))}
        </div>
    )
}
