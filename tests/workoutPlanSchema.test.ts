import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
    normalizeStoredWorkoutPlan,
    parseWorkoutPlanJson,
    type WorkoutPlanValidationResult,
} from '@/lib/workoutPlanSchema'

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

    it('rejeita versão diferente de 1 e 2 apontando o campo versao', () => {
        const plan = { ...validPlanObject(), versao: 3 }
        const result = parseWorkoutPlanJson(JSON.stringify(plan))

        expect(result.success).toBe(false)
        if (!result.success) {
            expect(result.errors).toEqual([{ path: 'versao', message: 'versão do plano não suportada: use 1 ou 2' }])
        }
    })

    it('rejeita na v1 os campos que só existem na v2', () => {
        const plan = validPlanObject()
        Object.assign(plan.treinos[0].exercicios[0], { observacoes: 'descida lenta' })
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

describe('parseWorkoutPlanJson com versao 1 (normalização)', () => {
    it('normaliza v1 para o formato interno atual, sem mudar o documento guardado', () => {
        const result = parseWorkoutPlanJson(JSON.stringify(validPlanObject()))

        expect(result.success).toBe(true)
        if (!result.success) {
            return
        }
        expect(result.document).toEqual(validPlanObject())
        expect(result.plan.versao).toBe(2)
        expect(result.plan.treinos[0].dias_semana).toEqual(['segunda', 'quinta'])
        expect(result.plan.treinos[0].exercicios[0]).toEqual({
            id: 'supino-reto',
            nome: 'Supino reto',
            equipamento: null,
            forma_carga: 'total',
            por_lado: false,
            descanso_segundos_min: null,
            descanso_segundos_max: null,
            rir_alvo_min: null,
            rir_alvo_max: null,
            observacoes: null,
            series: [
                { metrica: 'repeticoes', alvo_min: 8, alvo_max: 12, carga_sugerida: 60, quedas: [] },
                { metrica: 'repeticoes', alvo_min: 8, alvo_max: 12, carga_sugerida: null, quedas: [] },
            ],
        })
    })

    it('lê um payload v1 já salvo no banco no formato interno', () => {
        const plan = normalizeStoredWorkoutPlan(validPlanObject())

        expect(plan.versao).toBe(2)
        expect(plan.treinos[0].exercicios[0].series[0].metrica).toBe('repeticoes')
    })

    it('recusa payload salvo em formato inválido com mensagem clara', () => {
        expect(() => normalizeStoredWorkoutPlan({ versao: 1 })).toThrow(/Plano salvo em formato inválido/)
    })
})

type LooseExercise = Record<string, unknown> & { series: Record<string, unknown>[] }

function validV2PlanObject() {
    const exercise: LooseExercise = {
        id: 'supino-reto',
        nome: 'Supino reto',
        forma_carga: 'total',
        series: [{ repeticoes_min: 8, repeticoes_max: 12, carga_sugerida: 60 }],
    }

    return {
        versao: 2,
        nome: 'Plano v2',
        unidade_carga: 'kg',
        treinos: [{ id: 'treino-a', nome: 'A', exercicios: [exercise] }],
    }
}

function firstExerciseOf(plan: ReturnType<typeof validV2PlanObject>): LooseExercise {
    return plan.treinos[0].exercicios[0]
}

function expectFailureAt(result: WorkoutPlanValidationResult, expectedPath: string): string {
    expect(result.success).toBe(false)
    if (result.success) {
        return ''
    }
    const matchingError = result.errors.find((error) => error.path === expectedPath)
    expect(matchingError, JSON.stringify(result.errors)).toBeDefined()

    return matchingError?.message ?? ''
}

describe('parseWorkoutPlanJson com versao 2', () => {
    it('aceita uma série de repetições escrita igual à v1', () => {
        const result = parseWorkoutPlanJson(JSON.stringify(validV2PlanObject()))

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.document.versao).toBe(2)
            expect(result.plan.treinos[0].exercicios[0].series[0]).toEqual({
                metrica: 'repeticoes',
                alvo_min: 8,
                alvo_max: 12,
                carga_sugerida: 60,
                quedas: [],
            })
        }
    })

    it('normaliza os campos do exercício e séries de tempo, distância e drop set', () => {
        const plan = validV2PlanObject()
        Object.assign(firstExerciseOf(plan), {
            equipamento: 'halteres',
            forma_carga: 'assistencia',
            por_lado: true,
            descanso_segundos_min: 90,
            descanso_segundos_max: 120,
            rir_alvo_min: 2,
            rir_alvo_max: 3,
            observacoes: '  descida em 4 segundos  ',
            series: [
                { segundos_min: 20, segundos_max: 30 },
                { metros_min: 25, metros_max: 40.5, carga_sugerida: 24 },
                {
                    repeticoes_min: 10,
                    repeticoes_max: 12,
                    carga_sugerida: 30,
                    quedas: [
                        { repeticoes_min: 8, repeticoes_max: 10, carga_sugerida: 20 },
                        { repeticoes_min: 6, repeticoes_max: 8 },
                    ],
                },
            ],
        })
        const result = parseWorkoutPlanJson(JSON.stringify(plan))

        expect(result.success).toBe(true)
        if (!result.success) {
            return
        }
        const [exercise] = result.plan.treinos[0].exercicios
        expect(exercise).toMatchObject({
            equipamento: 'halteres',
            forma_carga: 'assistencia',
            por_lado: true,
            descanso_segundos_min: 90,
            descanso_segundos_max: 120,
            rir_alvo_min: 2,
            rir_alvo_max: 3,
            observacoes: 'descida em 4 segundos',
        })
        expect(exercise.series).toEqual([
            { metrica: 'tempo', alvo_min: 20, alvo_max: 30, carga_sugerida: null, quedas: [] },
            { metrica: 'distancia', alvo_min: 25, alvo_max: 40.5, carga_sugerida: 24, quedas: [] },
            {
                metrica: 'repeticoes',
                alvo_min: 10,
                alvo_max: 12,
                carga_sugerida: 30,
                quedas: [
                    { alvo_min: 8, alvo_max: 10, carga_sugerida: 20 },
                    { alvo_min: 6, alvo_max: 8, carga_sugerida: null },
                ],
            },
        ])
    })

    it('aceita o arquivo de exemplo do repositório', () => {
        const examplePath = path.resolve(__dirname, '..', 'examples', 'plano-exemplo.json')
        const result = parseWorkoutPlanJson(readFileSync(examplePath, 'utf8'))

        expect(result.success, JSON.stringify(!result.success && result.errors)).toBe(true)
    })

    it('rejeita série sem nenhuma métrica', () => {
        const plan = validV2PlanObject()
        firstExerciseOf(plan).series = [{ carga_sugerida: 10 }]
        const message = expectFailureAt(parseWorkoutPlanJson(JSON.stringify(plan)), 'treinos[0].exercicios[0].series[0]')

        expect(message).toMatch(/informe a métrica da série/)
    })

    it('rejeita série com duas métricas ao mesmo tempo', () => {
        const plan = validV2PlanObject()
        firstExerciseOf(plan).series = [{ repeticoes_min: 8, repeticoes_max: 8, segundos_min: 20, segundos_max: 20 }]
        const message = expectFailureAt(parseWorkoutPlanJson(JSON.stringify(plan)), 'treinos[0].exercicios[0].series[0]')

        expect(message).toMatch(/uma única métrica/)
    })

    it('rejeita par de métrica incompleto apontando o campo que falta', () => {
        const plan = validV2PlanObject()
        firstExerciseOf(plan).series = [{ segundos_min: 20 }]
        const message = expectFailureAt(
            parseWorkoutPlanJson(JSON.stringify(plan)),
            'treinos[0].exercicios[0].series[0].segundos_max',
        )

        expect(message).toBe('obrigatório junto com segundos_min')
    })

    it('rejeita faixa invertida de distância', () => {
        const plan = validV2PlanObject()
        firstExerciseOf(plan).series = [{ metros_min: 40, metros_max: 25 }]
        const message = expectFailureAt(
            parseWorkoutPlanJson(JSON.stringify(plan)),
            'treinos[0].exercicios[0].series[0].metros_max',
        )

        expect(message).toBe('deve ser maior ou igual a metros_min')
    })

    it('rejeita queda com métrica diferente da série', () => {
        const plan = validV2PlanObject()
        firstExerciseOf(plan).series = [
            { repeticoes_min: 10, repeticoes_max: 12, quedas: [{ segundos_min: 20, segundos_max: 30 }] },
        ]
        const message = expectFailureAt(
            parseWorkoutPlanJson(JSON.stringify(plan)),
            'treinos[0].exercicios[0].series[0].quedas[0]',
        )

        expect(message).toMatch(/mesma métrica da série/)
    })

    it('rejeita lista de quedas vazia', () => {
        const plan = validV2PlanObject()
        firstExerciseOf(plan).series = [{ repeticoes_min: 10, repeticoes_max: 12, quedas: [] }]

        expectFailureAt(parseWorkoutPlanJson(JSON.stringify(plan)), 'treinos[0].exercicios[0].series[0].quedas')
    })

    it('rejeita descanso com só um lado da faixa', () => {
        const plan = validV2PlanObject()
        Object.assign(firstExerciseOf(plan), { descanso_segundos_max: 120 })
        const message = expectFailureAt(
            parseWorkoutPlanJson(JSON.stringify(plan)),
            'treinos[0].exercicios[0].descanso_segundos_min',
        )

        expect(message).toBe('obrigatório junto com descanso_segundos_max')
    })

    it('rejeita RIR alvo fora de 0 a 10 e faixa invertida', () => {
        const outOfRange = validV2PlanObject()
        Object.assign(firstExerciseOf(outOfRange), { rir_alvo_min: 2, rir_alvo_max: 11 })
        expectFailureAt(parseWorkoutPlanJson(JSON.stringify(outOfRange)), 'treinos[0].exercicios[0].rir_alvo_max')

        const inverted = validV2PlanObject()
        Object.assign(firstExerciseOf(inverted), { rir_alvo_min: 3, rir_alvo_max: 2 })
        expectFailureAt(parseWorkoutPlanJson(JSON.stringify(inverted)), 'treinos[0].exercicios[0].rir_alvo_max')
    })

    it('rejeita equipamento fora da lista', () => {
        const plan = validV2PlanObject()
        Object.assign(firstExerciseOf(plan), { equipamento: 'smith' })

        expectFailureAt(parseWorkoutPlanJson(JSON.stringify(plan)), 'treinos[0].exercicios[0].equipamento')
    })

    it('rejeita observação vazia e campos desconhecidos na série', () => {
        const emptyNote = validV2PlanObject()
        Object.assign(firstExerciseOf(emptyNote), { observacoes: '   ' })
        expectFailureAt(parseWorkoutPlanJson(JSON.stringify(emptyNote)), 'treinos[0].exercicios[0].observacoes')

        const unknownField = validV2PlanObject()
        firstExerciseOf(unknownField).series = [{ repeticoes_min: 8, repeticoes_max: 8, tipo: 'repeticoes' }]
        expect(parseWorkoutPlanJson(JSON.stringify(unknownField)).success).toBe(false)
    })
})
