import { describe, expect, it } from 'vitest'

import { routineItemInputSchema } from '@/features/routine/routineSchema'

function validInput() {
    return {
        title: 'Academia',
        weekdays: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'] as const,
    }
}

describe('routineItemInputSchema', () => {
    it('aceita um item válido sem vínculo', () => {
        const result = routineItemInputSchema.safeParse(validInput())
        expect(result.success).toBe(true)
    })

    it('aceita um vínculo válido', () => {
        const result = routineItemInputSchema.safeParse({ ...validInput(), linkKind: 'meal:lanche' })
        expect(result.success).toBe(true)
    })

    it('rejeita weekdays vazio', () => {
        const result = routineItemInputSchema.safeParse({ ...validInput(), weekdays: [] })
        expect(result.success).toBe(false)
    })

    it('rejeita weekdays com duplicata', () => {
        const result = routineItemInputSchema.safeParse({ ...validInput(), weekdays: ['segunda', 'segunda'] })
        expect(result.success).toBe(false)
    })

    it('rejeita título vazio', () => {
        const result = routineItemInputSchema.safeParse({ ...validInput(), title: '   ' })
        expect(result.success).toBe(false)
    })

    it('rejeita vínculo fora da lista permitida', () => {
        const result = routineItemInputSchema.safeParse({ ...validInput(), linkKind: 'meal:sobremesa' })
        expect(result.success).toBe(false)
    })
})
