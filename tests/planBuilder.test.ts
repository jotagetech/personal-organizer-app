import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { builderPlanFromWorkoutPlan, builderPlanToDocument } from '@/features/workout/builder/builderDocument'
import { parseBuilderDraft, serializeBuilderDraft } from '@/features/workout/builder/builderDraft'
import { exerciseIdStatus, resolveExerciseIds, slugify } from '@/features/workout/builder/builderIds'
import {
    createEmptyPlan,
    createExercise,
    createVariation,
    duplicateExercise,
    moveItem,
    setRangeFixed,
    setRangeValue,
    suggestLoadConvention,
    toggleWeek,
} from '@/features/workout/builder/builderState'
import type { BuilderExercise, BuilderPlan } from '@/features/workout/builder/builderTypes'
import { candidateFieldIds, validateBuilderPlan } from '@/features/workout/builder/builderValidation'
import { parseWorkoutPlanJson, validateWorkoutPlanDocument, type WorkoutPlan } from '@/lib/workoutPlanSchema'

const EXAMPLE_PATH = path.resolve(__dirname, '..', 'examples', 'plano-exemplo.json')

function readExampleDocument(): unknown {
    return JSON.parse(readFileSync(EXAMPLE_PATH, 'utf8'))
}

function normalizedPlanOf(document: unknown): WorkoutPlan {
    const result = validateWorkoutPlanDocument(document)
    if (!result.success) {
        throw new Error(JSON.stringify(result.errors))
    }

    return result.plan
}

function builderFromExample(): BuilderPlan {
    return builderPlanFromWorkoutPlan(normalizedPlanOf(readExampleDocument()))
}

function filledExercise(nome: string): BuilderExercise {
    const exercise = createExercise()
    exercise.nome = nome
    exercise.series[0].alvo = { min: '8', max: '12', fixo: false }

    return exercise
}

function planWithExercises(exercises: BuilderExercise[]): BuilderPlan {
    const plan = createEmptyPlan()
    plan.nome = 'Plano de teste'
    plan.treinos[0].exercicios = exercises

    return plan
}

describe('ids do montador', () => {
    it('gera slug sem acento, em minúsculas e com hífen', () => {
        expect(slugify('Afundo Búlgaro c/ halteres')).toBe('afundo-bulgaro-c-halteres')
        expect(slugify('  Tríceps  na corda!! ')).toBe('triceps-na-corda')
        expect(slugify('***')).toBe('')
    })

    it('deixa ids únicos no treino e usa um nome padrão sem nome', () => {
        const plan = planWithExercises([filledExercise('Supino'), filledExercise('Supino'), createExercise()])

        expect(resolveExerciseIds(plan.treinos[0])).toEqual(['supino', 'supino-2', 'exercicio'])
    })

    it('mantém o id salvo ao renomear um exercício carregado', () => {
        const plan = builderFromExample()
        const benchPress = plan.treinos[0].exercicios[0]
        benchPress.nome = 'Supino reto com barra'

        expect(resolveExerciseIds(plan.treinos[0])[0]).toBe('supino-reto')
        expect(exerciseIdStatus(benchPress)).toBe('mantido')
    })

    it('tratar como novo gera um id diferente do salvo, mesmo com o mesmo nome', () => {
        const plan = builderFromExample()
        const benchPress = plan.treinos[0].exercicios[0]
        benchPress.tratarComoNovo = true

        expect(resolveExerciseIds(plan.treinos[0])[0]).toBe('supino-reto-2')
        expect(exerciseIdStatus(benchPress)).toBe('renovado')
    })

    it('exercício novo com o nome de um salvo não pega o id dele', () => {
        const plan = builderFromExample()
        plan.treinos[0].exercicios.push(filledExercise('Supino reto'))
        const ids = resolveExerciseIds(plan.treinos[0])

        expect(ids[0]).toBe('supino-reto')
        expect(ids[ids.length - 1]).toBe('supino-reto-2')
    })

    it('a cópia de um exercício é um exercício novo, sem o histórico do original', () => {
        const plan = builderFromExample()
        const copy = duplicateExercise(plan.treinos[0].exercicios[0])

        expect(copy.idSalvo).toBeNull()
        expect(copy.nome).toBe('Supino reto (cópia)')
        expect(copy.series[0].uid).not.toBe(plan.treinos[0].exercicios[0].series[0].uid)
    })
})

describe('conversão do montador para o JSON v2', () => {
    it('o plano de exemplo vai e volta do montador igual', () => {
        const example = readExampleDocument()
        const document = builderPlanToDocument(builderFromExample())

        expect(document).toEqual(example)
        expect(validateBuilderPlan(builderFromExample()).success).toBe(true)
    })

    it('o plano normalizado depois da volta é o mesmo', () => {
        const document = builderPlanToDocument(builderFromExample())

        expect(normalizedPlanOf(document)).toEqual(normalizedPlanOf(readExampleDocument()))
    })

    it('plano versão 1 carregado no montador sai como versão 2 válida', () => {
        const v1Plan = {
            versao: 1,
            nome: 'Antigo',
            unidade_carga: 'kg',
            treinos: [
                {
                    id: 'a',
                    nome: 'A',
                    exercicios: [
                        {
                            id: 'agachamento',
                            nome: 'Agachamento',
                            forma_carga: 'total',
                            series: [{ repeticoes_min: 5, repeticoes_max: 5, carga_sugerida: 100 }],
                        },
                    ],
                },
            ],
        }
        const document = builderPlanToDocument(builderPlanFromWorkoutPlan(normalizedPlanOf(v1Plan)))

        expect(document).toEqual({
            versao: 2,
            nome: 'Antigo',
            unidade_carga: 'kg',
            treinos: [
                {
                    id: 'a',
                    nome: 'A',
                    exercicios: [
                        {
                            id: 'agachamento',
                            nome: 'Agachamento',
                            forma_carga: 'total',
                            series: [{ repeticoes_min: 5, repeticoes_max: 5, carga_sugerida: 100 }],
                        },
                    ],
                },
            ],
        })
    })

    it('monta um plano do zero com valor fixo, decimal com vírgula e drop set', () => {
        const exercise = filledExercise('Rosca direta')
        exercise.equipamento = 'halteres'
        exercise.forma_carga = suggestLoadConvention('halteres', exercise.forma_carga)
        exercise.descanso = setRangeValue({ min: '', max: '', fixo: true }, 'min', '90')
        exercise.series[0].carga = '12,5'
        exercise.series[0].quedas = [{ uid: 'q1', alvo: { min: '6', max: '6', fixo: true }, carga: '8' }]
        const plan = planWithExercises([exercise])
        plan.treinos[0].dias_semana = ['quinta', 'segunda']

        const result = validateBuilderPlan(plan)

        expect(result.success).toBe(true)
        expect(builderPlanToDocument(plan)).toEqual({
            versao: 2,
            nome: 'Plano de teste',
            unidade_carga: 'kg',
            treinos: [
                {
                    id: 'treino-a',
                    nome: 'Treino A',
                    dias_semana: ['segunda', 'quinta'],
                    exercicios: [
                        {
                            id: 'rosca-direta',
                            nome: 'Rosca direta',
                            equipamento: 'halteres',
                            forma_carga: 'por_halter',
                            descanso_segundos_min: 90,
                            descanso_segundos_max: 90,
                            series: [
                                {
                                    repeticoes_min: 8,
                                    repeticoes_max: 12,
                                    carga_sugerida: 12.5,
                                    quedas: [{ repeticoes_min: 6, repeticoes_max: 6, carga_sugerida: 8 }],
                                },
                            ],
                        },
                    ],
                },
            ],
        })
    })

    it('máquina assistida vira equipamento máquina com assistência', () => {
        const exercise = filledExercise('Barra fixa')
        exercise.equipamento = 'maquina_assistida'
        exercise.forma_carga = suggestLoadConvention('maquina_assistida', exercise.forma_carga)
        const [workout] = builderPlanToDocument(planWithExercises([exercise])).treinos as {
            exercicios: Record<string, unknown>[]
        }[]

        expect(workout.exercicios[0]).toMatchObject({ equipamento: 'maquina', forma_carga: 'assistencia' })
    })

    it('leva pegada, largura e acessório ao arquivo e os traz de volta ao carregar', () => {
        const exercise = filledExercise('Puxada frontal')
        exercise.equipamento = 'cabo'
        exercise.pegada = 'pronada'
        exercise.largura_pegada = 'aberta'
        exercise.acessorio = 'barra_reta'
        const document = builderPlanToDocument(planWithExercises([exercise]))
        const [workout] = document.treinos as { exercicios: Record<string, unknown>[] }[]
        const reloaded = builderPlanFromWorkoutPlan(normalizedPlanOf(document)).treinos[0].exercicios[0]

        expect(workout.exercicios[0]).toMatchObject({ pegada: 'pronada', largura_pegada: 'aberta', acessorio: 'barra_reta' })
        expect(reloaded).toMatchObject({ pegada: 'pronada', largura_pegada: 'aberta', acessorio: 'barra_reta' })
    })

    it('pegada não informada não aparece no arquivo', () => {
        const [workout] = builderPlanToDocument(planWithExercises([filledExercise('Supino')])).treinos as {
            exercicios: Record<string, unknown>[]
        }[]

        expect(workout.exercicios[0]).not.toHaveProperty('pegada')
        expect(workout.exercicios[0]).not.toHaveProperty('largura_pegada')
        expect(workout.exercicios[0]).not.toHaveProperty('acessorio')
    })

    it('intervalado não leva campos de série, carga, descanso nem RIR', () => {
        const exercise = filledExercise('Tiros')
        exercise.tipo = 'intervalado'
        exercise.equipamento = 'barra'
        exercise.por_lado = true
        exercise.descanso = { min: '60', max: '60', fixo: true }
        exercise.modalidade = 'bike'
        exercise.rodadas = '6'
        exercise.trabalho = { min: '30', max: '30', fixo: true }
        exercise.recuperacao = { min: '90', max: '90', fixo: true }
        const plan = planWithExercises([exercise])
        const [workout] = builderPlanToDocument(plan).treinos as { exercicios: Record<string, unknown>[] }[]

        expect(workout.exercicios[0]).toEqual({
            tipo: 'intervalado',
            id: 'tiros',
            nome: 'Tiros',
            modalidade: 'bike',
            rodadas: 6,
            trabalho_segundos_min: 30,
            trabalho_segundos_max: 30,
            recuperacao_segundos_min: 90,
            recuperacao_segundos_max: 90,
        })
        expect(validateBuilderPlan(plan).success).toBe(true)
    })

    it('sem progressão, nada de bloco, semanas ou variações vai para o arquivo', () => {
        const plan = builderFromExample()
        plan.usaProgressao = false
        const document = builderPlanToDocument(plan)
        const serialized = JSON.stringify(document)

        expect(document).not.toHaveProperty('bloco_semanas')
        expect(document).not.toHaveProperty('semanas')
        expect(serialized).not.toContain('variacoes_semana')
        expect(parseWorkoutPlanJson(serialized).success).toBe(true)
    })

    it('a variação leva só o que mudou e, sem mudança, repete as séries', () => {
        const exercise = filledExercise('Agachamento')
        exercise.rir = { min: '2', max: '2', fixo: true }
        const plan = planWithExercises([exercise])
        plan.usaProgressao = true
        plan.blocoSemanas = '4'

        const reducedWeek = createVariation(exercise, 4)
        reducedWeek.rir = { min: '3', max: '3', fixo: true }
        const unchangedWeek = createVariation({ ...exercise, variacoes: [reducedWeek] }, 4)
        exercise.variacoes = [reducedWeek, unchangedWeek]

        const [workout] = builderPlanToDocument(plan).treinos as { exercicios: Record<string, unknown>[] }[]

        expect(reducedWeek.semanas).toEqual([4])
        expect(unchangedWeek.semanas).toEqual([3])
        expect(workout.exercicios[0].variacoes_semana).toEqual([
            { semanas: [4], rir_alvo_min: 3, rir_alvo_max: 3 },
            { semanas: [3], series: [{ repeticoes_min: 8, repeticoes_max: 12 }] },
        ])
        expect(validateBuilderPlan(plan).success).toBe(true)
    })

    it('descrições de semana fora do bloco não vão para o arquivo', () => {
        const plan = builderFromExample()
        plan.blocoSemanas = '2'
        plan.treinos.forEach((workout) => workout.exercicios.forEach((exercise) => (exercise.variacoes = [])))
        const document = builderPlanToDocument(plan)

        expect(document.semanas).toEqual([
            { semana: 1, descricao: 'Calibração de carga' },
            { semana: 2, descricao: 'Mais repetições, mesma carga' },
        ])
    })
})

describe('validação do montador', () => {
    it('aponta campos vazios em português, com o local e o campo da tela', () => {
        const plan = planWithExercises([createExercise()])
        plan.nome = ''
        const result = validateBuilderPlan(plan)
        if (result.success) {
            throw new Error('esperava falha')
        }

        expect(result.issues).toContainEqual(
            expect.objectContaining({ fieldPath: ['nome'], local: 'Plano › nome', mensagem: 'não pode ficar vazio' }),
        )
        expect(result.issues).toContainEqual(
            expect.objectContaining({
                fieldPath: ['treinos', 0, 'exercicios', 0, 'series', 0, 'alvo'],
                local: 'Treino "Treino A" › Exercício 1 › Série 1 › alvo',
                mensagem: 'informe o alvo da série',
                workoutUid: plan.treinos[0].uid,
                exerciseUid: plan.treinos[0].exercicios[0].uid,
            }),
        )
    })

    it('treino sem exercício pede para adicionar um', () => {
        const plan = planWithExercises([])
        const result = validateBuilderPlan(plan)

        expect(result.success).toBe(false)
        expect(!result.success && result.issues[0].mensagem).toBe('adicione pelo menos um exercício')
    })

    it('faixa invertida e faixa incompleta falam do mínimo e do máximo', () => {
        const exercise = filledExercise('Remada')
        exercise.series[0].alvo = { min: '12', max: '8', fixo: false }
        exercise.rir = { min: '2', max: '', fixo: false }
        const result = validateBuilderPlan(planWithExercises([exercise]))
        if (result.success) {
            throw new Error('esperava falha')
        }
        const messages = result.issues.map((issue) => [issue.fieldPath.join('.'), issue.mensagem])

        expect(messages).toContainEqual([
            'treinos.0.exercicios.0.series.0.alvo',
            'o máximo não pode ser menor que o mínimo',
        ])
        expect(messages).toContainEqual(['treinos.0.exercicios.0.rir', 'preencha o mínimo e o máximo'])
    })

    it('número inválido e decimal em repetições são recusados', () => {
        const exercise = filledExercise('Remada')
        exercise.series[0].alvo = { min: '8,5', max: '10', fixo: false }
        exercise.series[0].carga = 'abc'
        const result = validateBuilderPlan(planWithExercises([exercise]))
        const messages = result.success ? [] : result.issues.map((issue) => issue.mensagem)

        expect(messages).toContain('use um número inteiro')
        expect(messages).toContain('número inválido')
    })

    it('semana repetida entre variações e semana fora do bloco são apontadas na variação', () => {
        const plan = builderFromExample()
        const benchPress = plan.treinos[0].exercicios[0]
        benchPress.variacoes[1].semanas = [2]
        plan.blocoSemanas = '3'
        const result = validateBuilderPlan(plan)
        if (result.success) {
            throw new Error('esperava falha')
        }

        expect(result.issues).toContainEqual(
            expect.objectContaining({
                fieldPath: ['treinos', 0, 'exercicios', 0, 'variacoes_semana', 1, 'semanas', 0],
                mensagem: 'a semana 2 já está em outra variação deste exercício',
                variationUid: benchPress.variacoes[1].uid,
            }),
        )
        expect(result.issues.map((issue) => issue.mensagem)).toContain('semana 4 fora do bloco de 3 semanas')
    })

    it('progressão ligada sem número de semanas é apontada no bloco', () => {
        const plan = planWithExercises([filledExercise('Supino')])
        plan.usaProgressao = true
        plan.blocoSemanas = ''
        const result = validateBuilderPlan(plan)

        expect(!result.success && result.issues[0]).toMatchObject({
            fieldPath: ['bloco_semanas'],
            mensagem: 'informe quantas semanas tem o bloco',
        })
    })

    it('procura o campo exato primeiro e depois os contêineres dele', () => {
        expect(candidateFieldIds(['treinos', 0, 'exercicios', 1, 'nome'])).toEqual([
            'plano-treinos-0-exercicios-1-nome',
            'plano-treinos-0-exercicios-1',
            'plano-treinos-0-exercicios',
            'plano-treinos-0',
            'plano-treinos',
        ])
    })
})

describe('edição no montador', () => {
    it('valor fixo grava o mesmo número nos dois lados da faixa', () => {
        const range = setRangeValue({ min: '', max: '', fixo: true }, 'min', '10')

        expect(range).toEqual({ min: '10', max: '10', fixo: true })
        expect(setRangeFixed({ min: '8', max: '12', fixo: false }, true)).toEqual({ min: '8', max: '8', fixo: true })
        expect(setRangeValue({ min: '8', max: '12', fixo: false }, 'max', '15')).toEqual({
            min: '8',
            max: '15',
            fixo: false,
        })
    })

    it('equipamento sugere a forma de carga e equipamento sem sugestão não mexe nela', () => {
        expect(suggestLoadConvention('barra', 'por_halter')).toBe('total')
        expect(suggestLoadConvention('halteres', 'total')).toBe('por_halter')
        expect(suggestLoadConvention('peso_corporal', 'total')).toBe('peso_corporal')
        expect(suggestLoadConvention('kettlebell', 'por_lado')).toBe('por_lado')
        expect(suggestLoadConvention('', 'assistencia')).toBe('assistencia')
    })

    it('move e alterna semanas sem mutar a lista original', () => {
        const items = ['a', 'b', 'c']

        expect(moveItem(items, 0, 1)).toEqual(['b', 'a', 'c'])
        expect(moveItem(items, 0, -1)).toBe(items)
        expect(items).toEqual(['a', 'b', 'c'])
        expect(toggleWeek([1, 4], 2)).toEqual([1, 2, 4])
        expect(toggleWeek([1, 4], 4)).toEqual([1])
    })

    it('nova variação pega a última semana livre e copia a base', () => {
        const plan = builderFromExample()
        const benchPress = plan.treinos[0].exercicios[0]
        benchPress.variacoes = benchPress.variacoes.filter((variation) => !variation.semanas.includes(4))
        const variation = createVariation(benchPress, 4)

        expect(variation.semanas).toEqual([4])
        expect(variation.series.map((set) => set.alvo)).toEqual(benchPress.series.map((set) => set.alvo))
        expect(variation.series[0].uid).not.toBe(benchPress.series[0].uid)
    })
})

describe('rascunho do montador', () => {
    it('volta igual depois de gravado', () => {
        const plan = builderFromExample()
        const savedAt = new Date('2026-09-29T12:00:00.000Z')
        const draft = parseBuilderDraft(serializeBuilderDraft(plan, 'edicao', savedAt))

        expect(draft).toEqual({ formato: 1, origem: 'edicao', salvoEm: savedAt.toISOString(), plano: plan })
    })

    it('descarta rascunho ausente, corrompido ou de outro formato', () => {
        expect(parseBuilderDraft(null)).toBeNull()
        expect(parseBuilderDraft('{nao e json')).toBeNull()
        expect(parseBuilderDraft(JSON.stringify({ formato: 99, origem: 'novo', salvoEm: '', plano: {} }))).toBeNull()
        expect(
            parseBuilderDraft(JSON.stringify({ formato: 1, origem: 'novo', salvoEm: 'x', plano: { nome: 'x' } })),
        ).toBeNull()
    })
})

describe('descanso padrão e descanso por série no montador', () => {
    it('editar o plano e trocar só o padrão gera o mesmo arquivo com o padrão novo', () => {
        const plan = builderFromExample()
        plan.descansoPadrao = setRangeValue(plan.descansoPadrao, 'min', '75')
        const result = validateBuilderPlan(plan)

        expect(result.success).toBe(true)
        expect(builderPlanToDocument(plan)).toEqual({
            ...(readExampleDocument() as Record<string, unknown>),
            descanso_padrao_segundos_min: 75,
            descanso_padrao_segundos_max: 75,
        })
    })

    it('o padrão salvo volta para o montador como faixa e vai de novo para o arquivo', () => {
        const plan = builderFromExample()
        plan.descansoPadrao = { min: '60', max: '90', fixo: false }
        const reloaded = builderPlanFromWorkoutPlan(normalizedPlanOf(builderPlanToDocument(plan)))

        expect(reloaded.descansoPadrao).toEqual({ min: '60', max: '90', fixo: false })
        expect(builderPlanToDocument(reloaded)).toMatchObject({
            descanso_padrao_segundos_min: 60,
            descanso_padrao_segundos_max: 90,
        })
    })

    it('série só leva descanso quando ganha um próprio, e ele volta ao recarregar', () => {
        const exercise = filledExercise('Supino')
        exercise.series.push({ ...exercise.series[0], uid: 'segunda', descanso: { min: '180', max: '180', fixo: true } })
        const document = builderPlanToDocument(planWithExercises([exercise]))
        const [firstSet, secondSet] = (document.treinos as { exercicios: { series: Record<string, unknown>[] }[] }[])[0]
            .exercicios[0].series

        expect(firstSet).not.toHaveProperty('descanso_segundos_min')
        expect(secondSet).toMatchObject({ descanso_segundos_min: 180, descanso_segundos_max: 180 })

        const reloaded = builderPlanFromWorkoutPlan(normalizedPlanOf(document))
        const [reloadedFirst, reloadedSecond] = reloaded.treinos[0].exercicios[0].series
        expect(reloadedFirst.descanso).toBeNull()
        expect(reloadedSecond.descanso).toEqual({ min: '180', max: '180', fixo: true })
    })

    it('pedir descanso próprio e deixar vazio não muda o arquivo', () => {
        const exercise = filledExercise('Supino')
        const untouched = builderPlanToDocument(planWithExercises([exercise]))
        exercise.series[0].descanso = { min: '', max: '', fixo: true }

        expect(builderPlanToDocument(planWithExercises([exercise]))).toEqual(untouched)
    })

    it('aponta o padrão invertido no campo do plano', () => {
        const plan = planWithExercises([filledExercise('Supino')])
        plan.descansoPadrao = { min: '90', max: '60', fixo: false }
        const result = validateBuilderPlan(plan)

        expect(result.success).toBe(false)
        if (!result.success) {
            expect(result.issues).toContainEqual(
                expect.objectContaining({
                    fieldPath: ['descanso_padrao'],
                    local: 'Plano › descanso padrão',
                    mensagem: 'o máximo não pode ser menor que o mínimo',
                }),
            )
        }
    })

    it('aponta a faixa pela metade no descanso da série', () => {
        const exercise = filledExercise('Supino')
        exercise.series[0].descanso = { min: '60', max: '', fixo: false }
        const result = validateBuilderPlan(planWithExercises([exercise]))

        expect(result.success).toBe(false)
        if (!result.success) {
            expect(result.issues).toContainEqual(
                expect.objectContaining({
                    fieldPath: ['treinos', 0, 'exercicios', 0, 'series', 0, 'descanso'],
                    mensagem: 'preencha o mínimo e o máximo',
                }),
            )
        }
    })

    it('duplicar o exercício copia o descanso próprio das séries sem compartilhar o objeto', () => {
        const exercise = filledExercise('Supino')
        exercise.series[0].descanso = { min: '120', max: '120', fixo: true }
        const copy = duplicateExercise(exercise)

        expect(copy.series[0].descanso).toEqual(exercise.series[0].descanso)
        expect(copy.series[0].descanso).not.toBe(exercise.series[0].descanso)
    })

    it('rascunho gravado antes do descanso padrão abre com o padrão vazio', () => {
        const plan = planWithExercises([filledExercise('Supino')]) as Partial<BuilderPlan>
        delete plan.descansoPadrao
        const rawDraft = JSON.stringify({ formato: 1, origem: 'novo', salvoEm: '2026-09-01T10:00:00.000Z', plano: plan })
        const draft = parseBuilderDraft(rawDraft)

        expect(draft?.plano.descansoPadrao).toEqual({ min: '', max: '', fixo: true })
        expect(validateBuilderPlan(draft?.plano as BuilderPlan).success).toBe(true)
    })
})
