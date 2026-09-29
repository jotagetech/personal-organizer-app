import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { applyWeekToWorkout } from '@/features/workout/planWeek'
import { buildWorkoutSnapshot } from '@/features/workout/snapshot'
import { parseWorkoutPlanJson, type WorkoutPlan, type WorkoutPlanValidationResult } from '@/lib/workoutPlanSchema'
import { normalizeWorkoutSnapshot } from '@/lib/workoutSnapshotSchema'

type LooseObject = Record<string, unknown>

// Tiros de 30 s forte e 90 s leve: 6 na semana 1, 8 na 2, 10 na 3 e de volta
// a 6 na semana de redução, RPE 8 no forte.
function sprintExercise(): LooseObject {
    return {
        tipo: 'intervalado',
        id: 'tiros-bike',
        nome: 'Tiros na bike',
        modalidade: 'bike',
        rodadas: 6,
        trabalho_segundos_min: 30,
        trabalho_segundos_max: 30,
        recuperacao_segundos_min: 90,
        recuperacao_segundos_max: 90,
        rpe_alvo_min: 8,
        rpe_alvo_max: 8,
        variacoes_semana: [
            { semanas: [2], rodadas: 8 },
            { semanas: [3], rodadas: 10 },
        ],
    }
}

// Resistência: blocos de 3 a 4 min com 2 min de recuperação, sem RPE.
function enduranceExercise(): LooseObject {
    return {
        tipo: 'intervalado',
        id: 'resistencia-esteira',
        nome: 'Resistência na esteira',
        modalidade: 'esteira',
        rodadas: 4,
        trabalho_segundos_min: 180,
        trabalho_segundos_max: 240,
        recuperacao_segundos_min: 120,
        recuperacao_segundos_max: 120,
    }
}

function planWith(exercises: LooseObject[], blockWeeks: number | null = 4): LooseObject {
    return {
        versao: 2,
        nome: 'Plano com cardio',
        unidade_carga: 'kg',
        ...(blockWeeks === null ? {} : { bloco_semanas: blockWeeks }),
        treinos: [
            {
                id: 'treino-a',
                nome: 'A',
                exercicios: [
                    {
                        id: 'supino',
                        nome: 'Supino',
                        forma_carga: 'total',
                        series: [{ repeticoes_min: 8, repeticoes_max: 10 }],
                    },
                    ...exercises,
                ],
            },
        ],
    }
}

function parse(plan: LooseObject): WorkoutPlanValidationResult {
    return parseWorkoutPlanJson(JSON.stringify(plan))
}

function parsedPlan(plan: LooseObject): WorkoutPlan {
    const result = parse(plan)
    if (!result.success) {
        throw new Error(JSON.stringify(result.errors))
    }

    return result.plan
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

const INTERVAL_PATH = 'treinos[0].exercicios[1]'

describe('contrato do exercício intervalado', () => {
    it('aceita os dois casos reais ao lado de um exercício de séries', () => {
        const result = parse(planWith([sprintExercise(), enduranceExercise()]))

        expect(result.success, JSON.stringify(result.success ? null : result.errors)).toBe(true)
    })

    it('normaliza com a prescrição e uma série de tempo por rodada', () => {
        const plan = parsedPlan(planWith([sprintExercise()]))
        const [series, interval] = plan.treinos[0].exercicios

        expect(series.tipo).toBe('series')
        expect(series.intervalado).toBeNull()
        expect(interval.tipo).toBe('intervalado')
        expect(interval.intervalado).toEqual({
            modalidade: 'bike',
            rodadas: 6,
            trabalho_segundos_min: 30,
            trabalho_segundos_max: 30,
            recuperacao_segundos_min: 90,
            recuperacao_segundos_max: 90,
            rpe_alvo_min: 8,
            rpe_alvo_max: 8,
        })
        expect(interval.forma_carga).toBe('peso_corporal')
        expect(interval.series).toHaveLength(6)
        expect(interval.series[0]).toEqual({
            metrica: 'tempo',
            alvo_min: 30,
            alvo_max: 30,
            carga_sugerida: null,
            descanso_segundos_min: null,
            descanso_segundos_max: null,
            quedas: [],
        })
    })

    it('deixa o RPE alvo nulo quando a ficha não informa', () => {
        const plan = parsedPlan(planWith([enduranceExercise()]))

        expect(plan.treinos[0].exercicios[1].intervalado).toMatchObject({ rpe_alvo_min: null, rpe_alvo_max: null })
    })

    it('recusa campos de série no intervalado apontando o campo, em pt-BR', () => {
        const withSeries = { ...enduranceExercise(), series: [{ repeticoes_min: 1, repeticoes_max: 1 }] }
        const withLoad = { ...enduranceExercise(), forma_carga: 'total' }
        const withRir = { ...enduranceExercise(), rir_alvo_min: 2, rir_alvo_max: 3 }

        expect(expectFailureAt(parse(planWith([withSeries])), `${INTERVAL_PATH}.series`)).toMatch(
            /não se aplica a exercício intervalado: use rodadas/,
        )
        expect(expectFailureAt(parse(planWith([withLoad])), `${INTERVAL_PATH}.forma_carga`)).toMatch(
            /não se aplica a exercício intervalado/,
        )
        expect(expectFailureAt(parse(planWith([withRir])), `${INTERVAL_PATH}.rir_alvo_min`)).toMatch(/rpe_alvo_min/)
    })

    it('recusa um tipo desconhecido com mensagem clara', () => {
        const unknownKind = { ...enduranceExercise(), tipo: 'cardio' }
        const message = expectFailureAt(parse(planWith([unknownKind])), `${INTERVAL_PATH}.tipo`)

        expect(message).toMatch(/use "series" ou "intervalado"/)
    })

    it('exige os pares de faixa e a ordem mínimo, máximo', () => {
        const { trabalho_segundos_max: _removed, ...withoutWorkMax } = enduranceExercise()
        const reversedRecovery = { ...enduranceExercise(), recuperacao_segundos_min: 150, recuperacao_segundos_max: 120 }
        const loneRpe = { ...enduranceExercise(), rpe_alvo_min: 7 }

        expect(parse(planWith([withoutWorkMax])).success).toBe(false)
        expect(expectFailureAt(parse(planWith([reversedRecovery])), `${INTERVAL_PATH}.recuperacao_segundos_max`)).toBe(
            'deve ser maior ou igual a recuperacao_segundos_min',
        )
        expect(expectFailureAt(parse(planWith([loneRpe])), `${INTERVAL_PATH}.rpe_alvo_max`)).toBe(
            'obrigatório junto com rpe_alvo_min',
        )
    })

    it('limita o RPE alvo a 1 a 10', () => {
        const tooHigh = { ...enduranceExercise(), rpe_alvo_min: 9, rpe_alvo_max: 11 }

        expect(parse(planWith([tooHigh])).success).toBe(false)
    })

    it('valida a variação do intervalado: algo a mudar, sem campos de série e só no bloco', () => {
        const emptyVariation = { ...sprintExercise(), variacoes_semana: [{ semanas: [2] }] }
        const seriesInVariation = {
            ...sprintExercise(),
            variacoes_semana: [{ semanas: [2], rodadas: 8, series: [{ segundos_min: 30, segundos_max: 30 }] }],
        }
        const outsideBlock = { ...sprintExercise(), variacoes_semana: [{ semanas: [5], rodadas: 8 }] }
        const repeatedWeek = {
            ...sprintExercise(),
            variacoes_semana: [
                { semanas: [2], rodadas: 8 },
                { semanas: [2], rpe_alvo_min: 9, rpe_alvo_max: 9 },
            ],
        }

        expect(expectFailureAt(parse(planWith([emptyVariation])), `${INTERVAL_PATH}.variacoes_semana[0]`)).toMatch(
            /informe o que muda na semana: rodadas/,
        )
        expect(
            expectFailureAt(parse(planWith([seriesInVariation])), `${INTERVAL_PATH}.variacoes_semana[0].series`),
        ).toMatch(/não se aplica a exercício intervalado/)
        expect(
            expectFailureAt(parse(planWith([outsideBlock])), `${INTERVAL_PATH}.variacoes_semana[0].semanas[0]`),
        ).toBe('semana 5 fora do bloco de 4 semanas (bloco_semanas)')
        expect(
            expectFailureAt(parse(planWith([repeatedWeek])), `${INTERVAL_PATH}.variacoes_semana[1].semanas[0]`),
        ).toBe('a semana 2 já tem variação neste exercício')
    })

    it('exige bloco_semanas quando o intervalado tem variação', () => {
        expect(expectFailureAt(parse(planWith([sprintExercise()], null)), 'bloco_semanas')).toBe(
            'obrigatório quando o plano usa variacoes_semana ou semanas',
        )
    })

    it('o arquivo de exemplo traz os dois casos reais', () => {
        const examplePath = path.resolve(__dirname, '..', 'examples', 'plano-exemplo.json')
        const result = parseWorkoutPlanJson(readFileSync(examplePath, 'utf8'))
        if (!result.success) {
            throw new Error(JSON.stringify(result.errors))
        }
        const intervals = result.plan.treinos.flatMap((workout) =>
            workout.exercicios.filter((exercise) => exercise.tipo === 'intervalado'),
        )

        expect(intervals.map((exercise) => exercise.intervalado?.modalidade)).toEqual(['bike', 'esteira'])
    })
})

describe('intervalado por semana do bloco', () => {
    function intervalForWeek(semana: number | null) {
        const plan = parsedPlan(planWith([sprintExercise()]))

        return applyWeekToWorkout(plan.treinos[0], semana).exercicios[1]
    }

    it('troca as rodadas nas semanas com variação e volta à base nas demais', () => {
        expect([1, 2, 3, 4].map((semana) => intervalForWeek(semana).intervalado?.rodadas)).toEqual([6, 8, 10, 6])
        expect(intervalForWeek(3).series).toHaveLength(10)
        expect(intervalForWeek(null).series).toHaveLength(6)
    })

    it('mantém o que a variação não informa', () => {
        expect(intervalForWeek(2).intervalado).toMatchObject({
            trabalho_segundos_min: 30,
            recuperacao_segundos_max: 90,
            rpe_alvo_min: 8,
        })
    })

    it('troca trabalho, recuperação e RPE quando a variação informa', () => {
        const exercise = {
            ...enduranceExercise(),
            variacoes_semana: [
                {
                    semanas: [4],
                    trabalho_segundos_min: 120,
                    trabalho_segundos_max: 150,
                    recuperacao_segundos_min: 90,
                    recuperacao_segundos_max: 90,
                    rpe_alvo_min: 6,
                    rpe_alvo_max: 7,
                },
            ],
        }
        const plan = parsedPlan(planWith([exercise]))
        const resolved = applyWeekToWorkout(plan.treinos[0], 4).exercicios[1]

        expect(resolved.intervalado).toMatchObject({
            rodadas: 4,
            trabalho_segundos_min: 120,
            trabalho_segundos_max: 150,
            recuperacao_segundos_min: 90,
            rpe_alvo_min: 6,
            rpe_alvo_max: 7,
        })
        expect(resolved.series[0]).toMatchObject({ metrica: 'tempo', alvo_min: 120, alvo_max: 150 })
    })

    it('o snapshot grava o intervalado já resolvido e sobrevive à releitura', () => {
        const plan = parsedPlan(planWith([sprintExercise()]))
        const snapshot = buildWorkoutSnapshot(plan.treinos[0], { semana: 2, totalSemanas: 4, descricao: null })
        const intervalSnapshot = snapshot.exercicios[1]

        expect(intervalSnapshot.tipo).toBe('intervalado')
        expect(intervalSnapshot.intervalado).toMatchObject({ modalidade: 'bike', rodadas: 8, rpe_alvo_max: 8 })
        expect(intervalSnapshot.series.map((serie) => serie.set_index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
        expect(intervalSnapshot.series[0]).toMatchObject({ metrica: 'tempo', alvo_min: 30, alvo_max: 30 })
        expect(normalizeWorkoutSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot)
    })

    it('lê snapshot sem tipo como exercício de séries', () => {
        const plan = parsedPlan(planWith([]))
        const stored = JSON.parse(JSON.stringify(buildWorkoutSnapshot(plan.treinos[0])))
        delete stored.exercicios[0].tipo
        delete stored.exercicios[0].intervalado

        expect(normalizeWorkoutSnapshot(stored).exercicios[0]).toMatchObject({ tipo: 'series', intervalado: null })
    })
})
