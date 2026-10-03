import type { RoutineCategoryRow, RoutineRow } from '@/features/routine/types'

export const CATEGORY_COLOR_KEYS = [
    'azul',
    'violeta',
    'magenta',
    'rosa',
    'laranja',
    'marrom',
    'oliva',
    'ardosia',
] as const
export type CategoryColorKey = (typeof CATEGORY_COLOR_KEYS)[number]

export const CATEGORY_COLORS: Record<CategoryColorKey, { label: string; cssVar: string }> = {
    azul: { label: 'Azul', cssVar: '--color-category-azul' },
    violeta: { label: 'Violeta', cssVar: '--color-category-violeta' },
    magenta: { label: 'Magenta', cssVar: '--color-category-magenta' },
    rosa: { label: 'Rosa', cssVar: '--color-category-rosa' },
    laranja: { label: 'Laranja', cssVar: '--color-category-laranja' },
    marrom: { label: 'Marrom', cssVar: '--color-category-marrom' },
    oliva: { label: 'Oliva', cssVar: '--color-category-oliva' },
    ardosia: { label: 'Ardósia', cssVar: '--color-category-ardosia' },
}

export const ALL_CATEGORIES_FILTER = 'all'
export type CategoryFilter = string

export const MAX_CATEGORY_NAME_LENGTH = 40

export function isCategoryColorKey(value: string): value is CategoryColorKey {
    return (CATEGORY_COLOR_KEYS as readonly string[]).includes(value)
}

// Uma chave desconhecida (paleta que mudou) cai na primeira cor em vez de
// deixar a bolinha sem cor.
export function categoryCssVar(color: string): string {
    const key: CategoryColorKey = isCategoryColorKey(color) ? color : CATEGORY_COLOR_KEYS[0]

    return CATEGORY_COLORS[key].cssVar
}

export function findCategory(categories: RoutineCategoryRow[], categoryId: string | null): RoutineCategoryRow | null {
    if (categoryId === null) {
        return null
    }
    const category = categories.find((candidate) => candidate.id === categoryId) ?? null

    return category
}

// Lógica pura: esconde o que não é da categoria escolhida; 'all' mantém tudo.
export function filterRowsByCategory(rows: RoutineRow[], categoryId: CategoryFilter): RoutineRow[] {
    if (categoryId === ALL_CATEGORIES_FILTER) {
        return rows
    }
    const filteredRows = rows.filter((row) => row.categoryId === categoryId)

    return filteredRows
}

export type ImportantSplit = { important: RoutineRow[]; rest: RoutineRow[] }

// Lógica pura: separa os importantes do resto, cada grupo na ordem original.
export function splitImportant(rows: RoutineRow[]): ImportantSplit {
    const split: ImportantSplit = {
        important: rows.filter((row) => row.isImportant),
        rest: rows.filter((row) => !row.isImportant),
    }

    return split
}

// Lógica pura: valida o nome contra as outras categorias, sem diferenciar
// maiúsculas (o banco impõe a mesma unicidade). editingId deixa a categoria
// em edição manter o próprio nome.
export function validateCategoryName(
    name: string,
    categories: RoutineCategoryRow[],
    editingId: string | null,
): string | null {
    const trimmedName = name.trim()
    if (trimmedName === '') {
        return 'Informe o nome da categoria.'
    }
    if (trimmedName.length > MAX_CATEGORY_NAME_LENGTH) {
        return `Use no máximo ${MAX_CATEGORY_NAME_LENGTH} letras.`
    }
    const lowerName = trimmedName.toLowerCase()
    const isTaken = categories.some(
        (category) => category.id !== editingId && category.name.trim().toLowerCase() === lowerName,
    )

    return isTaken ? 'Já existe uma categoria com esse nome.' : null
}

export type CategoryUsage = Map<string, number>

// Lógica pura: quantos itens e tarefas ativos usam cada categoria.
export function countCategoryUsage(categoryIds: (string | null)[]): CategoryUsage {
    const usage: CategoryUsage = new Map()
    for (const categoryId of categoryIds) {
        if (categoryId !== null) {
            usage.set(categoryId, (usage.get(categoryId) ?? 0) + 1)
        }
    }

    return usage
}
