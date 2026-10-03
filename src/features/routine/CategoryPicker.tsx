import { CategoryDot } from '@/features/routine/CategoryDot'
import type { RoutineCategoryRow } from '@/features/routine/types'

type CategoryPickerProps = {
    categories: RoutineCategoryRow[]
    value: string | null
    onChange: (categoryId: string | null) => void
    onCreateCategory: () => void
}

function chipClassName(isSelected: boolean): string {
    return isSelected ? 'choice-chip choice-chip--selected' : 'choice-chip'
}

export function CategoryPicker({ categories, value, onChange, onCreateCategory }: CategoryPickerProps) {
    if (categories.length === 0) {
        return (
            <button type="button" className="category-create-link" onClick={onCreateCategory}>
                Criar categoria
            </button>
        )
    }

    return (
        <div className="choice-chip-row">
            <button type="button" className={chipClassName(value === null)} aria-pressed={value === null} onClick={() => onChange(null)}>
                Geral
            </button>
            {categories.map((category) => (
                <button
                    key={category.id}
                    type="button"
                    className={chipClassName(value === category.id)}
                    aria-pressed={value === category.id}
                    onClick={() => onChange(category.id)}
                >
                    <CategoryDot color={category.color} />
                    {category.name}
                </button>
            ))}
        </div>
    )
}
