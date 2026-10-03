import { describe, expect, it } from 'vitest'

import { routineItemInputSchema } from '@/features/routine/routineSchema'

function weekdaysInput() {
    return {
        title: 'Academia',
        repeatKind: 'weekdays' as const,
        weekdays: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'] as const,
        categoryId: null,
        isImportant: false,
    }
}

function intervalInput() {
    return {
        title: 'Trocar filtro',
        repeatKind: 'interval' as const,
        intervalDays: 3,
        intervalAnchor: '2026-10-08',
        categoryId: null,
        isImportant: false,
    }
}

describe('routineItemInputSchema por dias da semana', () => {
    it('aceita um item válido sem vínculo', () => {
        const result = routineItemInputSchema.safeParse(weekdaysInput())
        expect(result.success).toBe(true)
    })

    it('aceita um vínculo válido', () => {
        const result = routineItemInputSchema.safeParse({ ...weekdaysInput(), linkKind: 'meal:lanche' })
        expect(result.success).toBe(true)
    })

    it('aceita categoria e marca de importante', () => {
        const result = routineItemInputSchema.safeParse({ ...weekdaysInput(), categoryId: 'cat-1', isImportant: true })
        expect(result.success && result.data.categoryId).toBe('cat-1')
        expect(result.success && result.data.isImportant).toBe(true)
    })

    it('rejeita weekdays vazio', () => {
        const result = routineItemInputSchema.safeParse({ ...weekdaysInput(), weekdays: [] })
        expect(result.success).toBe(false)
    })

    it('rejeita weekdays com duplicata', () => {
        const result = routineItemInputSchema.safeParse({ ...weekdaysInput(), weekdays: ['segunda', 'segunda'] })
        expect(result.success).toBe(false)
    })

    it('rejeita título vazio', () => {
        const result = routineItemInputSchema.safeParse({ ...weekdaysInput(), title: '   ' })
        expect(result.success).toBe(false)
    })

    it('rejeita vínculo fora da lista permitida', () => {
        const result = routineItemInputSchema.safeParse({ ...weekdaysInput(), linkKind: 'meal:sobremesa' })
        expect(result.success).toBe(false)
    })

    it('rejeita campos de intervalo misturados com dias da semana', () => {
        const result = routineItemInputSchema.safeParse({ ...weekdaysInput(), intervalDays: 3 })
        expect(result.success).toBe(false)
    })
})

describe('routineItemInputSchema por intervalo', () => {
    it('aceita um item válido', () => {
        const result = routineItemInputSchema.safeParse(intervalInput())
        expect(result.success).toBe(true)
    })

    it.each([1, 365])('aceita o limite de %s dias', (intervalDays) => {
        const result = routineItemInputSchema.safeParse({ ...intervalInput(), intervalDays })
        expect(result.success).toBe(true)
    })

    it.each([0, 366, -2, 1.5, Number.NaN])('rejeita intervalo fora de 1 a 365 (%s)', (intervalDays) => {
        const result = routineItemInputSchema.safeParse({ ...intervalInput(), intervalDays })
        expect(result.success).toBe(false)
    })

    it('rejeita intervalo sem data de início', () => {
        const { intervalAnchor: _omitted, ...withoutAnchor } = intervalInput()
        const result = routineItemInputSchema.safeParse(withoutAnchor)
        expect(result.success).toBe(false)
    })

    it('rejeita data de início inexistente', () => {
        const result = routineItemInputSchema.safeParse({ ...intervalInput(), intervalAnchor: '2026-02-30' })
        expect(result.success).toBe(false)
    })

    it('rejeita dias da semana misturados com intervalo', () => {
        const result = routineItemInputSchema.safeParse({ ...intervalInput(), weekdays: ['segunda'] })
        expect(result.success).toBe(false)
    })

    it('rejeita tipo de repetição desconhecido', () => {
        const result = routineItemInputSchema.safeParse({ ...intervalInput(), repeatKind: 'monthly' })
        expect(result.success).toBe(false)
    })
})
