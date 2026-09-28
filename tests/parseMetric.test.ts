import { describe, expect, it } from 'vitest'

import { parseMetricValue } from '@/features/bodyMetrics/parseMetric'

describe('parseMetricValue', () => {
    it('aceita vírgula como separador decimal', () => {
        expect(parseMetricValue('78,5')).toEqual({ valid: true, value: 78.5 })
    })

    it('aceita ponto como separador decimal', () => {
        expect(parseMetricValue('78.5')).toEqual({ valid: true, value: 78.5 })
    })

    it('ignora espaços em volta do texto', () => {
        expect(parseMetricValue('  7,5  ')).toEqual({ valid: true, value: 7.5 })
    })

    it('rejeita valor zero', () => {
        expect(parseMetricValue('0').valid).toBe(false)
    })

    it('rejeita valor negativo', () => {
        expect(parseMetricValue('-5').valid).toBe(false)
    })

    it('rejeita texto não numérico', () => {
        expect(parseMetricValue('abc').valid).toBe(false)
    })

    it('aceita valor dentro do teto máximo', () => {
        expect(parseMetricValue('7,5', 24)).toEqual({ valid: true, value: 7.5 })
    })

    it('aceita valor exatamente igual ao teto máximo', () => {
        expect(parseMetricValue('24', 24)).toEqual({ valid: true, value: 24 })
    })

    it('rejeita valor acima do teto de 24 horas de sono', () => {
        expect(parseMetricValue('25', 24).valid).toBe(false)
    })
})
