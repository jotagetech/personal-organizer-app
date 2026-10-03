import { ALL_CATEGORIES_FILTER, type CategoryFilter as CategoryFilterValue } from '@/features/routine/categories'
import { CategoryDot } from '@/features/routine/CategoryDot'
import type { RoutineCategoryRow } from '@/features/routine/types'

type CategoryFilterProps = {
    categories: RoutineCategoryRow[]
    value: CategoryFilterValue
    onChange: (filter: CategoryFilterValue) => void
}

function chipClassName(isSelected: boolean): string {
    return isSelected ? 'choice-chip choice-chip--selected' : 'choice-chip'
}

// Só aparece com alguma categoria criada; rola na horizontal quando não cabe.
export function CategoryFilter({ categories, value, onChange }: CategoryFilterProps) {
    if (categories.length === 0) {
        return null
    }

    return (
        <div className="category-filter" role="group" aria-label="Filtrar por categoria">
            <button
                type="button"
                className={chipClassName(value === ALL_CATEGORIES_FILTER)}
                aria-pressed={value === ALL_CATEGORIES_FILTER}
                onClick={() => onChange(ALL_CATEGORIES_FILTER)}
            >
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
