import { categoryCssVar } from '@/features/routine/categories'

type CategoryDotProps = {
    color: string
}

// Bolinha decorativa: o nome da categoria sempre aparece escrito ao lado.
export function CategoryDot({ color }: CategoryDotProps) {
    return <span className="category-dot" style={{ backgroundColor: `var(${categoryCssVar(color)})` }} aria-hidden="true" />
}
