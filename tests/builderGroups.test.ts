import { describe, expect, it } from 'vitest'

import { builderPlanFromWorkoutPlan, builderPlanToDocument } from '@/features/workout/builder/builderDocument'
import { parseBuilderDraft, serializeBuilderDraft } from '@/features/workout/builder/builderDraft'
import {
    canGroupWithNext,
    groupRunsOf,
    groupWithNext,
    normalizeGroups,
    ungroupAt,
} from '@/features/workout/builder/builderGroups'
import { createEmptyPlan, createExercise, moveItem, removeAt } from '@/features/workout/builder/builderState'
import type { BuilderExercise, BuilderPlan } from '@/features/workout/builder/builderTypes'
import { candidateFieldIds, validateBuilderPlan } from '@/features/workout/builder/builderValidation'
import { validateWorkoutPlanDocument } from '@/lib/workoutPlanSchema'

function exercise(nome: string, grupo: string | null = null): BuilderExercise {
    const created = createExercise()
    created.nome = nome
    created.grupo = grupo
    created.series[0].alvo = { min: '8', max: '12', fixo: false }

    return created
}

function interval(nome: string): BuilderExercise {
    const created = exercise(nome)
    created.tipo = 'intervalado'
    created.modalidade = 'bike'
    created.rodadas = '4'
    created.trabalho = { min: '30', max: '30', fixo: true }
    created.recuperacao = { min: '60', max: '60', fixo: true }

    return created
}

function planWith(exercises: BuilderExercise[]): BuilderPlan {
    const plan = createEmptyPlan()
    plan.nome = 'Plano de teste'
    plan.treinos[0].exercicios = exercises

    return plan
}

function groupsOf(exercises: BuilderExercise[]): (string | null)[] {
    return exercises.map((item) => item.grupo)
}

describe('agrupar com o próximo', () => {
    it('cria um grupo com rótulo gerado para dois exercícios sem grupo', () => {
        const list = groupWithNext([exercise('A'), exercise('B'), exercise('C')], 0)

        expect(list[0].grupo).toBe('grupo-1')
        expect(list[1].grupo).toBe('grupo-1')
        expect(list[2].grupo).toBeNull()
    })

    it('o rótulo gerado não repete um que já existe no treino', () => {
        const list = groupWithNext([exercise('A', 'grupo-1'), exercise('B', 'grupo-1'), exercise('C'), exercise('D')], 2)

        expect(groupsOf(list)).toEqual(['grupo-1', 'grupo-1', 'grupo-2', 'grupo-2'])
    })

    it('entra no grupo do vizinho quando só um dos dois tem grupo', () => {
        const withNext = groupWithNext([exercise('A', 'g'), exercise('B', 'g'), exercise('C')], 1)
        const withPrevious = groupWithNext([exercise('A'), exercise('B', 'g'), exercise('C', 'g')], 0)

        expect(groupsOf(withNext)).toEqual(['g', 'g', 'g'])
        expect(groupsOf(withPrevious)).toEqual(['g', 'g', 'g'])
    })

    it('junta dois grupos vizinhos num só', () => {
        const list = groupWithNext([exercise('A', 'x'), exercise('B', 'x'), exercise('C', 'y'), exercise('D', 'y')], 1)

        expect(groupsOf(list)).toEqual(['x', 'x', 'x', 'x'])
    })

    it('não agrupa o último, nem com intervalado, nem quem já está junto', () => {
        const list = [exercise('A'), interval('Bike'), exercise('B', 'g'), exercise('C', 'g')]

        expect(canGroupWithNext(list, 0)).toBe(false)
        expect(canGroupWithNext(list, 1)).toBe(false)
        expect(canGroupWithNext(list, 2)).toBe(false)
        expect(canGroupWithNext(list, 3)).toBe(false)
        expect(groupWithNext(list, 0)).toBe(list)
    })
})

describe('desagrupar', () => {
    it('um grupo que fica com um membro some', () => {
        const list = ungroupAt([exercise('A', 'g'), exercise('B', 'g')], 0)

        expect(groupsOf(list)).toEqual([null, null])
    })

    it('tirar do meio de um grupo de três não deixa ninguém sozinho', () => {
        const list = ungroupAt([exercise('A', 'g'), exercise('B', 'g'), exercise('C', 'g')], 1)

        expect(groupsOf(list)).toEqual([null, null, null])
    })

    it('tirar do meio de um grupo de cinco mantém os dois trechos com rótulos diferentes', () => {
        const members = ['A', 'B', 'C', 'D', 'E'].map((nome) => exercise(nome, 'g'))
        const list = ungroupAt(members, 2)

        expect(groupsOf(list)).toEqual(['g', 'g', null, 'grupo-1', 'grupo-1'])
    })

    it('tirar da ponta mantém o resto do grupo', () => {
        const list = ungroupAt([exercise('A', 'g'), exercise('B', 'g'), exercise('C', 'g')], 2)

        expect(groupsOf(list)).toEqual(['g', 'g', null])
    })
})

describe('reordenar, remover e trocar o tipo', () => {
    it('trocar de lugar dentro do grupo mantém o grupo', () => {
        const list = normalizeGroups(moveItem([exercise('A', 'g'), exercise('B', 'g'), exercise('C', 'g')], 0, 1))

        expect(groupsOf(list)).toEqual(['g', 'g', 'g'])
    })

    it('sair de um par pela ponta desfaz o par', () => {
        const list = normalizeGroups(moveItem([exercise('A', 'g'), exercise('B', 'g'), exercise('C')], 1, 1))

        expect(list.map((item) => item.nome)).toEqual(['A', 'C', 'B'])
        expect(groupsOf(list)).toEqual([null, null, null])
    })

    it('um exercício de fora que entra no meio do grupo nunca deixa grupo quebrado', () => {
        const list = normalizeGroups(
            moveItem([exercise('A', 'g'), exercise('B', 'g'), exercise('C', 'g'), exercise('D')], 3, -1),
        )
        const groupedRuns = groupRunsOf(list).filter((run) => run.grupo !== null)

        expect(list.map((item) => item.nome)).toEqual(['A', 'B', 'D', 'C'])
        expect(groupedRuns).toEqual([{ grupo: 'g', start: 0, end: 1 }])
        expect(list[3].grupo).toBeNull()
    })

    it('remover um membro do meio mantém o grupo, e de um par dissolve o outro', () => {
        const threeMembers = normalizeGroups(removeAt([exercise('A', 'g'), exercise('B', 'g'), exercise('C', 'g')], 1))
        const pair = normalizeGroups(removeAt([exercise('A', 'g'), exercise('B', 'g'), exercise('C')], 0))

        expect(groupsOf(threeMembers)).toEqual(['g', 'g'])
        expect(groupsOf(pair)).toEqual([null, null])
    })

    it('virar intervalado tira o exercício do grupo e dissolve o que ficou sozinho', () => {
        const list = [exercise('A', 'g'), exercise('B', 'g')]
        list[1] = { ...list[1], tipo: 'intervalado' }

        expect(groupsOf(normalizeGroups(list))).toEqual([null, null])
    })

    it('o mesmo rótulo em trechos separados vira dois grupos', () => {
        const list = normalizeGroups([
            exercise('A', 'g'),
            exercise('B', 'g'),
            exercise('C'),
            exercise('D', 'g'),
            exercise('E', 'g'),
        ])

        expect(groupsOf(list)).toEqual(['g', 'g', null, 'grupo-1', 'grupo-1'])
    })
})

describe('grupo no documento, no rascunho e na validação', () => {
    it('o grupo vai para o arquivo só nos membros e o plano é válido', () => {
        const plan = planWith([exercise('A'), exercise('B', 'g'), exercise('C', 'g')])
        const document = builderPlanToDocument(plan) as { treinos: { exercicios: { grupo?: string }[] }[] }

        expect(document.treinos[0].exercicios.map((item) => item.grupo)).toEqual([undefined, 'g', 'g'])
        expect(validateBuilderPlan(plan).success).toBe(true)
    })

    it('carregar, converter e voltar mantém o grupo', () => {
        const plan = planWith([exercise('A', 'g'), exercise('B', 'g'), exercise('C')])
        const validated = validateWorkoutPlanDocument(builderPlanToDocument(plan))
        if (!validated.success) {
            throw new Error(JSON.stringify(validated.errors))
        }
        const reloaded = builderPlanFromWorkoutPlan(validated.plan)

        expect(groupsOf(reloaded.treinos[0].exercicios)).toEqual(['g', 'g', null])
        expect(builderPlanToDocument(reloaded)).toEqual(builderPlanToDocument(plan))
    })

    it('o rascunho guarda o grupo e um rascunho antigo sem o campo vale como sem grupo', () => {
        const plan = planWith([exercise('A', 'g'), exercise('B', 'g')])
        const serialized = serializeBuilderDraft(plan, 'novo', new Date(0))
        const restored = parseBuilderDraft(serialized)

        expect(groupsOf(restored?.plano.treinos[0].exercicios ?? [])).toEqual(['g', 'g'])

        const legacy = JSON.parse(serialized)
        legacy.plano.treinos[0].exercicios.forEach((item: Record<string, unknown>) => delete item.grupo)
        const restoredLegacy = parseBuilderDraft(JSON.stringify(legacy))

        expect(groupsOf(restoredLegacy?.plano.treinos[0].exercicios ?? [])).toEqual([null, null])
    })

    it('erro de grupo aponta o exercício e o campo de grupo, em português', () => {
        const plan = planWith([exercise('A', 'g'), exercise('B')])
        const result = validateBuilderPlan(plan)
        if (result.success) {
            throw new Error('o plano com grupo de um exercício só deveria ser recusado')
        }
        const issue = result.issues[0]

        expect(issue.fieldPath).toEqual(['treinos', 0, 'exercicios', 0, 'grupo'])
        expect(issue.exerciseUid).toBe(plan.treinos[0].exercicios[0].uid)
        expect(issue.mensagem).toBe('um grupo precisa de pelo menos 2 exercícios')
        expect(issue.local).toContain('grupo')
        expect(candidateFieldIds(issue.fieldPath)[0]).toBe('plano-treinos-0-exercicios-0-grupo')
    })

    it('grupo com um exercício no meio é recusado e explicado em português', () => {
        const plan = planWith([exercise('A', 'g'), exercise('B'), exercise('C', 'g')])
        const result = validateBuilderPlan(plan)
        if (result.success) {
            throw new Error('o grupo quebrado deveria ser recusado')
        }

        expect(result.issues[0].mensagem).toBe('os exercícios do grupo precisam ficar um depois do outro')
        expect(result.issues[0].fieldPath).toEqual(['treinos', 0, 'exercicios', 2, 'grupo'])
    })
})
