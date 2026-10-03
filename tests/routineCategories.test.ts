import { describe, expect, it } from 'vitest'

import {
    ALL_CATEGORIES_FILTER,
    CATEGORY_COLOR_KEYS,
    CATEGORY_COLORS,
    categoryCssVar,
    countCategoryUsage,
    filterRowsByCategory,
    splitImportant,
    validateCategoryName,
} from '@/features/routine/categories'
import type { RoutineCategoryRow, RoutineRow } from '@/features/routine/types'

function row(id: string, overrides: Partial<RoutineRow> = {}): RoutineRow {
    return {
        id,
        title: id,
        source: 'manual',
        state: 'pending',
        linkKind: null,
        routineItemId: id,
        dayEntryId: null,
        taskId: null,
        categoryId: null,
        isImportant: false,
        carriedFromDate: null,
        ...overrides,
    }
}

function category(id: string, name: string): RoutineCategoryRow {
    return {
        id,
        user_id: 'user-1',
        name,
        color: 'azul',
        sort_order: 0,
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
    }
}

describe('filterRowsByCategory', () => {
    const rows = [
        row('a', { categoryId: 'work' }),
        row('b'),
        row('c', { categoryId: 'home' }),
        row('d', { categoryId: 'work' }),
    ]

    it('mantém tudo quando o filtro é todas', () => {
        expect(filterRowsByCategory(rows, ALL_CATEGORIES_FILTER)).toEqual(rows)
    })

    it('mantém só a categoria escolhida, na ordem original', () => {
        expect(filterRowsByCategory(rows, 'work').map((item) => item.id)).toEqual(['a', 'd'])
    })

    it('devolve vazio para categoria sem linhas', () => {
        expect(filterRowsByCategory(rows, 'other')).toEqual([])
    })
})

describe('splitImportant', () => {
    it('separa os importantes mantendo a ordem de cada grupo', () => {
        const rows = [row('a'), row('b', { isImportant: true }), row('c'), row('d', { isImportant: true })]

        const split = splitImportant(rows)

        expect(split.important.map((item) => item.id)).toEqual(['b', 'd'])
        expect(split.rest.map((item) => item.id)).toEqual(['a', 'c'])
    })

    it('não duplica nem perde linhas', () => {
        const rows = [row('a', { isImportant: true }), row('b')]

        const split = splitImportant(rows)

        expect(split.important.length + split.rest.length).toBe(rows.length)
    })

    it('devolve grupos vazios para lista vazia', () => {
        expect(splitImportant([])).toEqual({ important: [], rest: [] })
    })
})

describe('validateCategoryName', () => {
    const existing = [category('1', 'Trabalho'), category('2', 'Casa')]

    it('aceita um nome novo', () => {
        expect(validateCategoryName('  Estudos ', existing, null)).toBeNull()
    })

    it('recusa nome vazio', () => {
        expect(validateCategoryName('   ', existing, null)).not.toBeNull()
    })

    it('recusa nome repetido sem diferenciar maiúsculas', () => {
        expect(validateCategoryName('trabalho', existing, null)).not.toBeNull()
    })

    it('deixa a categoria em edição manter o próprio nome', () => {
        expect(validateCategoryName('TRABALHO', existing, '1')).toBeNull()
    })

    it('recusa nome longo demais', () => {
        expect(validateCategoryName('x'.repeat(41), existing, null)).not.toBeNull()
    })
})

describe('countCategoryUsage', () => {
    it('conta por categoria e ignora linhas sem categoria', () => {
        const usage = countCategoryUsage(['a', null, 'b', 'a'])

        expect(usage.get('a')).toBe(2)
        expect(usage.get('b')).toBe(1)
        expect(usage.size).toBe(2)
    })
})

describe('paleta', () => {
    it('tem rótulo e variável para cada chave', () => {
        for (const key of CATEGORY_COLOR_KEYS) {
            expect(CATEGORY_COLORS[key].label).not.toBe('')
            expect(CATEGORY_COLORS[key].cssVar).toBe(`--color-category-${key}`)
        }
    })

    it('cai numa cor conhecida para chave desconhecida', () => {
        expect(categoryCssVar('verde')).toBe('--color-category-azul')
        expect(categoryCssVar('rosa')).toBe('--color-category-rosa')
    })
})
