import { describe, expect, it } from 'vitest'

import { formatDropResult, formatSetResult } from '@/features/results/setResultText'

const EMPTY = { loadKg: null, reps: null, durationSeconds: null, distanceM: null }

describe('formatSetResult', () => {
    it('mostra carga e repetições', () => {
        expect(formatSetResult('total', 'repeticoes', { ...EMPTY, loadKg: 60, reps: 10 }, false)).toBe('60 kg × 10 reps')
    })

    it('mostra o tempo em segundos e a distância em metros com vírgula decimal', () => {
        expect(formatSetResult('total', 'tempo', { ...EMPTY, loadKg: 10, durationSeconds: 35 }, false)).toBe(
            '10 kg × 35 s',
        )
        expect(formatSetResult('por_halter', 'distancia', { ...EMPTY, loadKg: 24, distanceM: 32.5 }, false)).toBe(
            '24 kg por halter × 32,5 m',
        )
    })

    it('identifica a assistência e a carga de cada lado', () => {
        expect(formatSetResult('assistencia', 'repeticoes', { ...EMPTY, loadKg: 40, reps: 6 }, false)).toBe(
            'assist. 40 kg × 6 reps',
        )
        expect(formatSetResult('por_lado', 'repeticoes', { ...EMPTY, loadKg: 20, reps: 8 }, false)).toBe(
            '20 kg por lado × 8 reps',
        )
    })

    it('não mostra 0 kg para peso corporal sem lastro e mostra o lastro quando existe', () => {
        expect(formatSetResult('peso_corporal', 'tempo', { ...EMPTY, loadKg: 0, durationSeconds: 40 }, false)).toBe(
            '40 s',
        )
        expect(formatSetResult('peso_corporal', 'repeticoes', { ...EMPTY, loadKg: null, reps: 12 }, false)).toBe(
            '12 reps',
        )
        expect(formatSetResult('peso_corporal', 'repeticoes', { ...EMPTY, loadKg: 5, reps: 8 }, false)).toBe(
            '+5 kg × 8 reps',
        )
    })

    it('indica execução unilateral na unidade e marca valor ausente com interrogação', () => {
        expect(formatSetResult('por_halter', 'repeticoes', { ...EMPTY, loadKg: 12, reps: 8 }, true)).toBe(
            '12 kg por halter × 8 reps por lado',
        )
        expect(formatSetResult('total', 'repeticoes', EMPTY, false)).toBe('? × ?')
    })
})

describe('formatDropResult', () => {
    it('prefixa a queda com a seta e usa a mesma métrica da série', () => {
        expect(formatDropResult('total', 'repeticoes', { ...EMPTY, loadKg: 22.5, reps: 9 }, false)).toBe(
            '↳ 22,5 kg × 9 reps',
        )
    })

    it('avisa quando a queda do meio ficou sem registro', () => {
        expect(formatDropResult('total', 'repeticoes', EMPTY, false)).toBe('↳ sem registro')
    })
})
