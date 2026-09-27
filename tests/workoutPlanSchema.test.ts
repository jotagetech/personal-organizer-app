import { describe, expect, it } from 'vitest'

import { parseWorkoutPlanJson } from '@/lib/workoutPlanSchema'

function validPlanObject() {
    return {
        versao: 1,
        nome: 'Meu plano',
        unidade_carga: 'kg',
        treinos: [
            {
                id: 'treino-a',
                nome: 'A - Peito e tríceps',
                dias_semana: ['segunda', 'quinta'],
                exercicios: [
                    {
                        id: 'supino-reto',
                        nome: 'Supino reto',
                        forma_carga: 'total',
                        series: [
                            { repeticoes_min: 8, repeticoes_max: 12, carga_sugerida: 60 },
                            { repeticoes_min: 8, repeticoes_max: 12 },
                        ],
                    },
                ],
            },
        ],
    }
}

describe('parseWorkoutPlanJson', () => {
    it('aceita um plano válido', () => {
        const result = parseWorkoutPlanJson(JSON.stringify(validPlanObject()))
        expect(result.success).toBe(true)
    })

    it('rejeita JSON malformado', () => {
        const result = parseWorkoutPlanJson('{ isso não é json')
        expect(result.success).toBe(false)
    })

    it('rejeita versão diferente de 1', () => {
        const plan = { ...validPlanObject(), versao: 2 }
        const result = parseWorkoutPlanJson(JSON.stringify(plan))

        expect(result.success).toBe(false)
    })

    it('rejeita campos desconhecidos', () => {
        const plan = { ...validPlanObject(), campo_inesperado: true }
        const result = parseWorkoutPlanJson(JSON.stringify(plan))

        expect(result.success).toBe(false)
    })

    it('rejeita repeticoes_max menor que repeticoes_min com caminho do erro', () => {
        const plan = validPlanObject()
        plan.treinos[0].exercicios[0].series[0].repeticoes_max = 5
        const result = parseWorkoutPlanJson(JSON.stringify(plan))

        expect(result.success).toBe(false)
        if (!result.success) {
            expect(result.errors[0].path).toBe('treinos[0].exercicios[0].series[0].repeticoes_max')
        }
    })

    it('rejeita id de treino duplicado', () => {
        const plan = validPlanObject()
        plan.treinos.push({ ...plan.treinos[0] })
        const result = parseWorkoutPlanJson(JSON.stringify(plan))

        expect(result.success).toBe(false)
    })

    it('rejeita dia da semana inválido', () => {
        const plan = validPlanObject()
        plan.treinos[0].dias_semana = ['feriado']
        const result = parseWorkoutPlanJson(JSON.stringify(plan))

        expect(result.success).toBe(false)
    })

    it('aceita treino sem dias_semana (seleção manual)', () => {
        const plan = validPlanObject()
        delete (plan.treinos[0] as { dias_semana?: string[] }).dias_semana
        const result = parseWorkoutPlanJson(JSON.stringify(plan))

        expect(result.success).toBe(true)
    })

    it('rejeita arquivo maior que 1 MB', () => {
        const plan = validPlanObject()
        const oversizedName = 'x'.repeat(1024 * 1024 + 1)
        const result = parseWorkoutPlanJson(JSON.stringify({ ...plan, nome: oversizedName }))

        expect(result.success).toBe(false)
    })
})
