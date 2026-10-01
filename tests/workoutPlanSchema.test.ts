import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
    normalizeStoredWorkoutPlan,
    parseWorkoutPlanJson,
    type WorkoutPlanValidationResult,
} from '@/lib/workoutPlanSchema'

const NO_OWN_REST = { descanso_segundos_min: null, descanso_segundos_max: null }

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
            tipo: 'series',
            intervalado: null,
            catalogo: null,
            equipamento: null,
            pegada: null,
            largura_pegada: null,
            acessorio: null,
            forma_carga: 'total',
            por_lado: false,
            descanso_segundos_min: null,
            descanso_segundos_max: null,
            rir_alvo_min: null,
            rir_alvo_max: null,
            observacoes: null,
            grupo: null,
            series: [
                { metrica: 'repeticoes', alvo_min: 8, alvo_max: 12, carga_sugerida: 60, ...NO_OWN_REST, quedas: [] },
                { metrica: 'repeticoes', alvo_min: 8, alvo_max: 12, carga_sugerida: null, ...NO_OWN_REST, quedas: [] },
            ],
            variacoes_semana: [],
        })
        expect(result.plan.bloco_semanas).toBeNull()
        expect(result.plan.semanas).toEqual([])
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
                ...NO_OWN_REST,
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
            { metrica: 'tempo', alvo_min: 20, alvo_max: 30, carga_sugerida: null, ...NO_OWN_REST, quedas: [] },
            { metrica: 'distancia', alvo_min: 25, alvo_max: 40.5, carga_sugerida: 24, ...NO_OWN_REST, quedas: [] },
            {
                metrica: 'repeticoes',
                alvo_min: 10,
                alvo_max: 12,
                carga_sugerida: 30,
                ...NO_OWN_REST,
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

    it('aceita pegada, largura e acessório e os leva para o exercício normalizado', () => {
        const plan = validV2PlanObject()
        Object.assign(firstExerciseOf(plan), {
            equipamento: 'cabo',
            pegada: 'pronada',
            largura_pegada: 'aberta',
            acessorio: 'barra_reta',
        })
        const result = parseWorkoutPlanJson(JSON.stringify(plan))

        expect(result.success).toBe(true)
        if (!result.success) {
            return
        }
        expect(result.plan.treinos[0].exercicios[0]).toMatchObject({
            pegada: 'pronada',
            largura_pegada: 'aberta',
            acessorio: 'barra_reta',
        })
    })

    it('aceita o slug do catálogo e recusa slug fora do formato', () => {
        const valid = validV2PlanObject()
        Object.assign(firstExerciseOf(valid), { catalogo: 'supino_reto_barra' })
        const result = parseWorkoutPlanJson(JSON.stringify(valid))

        expect(result.success).toBe(true)
        if (!result.success) {
            return
        }
        expect(result.plan.treinos[0].exercicios[0].catalogo).toBe('supino_reto_barra')

        const invalid = validV2PlanObject()
        Object.assign(firstExerciseOf(invalid), { catalogo: 'Supino Reto' })
        expectFailureAt(parseWorkoutPlanJson(JSON.stringify(invalid)), 'treinos[0].exercicios[0].catalogo')
    })

    it('rejeita pegada, largura e acessório fora da lista', () => {
        const fields = { pegada: 'mista', largura_pegada: 'larga', acessorio: 'v' }

        for (const [field, value] of Object.entries(fields)) {
            const plan = validV2PlanObject()
            Object.assign(firstExerciseOf(plan), { [field]: value })

            expectFailureAt(parseWorkoutPlanJson(JSON.stringify(plan)), `treinos[0].exercicios[0].${field}`)
        }
    })

    it('rejeita pegada em exercício intervalado', () => {
        const plan = validV2PlanObject()
        plan.treinos[0].exercicios[0] = {
            tipo: 'intervalado',
            id: 'tiros',
            nome: 'Tiros',
            modalidade: 'bike',
            rodadas: 4,
            trabalho_segundos_min: 30,
            trabalho_segundos_max: 30,
            recuperacao_segundos_min: 60,
            recuperacao_segundos_max: 60,
            pegada: 'neutra',
        } as unknown as LooseExercise

        expectFailureAt(parseWorkoutPlanJson(JSON.stringify(plan)), 'treinos[0].exercicios[0].pegada')
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

function planWithBlock(blockWeeks: number | undefined, variations: unknown[] | undefined) {
    const plan: Record<string, unknown> & ReturnType<typeof validV2PlanObject> = validV2PlanObject()
    if (blockWeeks !== undefined) {
        plan.bloco_semanas = blockWeeks
    }
    if (variations !== undefined) {
        firstExerciseOf(plan).variacoes_semana = variations
    }

    return plan
}

describe('parseWorkoutPlanJson com progressão por semana', () => {
    it('normaliza bloco, descrições e variações por semana', () => {
        const plan = planWithBlock(4, [
            { semanas: [4], series: [{ repeticoes_min: 8, repeticoes_max: 12 }], rir_alvo_min: 3, rir_alvo_max: 4 },
        ])
        plan.semanas = [{ semana: 1, descricao: ' Calibração ' }]
        const result = parseWorkoutPlanJson(JSON.stringify(plan))

        expect(result.success).toBe(true)
        if (!result.success) {
            return
        }
        expect(result.plan.bloco_semanas).toBe(4)
        expect(result.plan.semanas).toEqual([{ semana: 1, descricao: 'Calibração' }])
        expect(result.plan.treinos[0].exercicios[0].variacoes_semana).toEqual([
            {
                semanas: [4],
                series: [{ metrica: 'repeticoes', alvo_min: 8, alvo_max: 12, carga_sugerida: null, ...NO_OWN_REST, quedas: [] }],
                descanso_segundos_min: null,
                descanso_segundos_max: null,
                rir_alvo_min: 3,
                rir_alvo_max: 4,
                rodadas: null,
                trabalho_segundos_min: null,
                trabalho_segundos_max: null,
                recuperacao_segundos_min: null,
                recuperacao_segundos_max: null,
                rpe_alvo_min: null,
                rpe_alvo_max: null,
            },
        ])
    })

    it('aceita um plano v2 sem progressão com bloco e variações vazios no formato interno', () => {
        const result = parseWorkoutPlanJson(JSON.stringify(validV2PlanObject()))

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.plan.bloco_semanas).toBeNull()
            expect(result.plan.semanas).toEqual([])
            expect(result.plan.treinos[0].exercicios[0].variacoes_semana).toEqual([])
        }
    })

    it('exige bloco_semanas quando o plano usa variações ou descrições de semana', () => {
        const withVariation = planWithBlock(undefined, [{ semanas: [2], rir_alvo_min: 1, rir_alvo_max: 2 }])
        const message = expectFailureAt(parseWorkoutPlanJson(JSON.stringify(withVariation)), 'bloco_semanas')
        expect(message).toBe('obrigatório quando o plano usa variacoes_semana ou semanas')

        const withDescription: Record<string, unknown> = { ...validV2PlanObject(), semanas: [{ semana: 1, descricao: 'x' }] }
        expectFailureAt(parseWorkoutPlanJson(JSON.stringify(withDescription)), 'bloco_semanas')
    })

    it('rejeita semana fora do bloco na variação e na descrição', () => {
        const plan = planWithBlock(4, [{ semanas: [3, 5], rir_alvo_min: 1, rir_alvo_max: 2 }])
        plan.semanas = [{ semana: 6, descricao: 'x' }]
        const result = parseWorkoutPlanJson(JSON.stringify(plan))

        const variationMessage = expectFailureAt(result, 'treinos[0].exercicios[0].variacoes_semana[0].semanas[1]')
        expect(variationMessage).toBe('semana 5 fora do bloco de 4 semanas (bloco_semanas)')
        expectFailureAt(result, 'semanas[0].semana')
    })

    it('rejeita a mesma semana em duas variações do exercício e descrição repetida', () => {
        const plan = planWithBlock(4, [
            { semanas: [2, 3], rir_alvo_min: 1, rir_alvo_max: 2 },
            { semanas: [3], rir_alvo_min: 0, rir_alvo_max: 1 },
        ])
        plan.semanas = [
            { semana: 1, descricao: 'a' },
            { semana: 1, descricao: 'b' },
        ]
        const result = parseWorkoutPlanJson(JSON.stringify(plan))

        const message = expectFailureAt(result, 'treinos[0].exercicios[0].variacoes_semana[1].semanas[0]')
        expect(message).toBe('a semana 3 já tem variação neste exercício')
        expectFailureAt(result, 'semanas[1].semana')
    })

    it('rejeita variação que não muda nada e par incompleto na variação', () => {
        const empty = planWithBlock(4, [{ semanas: [2] }])
        const message = expectFailureAt(parseWorkoutPlanJson(JSON.stringify(empty)), 'treinos[0].exercicios[0].variacoes_semana[0]')
        expect(message).toMatch(/informe o que muda na semana/)

        const halfPair = planWithBlock(4, [{ semanas: [2], descanso_segundos_min: 60 }])
        expectFailureAt(
            parseWorkoutPlanJson(JSON.stringify(halfPair)),
            'treinos[0].exercicios[0].variacoes_semana[0].descanso_segundos_max',
        )
    })

    it('valida as séries da variação com as mesmas regras das séries base', () => {
        const plan = planWithBlock(4, [{ semanas: [2], series: [{ repeticoes_min: 12, repeticoes_max: 8 }] }])

        expectFailureAt(
            parseWorkoutPlanJson(JSON.stringify(plan)),
            'treinos[0].exercicios[0].variacoes_semana[0].series[0].repeticoes_max',
        )
    })

    it('rejeita bloco_semanas fora de 1 a 12 e os campos de progressão na v1', () => {
        expectFailureAt(parseWorkoutPlanJson(JSON.stringify(planWithBlock(13, undefined))), 'bloco_semanas')
        expectFailureAt(parseWorkoutPlanJson(JSON.stringify(planWithBlock(0, undefined))), 'bloco_semanas')

        const v1WithBlock = { ...validPlanObject(), bloco_semanas: 4 }
        expect(parseWorkoutPlanJson(JSON.stringify(v1WithBlock)).success).toBe(false)
    })
})

describe('descanso padrão do plano e descanso por série', () => {
    it('aceita o padrão do plano e o descanso de uma série e normaliza os dois', () => {
        const plan: Record<string, unknown> & ReturnType<typeof validV2PlanObject> = validV2PlanObject()
        plan.descanso_padrao_segundos_min = 60
        plan.descanso_padrao_segundos_max = 90
        firstExerciseOf(plan).series = [
            { repeticoes_min: 8, repeticoes_max: 12 },
            { repeticoes_min: 6, repeticoes_max: 8, descanso_segundos_min: 180, descanso_segundos_max: 180 },
        ]
        const result = parseWorkoutPlanJson(JSON.stringify(plan))

        expect(result.success, JSON.stringify(!result.success && result.errors)).toBe(true)
        if (!result.success) {
            return
        }
        expect(result.plan.descanso_padrao_segundos_min).toBe(60)
        expect(result.plan.descanso_padrao_segundos_max).toBe(90)
        const [firstSet, lastSet] = result.plan.treinos[0].exercicios[0].series
        expect(firstSet).toMatchObject(NO_OWN_REST)
        expect(lastSet).toMatchObject({ descanso_segundos_min: 180, descanso_segundos_max: 180 })
    })

    it('plano sem os campos novos continua válido, com padrão nulo', () => {
        const result = parseWorkoutPlanJson(JSON.stringify(validV2PlanObject()))

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.plan.descanso_padrao_segundos_min).toBeNull()
            expect(result.plan.descanso_padrao_segundos_max).toBeNull()
        }
    })

    it('rejeita padrão do plano com só um lado, invertido, negativo ou fracionado', () => {
        const halfPair: Record<string, unknown> = { ...validV2PlanObject(), descanso_padrao_segundos_min: 60 }
        const message = expectFailureAt(parseWorkoutPlanJson(JSON.stringify(halfPair)), 'descanso_padrao_segundos_max')
        expect(message).toBe('obrigatório junto com descanso_padrao_segundos_min')

        const inverted = { ...validV2PlanObject(), descanso_padrao_segundos_min: 90, descanso_padrao_segundos_max: 60 }
        expectFailureAt(parseWorkoutPlanJson(JSON.stringify(inverted)), 'descanso_padrao_segundos_max')

        const negative = { ...validV2PlanObject(), descanso_padrao_segundos_min: -1, descanso_padrao_segundos_max: 60 }
        expectFailureAt(parseWorkoutPlanJson(JSON.stringify(negative)), 'descanso_padrao_segundos_min')

        const fractional = { ...validV2PlanObject(), descanso_padrao_segundos_min: 60.5, descanso_padrao_segundos_max: 90 }
        expectFailureAt(parseWorkoutPlanJson(JSON.stringify(fractional)), 'descanso_padrao_segundos_min')
    })

    it('rejeita descanso da série com só um lado ou invertido, apontando a série', () => {
        const halfPair = validV2PlanObject()
        firstExerciseOf(halfPair).series = [{ repeticoes_min: 8, repeticoes_max: 12, descanso_segundos_max: 90 }]
        expectFailureAt(
            parseWorkoutPlanJson(JSON.stringify(halfPair)),
            'treinos[0].exercicios[0].series[0].descanso_segundos_min',
        )

        const inverted = validV2PlanObject()
        firstExerciseOf(inverted).series = [
            { repeticoes_min: 8, repeticoes_max: 12, descanso_segundos_min: 120, descanso_segundos_max: 60 },
        ]
        expectFailureAt(
            parseWorkoutPlanJson(JSON.stringify(inverted)),
            'treinos[0].exercicios[0].series[0].descanso_segundos_max',
        )
    })

    it('rejeita descanso dentro de uma queda do drop set', () => {
        const plan = validV2PlanObject()
        firstExerciseOf(plan).series = [
            {
                repeticoes_min: 10,
                repeticoes_max: 12,
                quedas: [{ repeticoes_min: 8, repeticoes_max: 10, descanso_segundos_min: 30, descanso_segundos_max: 30 }],
            },
        ]

        expect(parseWorkoutPlanJson(JSON.stringify(plan)).success).toBe(false)
    })

    it('aceita descanso por série dentro de uma variação da semana', () => {
        const plan = planWithBlock(4, [
            {
                semanas: [4],
                series: [{ repeticoes_min: 8, repeticoes_max: 12, descanso_segundos_min: 60, descanso_segundos_max: 60 }],
            },
        ])
        const result = parseWorkoutPlanJson(JSON.stringify(plan))

        expect(result.success).toBe(true)
        if (result.success) {
            const [variation] = result.plan.treinos[0].exercicios[0].variacoes_semana
            expect(variation.series?.[0]).toMatchObject({ descanso_segundos_min: 60, descanso_segundos_max: 60 })
        }
    })
})
