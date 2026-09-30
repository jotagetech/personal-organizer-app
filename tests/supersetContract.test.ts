import { describe, expect, it } from 'vitest'

import { collectExtraSuggestions } from '@/features/workout/extraExercises'
import { buildWorkoutSnapshot } from '@/features/workout/snapshot'
import { parseWorkoutPlanJson, type WorkoutPlan, type WorkoutPlanValidationResult } from '@/lib/workoutPlanSchema'
import { normalizeWorkoutSnapshot } from '@/lib/workoutSnapshotSchema'

type LooseObject = Record<string, unknown>

function seriesExercise(id: string, grupo?: string): LooseObject {
    return {
        id,
        nome: id,
        forma_carga: 'total',
        series: [
            { repeticoes_min: 8, repeticoes_max: 12 },
            { repeticoes_min: 8, repeticoes_max: 12 },
        ],
        ...(grupo === undefined ? {} : { grupo }),
    }
}

function intervalExercise(grupo?: string): LooseObject {
    return {
        tipo: 'intervalado',
        id: 'tiros',
        nome: 'Tiros',
        modalidade: 'bike',
        rodadas: 4,
        trabalho_segundos_min: 30,
        trabalho_segundos_max: 30,
        recuperacao_segundos_min: 60,
        recuperacao_segundos_max: 60,
        ...(grupo === undefined ? {} : { grupo }),
    }
}

function planWith(exercises: LooseObject[]): LooseObject {
    return {
        versao: 2,
        nome: 'Plano com bi-set',
        unidade_carga: 'kg',
        treinos: [{ id: 'treino-a', nome: 'A', exercicios: exercises }],
    }
}

function parse(plan: LooseObject): WorkoutPlanValidationResult {
    return parseWorkoutPlanJson(JSON.stringify(plan))
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

function parsedPlan(plan: LooseObject): WorkoutPlan {
    const result = parse(plan)
    if (!result.success) {
        throw new Error(JSON.stringify(result.errors))
    }

    return result.plan
}

describe('grupo no contrato do plano', () => {
    it('aceita um bi-set em sequência e normaliza o rótulo sem espaços nas pontas', () => {
        const plan = parsedPlan(
            planWith([seriesExercise('supino', ' A '), seriesExercise('remada', 'A'), seriesExercise('rosca')]),
        )

        expect(plan.treinos[0].exercicios.map((exercicio) => exercicio.grupo)).toEqual(['A', 'A', null])
    })

    it('aceita dois grupos diferentes lado a lado', () => {
        const result = parse(
            planWith([
                seriesExercise('supino', 'A'),
                seriesExercise('remada', 'A'),
                seriesExercise('rosca', 'B'),
                seriesExercise('triceps', 'B'),
                seriesExercise('elevacao', 'B'),
            ]),
        )

        expect(result.success).toBe(true)
    })

    it('recusa membros fora de sequência apontando o primeiro que quebra a sequência', () => {
        const result = parse(
            planWith([seriesExercise('supino', 'A'), seriesExercise('rosca'), seriesExercise('remada', 'A')]),
        )

        expect(expectFailureAt(result, 'treinos[0].exercicios[2].grupo')).toBe(
            'os exercícios do grupo "A" devem ficar em sequência no treino',
        )
    })

    it('recusa grupo com um exercício só', () => {
        const result = parse(planWith([seriesExercise('supino', 'A'), seriesExercise('remada')]))

        expect(expectFailureAt(result, 'treinos[0].exercicios[0].grupo')).toBe(
            'o grupo "A" precisa de pelo menos 2 exercícios',
        )
    })

    it('recusa grupo no intervalado como os demais campos que não se aplicam a ele', () => {
        const result = parse(planWith([seriesExercise('supino', 'A'), intervalExercise('A')]))

        expect(expectFailureAt(result, 'treinos[0].exercicios[1].grupo')).toBe(
            'não se aplica a exercício intervalado: bi-set, tri-set e circuito são só entre exercícios de séries',
        )
    })

    it('recusa rótulo vazio ou com mais de 40 caracteres', () => {
        const blank = parse(planWith([seriesExercise('supino', '  '), seriesExercise('remada', '  ')]))
        const tooLong = 'x'.repeat(41)
        const long = parse(planWith([seriesExercise('supino', tooLong), seriesExercise('remada', tooLong)]))

        expectFailureAt(blank, 'treinos[0].exercicios[0].grupo')
        expectFailureAt(long, 'treinos[0].exercicios[0].grupo')
    })
})

describe('grupo no snapshot', () => {
    const groupedPlan = () =>
        parsedPlan(planWith([seriesExercise('supino', 'A'), seriesExercise('remada', 'A'), seriesExercise('rosca')]))

    it('copia o grupo só nos exercícios agrupados', () => {
        const snapshot = buildWorkoutSnapshot(groupedPlan().treinos[0])

        expect(snapshot.exercicios.map((exercicio) => exercicio.grupo)).toEqual(['A', 'A', undefined])
        expect('grupo' in snapshot.exercicios[2]).toBe(false)
    })

    it('mantém o grupo ao reler o snapshot e aceita snapshot antigo sem o campo', () => {
        const snapshot = buildWorkoutSnapshot(groupedPlan().treinos[0])
        const reread = normalizeWorkoutSnapshot(JSON.parse(JSON.stringify(snapshot)))
        const { grupo: _grupo, ...withoutGroup } = snapshot.exercicios[0]
        const oldSnapshot = normalizeWorkoutSnapshot({ ...snapshot, exercicios: [withoutGroup] })

        expect(reread.exercicios.map((exercicio) => exercicio.grupo)).toEqual(['A', 'A', undefined])
        expect(oldSnapshot.exercicios[0].grupo).toBeUndefined()
    })

    it('sugere o exercício de um grupo como extra sem o grupo', () => {
        const plan = parsedPlan({
            ...planWith([seriesExercise('rosca')]),
            treinos: [
                { id: 'treino-a', nome: 'A', exercicios: [seriesExercise('rosca')] },
                {
                    id: 'treino-b',
                    nome: 'B',
                    exercicios: [seriesExercise('supino', 'A'), seriesExercise('remada', 'A')],
                },
            ],
        })
        const suggestions = collectExtraSuggestions({
            plan,
            planWeek: null,
            pastSessions: [],
            todaySnapshot: buildWorkoutSnapshot(plan.treinos[0]),
        })

        expect(suggestions.map((suggestion) => suggestion.exercise.exercise_key)).toEqual(['supino', 'remada'])
        suggestions.forEach((suggestion) => {
            expect(suggestion.exercise.extra).toBe(true)
            expect('grupo' in suggestion.exercise).toBe(false)
        })
    })
})
