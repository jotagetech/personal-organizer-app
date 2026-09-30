import { describe, expect, it } from 'vitest'

import {
    formatBlockWeeks,
    formatWorkoutWeekdays,
    groupPositionOf,
    groupWorkoutExercises,
    planExerciseLines,
    weekVariationNote,
} from '@/features/workout/planViewText'
import { parseWorkoutPlanJson, type Exercise, type WorkoutPlan } from '@/lib/workoutPlanSchema'

type LooseObject = Record<string, unknown>

function parsedPlan(document: LooseObject): WorkoutPlan {
    const result = parseWorkoutPlanJson(JSON.stringify(document))
    if (!result.success) {
        throw new Error(JSON.stringify(result.errors))
    }

    return result.plan
}

function planWith(exercises: LooseObject[], planFields: LooseObject = {}): WorkoutPlan {
    return parsedPlan({
        versao: 2,
        nome: 'Plano',
        unidade_carga: 'kg',
        ...planFields,
        treinos: [{ id: 'treino-a', nome: 'A', exercicios: exercises }],
    })
}

function exerciseOf(plan: WorkoutPlan, index = 0): Exercise {
    return plan.treinos[0].exercicios[index]
}

function simpleExercise(id: string, grupo?: string): LooseObject {
    return {
        id,
        nome: id,
        forma_carga: 'total',
        ...(grupo ? { grupo } : {}),
        series: [{ repeticoes_min: 8, repeticoes_max: 8 }],
    }
}

describe('formatBlockWeeks', () => {
    it('diz o tamanho do bloco e some quando não há bloco', () => {
        expect(formatBlockWeeks(4)).toBe('Bloco de 4 semanas')
        expect(formatBlockWeeks(1)).toBe('Bloco de 1 semana')
        expect(formatBlockWeeks(null)).toBeNull()
    })
})

describe('formatWorkoutWeekdays', () => {
    it('usa os rótulos curtos na ordem da ficha', () => {
        expect(formatWorkoutWeekdays(['segunda', 'quarta', 'sabado'])).toBe('Seg, Qua, Sáb')
    })

    it('devolve null sem dias', () => {
        expect(formatWorkoutWeekdays(undefined)).toBeNull()
        expect(formatWorkoutWeekdays([])).toBeNull()
    })
})

describe('planExerciseLines', () => {
    const supino = {
        id: 'supino',
        nome: 'Supino',
        forma_carga: 'total',
        rir_alvo_min: 1,
        rir_alvo_max: 2,
        descanso_segundos_min: 90,
        descanso_segundos_max: 120,
        series: [
            { repeticoes_min: 8, repeticoes_max: 10, carga_sugerida: 60 },
            { repeticoes_min: 5, repeticoes_max: 6, descanso_segundos_min: 180, descanso_segundos_max: 180 },
        ],
    }

    it('monta carga, alvo, RIR e descanso de cada série', () => {
        const plan = planWith([supino])
        const lines = planExerciseLines(exerciseOf(plan), plan)

        expect(lines.map((line) => line.label)).toEqual(['Série 1', 'Série 2'])
        expect(lines[0].value).toBe('60 kg × 8 a 10 reps')
        expect(lines[0].details).toEqual(['RIR alvo 1 a 2', 'Descanso 90 a 120 s'])
        expect(lines[1].value).toBe('5 a 6 reps')
        expect(lines[1].details).toEqual(['RIR alvo 1 a 2', 'Descanso 180 s'])
    })

    it('herda o descanso padrão do plano quando nem a série nem o exercício têm', () => {
        const plan = planWith([simpleExercise('remada')], {
            descanso_padrao_segundos_min: 60,
            descanso_padrao_segundos_max: 75,
        })

        expect(planExerciseLines(exerciseOf(plan), plan)[0].details).toEqual(['Descanso 60 a 75 s'])
    })

    it('diz a convenção da carga e o lado nas séries unilaterais', () => {
        const plan = planWith([
            {
                id: 'rosca',
                nome: 'Rosca',
                forma_carga: 'por_halter',
                por_lado: true,
                series: [{ repeticoes_min: 8, repeticoes_max: 8, carga_sugerida: 12.5 }],
            },
        ])

        expect(planExerciseLines(exerciseOf(plan), plan)[0].value).toBe('12,5 kg por halter × 8 reps por lado')
    })

    it('mostra tempo e distância com a unidade da métrica', () => {
        const plan = planWith([
            { id: 'prancha', nome: 'Prancha', forma_carga: 'peso_corporal', series: [{ segundos_min: 30, segundos_max: 45 }] },
            { id: 'farmer', nome: 'Farmer', forma_carga: 'total', series: [{ metros_min: 20, metros_max: 20, carga_sugerida: 24 }] },
        ])

        expect(planExerciseLines(exerciseOf(plan, 0), plan)[0].value).toBe('30 a 45 s')
        expect(planExerciseLines(exerciseOf(plan, 1), plan)[0].value).toBe('24 kg × 20 m')
    })

    it('resume o intervalado numa linha, sem descanso de ficha', () => {
        const plan = planWith(
            [
                {
                    id: 'bike',
                    nome: 'Bike',
                    tipo: 'intervalado',
                    modalidade: 'bike',
                    rodadas: 8,
                    trabalho_segundos_min: 30,
                    trabalho_segundos_max: 30,
                    recuperacao_segundos_min: 90,
                    recuperacao_segundos_max: 90,
                    rpe_alvo_min: 8,
                    rpe_alvo_max: 8,
                },
            ],
            { descanso_padrao_segundos_min: 60, descanso_padrao_segundos_max: 60 },
        )

        expect(planExerciseLines(exerciseOf(plan), plan)).toEqual([
            { label: 'Rodadas', value: '8 × 30 s / 90 s', drops: [], details: ['RPE 8'] },
        ])
    })
})

describe('weekVariationNote', () => {
    it('lista as semanas em que a prescrição muda', () => {
        const plan = planWith(
            [
                {
                    ...simpleExercise('agachamento'),
                    variacoes_semana: [
                        { semanas: [3, 4], series: [{ repeticoes_min: 5, repeticoes_max: 5 }] },
                        { semanas: [2], series: [{ repeticoes_min: 6, repeticoes_max: 6 }] },
                    ],
                },
            ],
            { bloco_semanas: 4 },
        )

        expect(weekVariationNote(exerciseOf(plan))).toBe('Prescrição diferente nas semanas 2, 3, 4')
    })

    it('devolve null sem variação', () => {
        const plan = planWith([simpleExercise('a')])

        expect(weekVariationNote(exerciseOf(plan))).toBeNull()
    })
})

describe('groupWorkoutExercises', () => {
    it('junta vizinhos do mesmo grupo e rotula pelo tamanho', () => {
        const plan = planWith([
            simpleExercise('a'),
            simpleExercise('b', 'g1'),
            simpleExercise('c', 'g1'),
            simpleExercise('d', 'g2'),
            simpleExercise('e', 'g2'),
            simpleExercise('f', 'g2'),
        ])
        const blocks = groupWorkoutExercises(plan.treinos[0].exercicios)

        expect(blocks.map((block) => [block.groupLabel, block.exercises.map((exercise) => exercise.id)])).toEqual([
            [null, ['a']],
            ['Bi-set', ['b', 'c']],
            ['Tri-set', ['d', 'e', 'f']],
        ])
    })

    it('rótulo sozinho vale como exercício avulso', () => {
        const plan = planWith([simpleExercise('a'), simpleExercise('b')])
        const [first, second] = plan.treinos[0].exercicios
        const blocks = groupWorkoutExercises([{ ...first, grupo: 'g1' }, second, { ...first, id: 'c', grupo: 'g1' }])

        expect(blocks.map((block) => block.groupLabel)).toEqual([null, null, null])
    })
})

describe('descanso em grupo', () => {
    function restOf(exercise: Exercise, plan: WorkoutPlan, group: ReturnType<typeof groupPositionOf>): string[][] {
        return planExerciseLines(exercise, plan, group).map((line) => line.details)
    }

    it('só a série que fecha a rodada mostra descanso; as outras dizem sem descanso', () => {
        const withRest = (id: string, sets: number, grupo: string): LooseObject => ({
            ...simpleExercise(id, grupo),
            descanso_segundos_min: 60,
            descanso_segundos_max: 60,
            series: Array.from({ length: sets }, () => ({ repeticoes_min: 8, repeticoes_max: 8 })),
        })
        const plan = planWith([withRest('a', 3, 'g1'), withRest('b', 2, 'g1')])
        const [block] = groupWorkoutExercises(plan.treinos[0].exercicios)
        const [first, second] = block.exercises

        expect(restOf(first, plan, groupPositionOf(block, 0))).toEqual([
            ['sem descanso'],
            ['sem descanso'],
            ['Descanso 60 s'],
        ])
        expect(restOf(second, plan, groupPositionOf(block, 1))).toEqual([['Descanso 60 s'], ['Descanso 60 s']])
    })

    it('exercício avulso mantém o descanso em toda série', () => {
        const plan = planWith([{ ...simpleExercise('a'), descanso_segundos_min: 45, descanso_segundos_max: 45 }])

        expect(planExerciseLines(exerciseOf(plan), plan)[0].details).toEqual(['Descanso 45 s'])
    })
})
