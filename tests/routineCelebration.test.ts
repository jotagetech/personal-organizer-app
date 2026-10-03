import { describe, expect, it } from 'vitest'

import { shouldCelebrate } from '@/features/routine/routineCelebration'

describe('shouldCelebrate', () => {
    it('comemora ao passar de incompleto para tudo feito', () => {
        expect(shouldCelebrate({ done: 2, total: 3 }, { done: 3, total: 3 })).toBe(true)
    })

    it('comemora quando o único item do dia é concluído', () => {
        expect(shouldCelebrate({ done: 0, total: 1 }, { done: 1, total: 1 })).toBe(true)
    })

    it('não comemora se o dia já estava completo', () => {
        expect(shouldCelebrate({ done: 3, total: 3 }, { done: 3, total: 3 })).toBe(false)
    })

    it('não comemora enquanto ainda falta algo', () => {
        expect(shouldCelebrate({ done: 1, total: 3 }, { done: 2, total: 3 })).toBe(false)
    })

    it('não comemora dia sem itens', () => {
        expect(shouldCelebrate({ done: 0, total: 0 }, { done: 0, total: 0 })).toBe(false)
    })

    it('não comemora ao desfazer uma conclusão', () => {
        expect(shouldCelebrate({ done: 3, total: 3 }, { done: 2, total: 3 })).toBe(false)
    })

    it('comemora quando um item novo entra e o dia fecha de novo', () => {
        expect(shouldCelebrate({ done: 3, total: 4 }, { done: 4, total: 4 })).toBe(true)
    })
})
