import { describe, expect, it } from 'vitest'

import {
    planDefaultRest,
    resolveEffectiveRest,
    restRangeOf,
    snapshotSetRest,
    type RestLayers,
} from '@/features/workout/restPrescription'
import { buildWorkoutSnapshot } from '@/features/workout/snapshot'
import { parseWorkoutPlanJson, type WorkoutPlan } from '@/lib/workoutPlanSchema'
import { normalizeWorkoutSnapshot } from '@/lib/workoutSnapshotSchema'

const SET_REST = { min: 180, max: 180 }
const WEEK_REST = { min: 45, max: 60 }
const EXERCISE_REST = { min: 90, max: 120 }
const PLAN_REST = { min: 60, max: 90 }

const NO_LAYERS: RestLayers = {
    tipo: 'series',
    serie: null,
    variacaoSemana: null,
    exercicio: null,
    padraoPlano: null,
}

type LooseObject = Record<string, unknown>

function parsedPlan(document: LooseObject): WorkoutPlan {
    const result = parseWorkoutPlanJson(JSON.stringify(document))
    if (!result.success) {
        throw new Error(JSON.stringify(result.errors))
    }

    return result.plan
}

// Supino com descanso próprio e uma última série mais longa, remada sem
// descanso nenhum (herda o padrão) e um intervalado, que nunca herda.
function planDocument(planFields: LooseObject = {}): LooseObject {
    return {
        versao: 2,
        nome: 'Plano',
        unidade_carga: 'kg',
        bloco_semanas: 4,
        ...planFields,
        treinos: [
            {
                id: 'treino-a',
                nome: 'A',
                exercicios: [
                    {
                        id: 'supino',
                        nome: 'Supino',
                        forma_carga: 'total',
                        descanso_segundos_min: 90,
                        descanso_segundos_max: 120,
                        series: [
                            { repeticoes_min: 8, repeticoes_max: 10 },
                            { repeticoes_min: 5, repeticoes_max: 6, descanso_segundos_min: 180, descanso_segundos_max: 180 },
                        ],
                        variacoes_semana: [{ semanas: [4], descanso_segundos_min: 45, descanso_segundos_max: 60 }],
                    },
                    {
                        id: 'remada',
                        nome: 'Remada',
                        forma_carga: 'total',
                        series: [
                            { repeticoes_min: 10, repeticoes_max: 12 },
                            { repeticoes_min: 10, repeticoes_max: 12, descanso_segundos_min: 90, descanso_segundos_max: 90 },
                        ],
                    },
                    {
                        tipo: 'intervalado',
                        id: 'tiros',
                        nome: 'Tiros',
                        modalidade: 'bike',
                        rodadas: 2,
                        trabalho_segundos_min: 30,
                        trabalho_segundos_max: 30,
                        recuperacao_segundos_min: 90,
                        recuperacao_segundos_max: 90,
                    },
                ],
            },
        ],
    }
}

const WITH_PLAN_DEFAULT = { descanso_padrao_segundos_min: 60, descanso_padrao_segundos_max: 90 }

function snapshotFor(plan: WorkoutPlan, semana: number | null) {
    const planWeek = semana === null ? null : { semana, totalSemanas: 4, volta: 1, descricao: null }
    const snapshot = buildWorkoutSnapshot(plan.treinos[0], planWeek, planDefaultRest(plan))

    return snapshot
}

describe('resolveEffectiveRest', () => {
    it('série vence variação, exercício e padrão', () => {
        const layers = {
            ...NO_LAYERS,
            serie: SET_REST,
            variacaoSemana: WEEK_REST,
            exercicio: EXERCISE_REST,
            padraoPlano: PLAN_REST,
        }

        expect(resolveEffectiveRest(layers)).toEqual(SET_REST)
    })

    it('sem série, a variação da semana vence exercício e padrão', () => {
        const layers = { ...NO_LAYERS, variacaoSemana: WEEK_REST, exercicio: EXERCISE_REST, padraoPlano: PLAN_REST }

        expect(resolveEffectiveRest(layers)).toEqual(WEEK_REST)
    })

    it('sem série nem variação, o exercício vence o padrão', () => {
        const layers = { ...NO_LAYERS, exercicio: EXERCISE_REST, padraoPlano: PLAN_REST }

        expect(resolveEffectiveRest(layers)).toEqual(EXERCISE_REST)
    })

    it('só com o padrão do plano, vale o padrão', () => {
        expect(resolveEffectiveRest({ ...NO_LAYERS, padraoPlano: PLAN_REST })).toEqual(PLAN_REST)
    })

    it('série vale mesmo sem nada acima dela', () => {
        expect(resolveEffectiveRest({ ...NO_LAYERS, serie: SET_REST })).toEqual(SET_REST)
    })

    it('sem nenhuma camada, não há descanso', () => {
        expect(resolveEffectiveRest(NO_LAYERS)).toBeNull()
    })

    it('intervalado ignora todas as camadas, inclusive o padrão do plano', () => {
        const layers = { ...NO_LAYERS, tipo: 'intervalado' as const, serie: SET_REST, padraoPlano: PLAN_REST }

        expect(resolveEffectiveRest(layers)).toBeNull()
    })

    it('faixa pela metade conta como ausente', () => {
        expect(restRangeOf({ descanso_segundos_min: 60, descanso_segundos_max: null })).toBeNull()
        expect(restRangeOf(null)).toBeNull()
        expect(restRangeOf({ descanso_segundos_min: 0, descanso_segundos_max: 0 })).toEqual({ min: 0, max: 0 })
    })
})

describe('snapshot com descanso resolvido', () => {
    it('exercício sem descanso herda o padrão do plano e a série própria fica gravada', () => {
        const snapshot = snapshotFor(parsedPlan(planDocument(WITH_PLAN_DEFAULT)), null)
        const [benchPress, row] = snapshot.exercicios

        expect(benchPress).toMatchObject({ descanso_segundos_min: 90, descanso_segundos_max: 120 })
        expect(benchPress.series[0]).toMatchObject({ descanso_segundos_min: null, descanso_segundos_max: null })
        expect(benchPress.series[1]).toMatchObject({ descanso_segundos_min: 180, descanso_segundos_max: 180 })
        expect(row).toMatchObject({ descanso_segundos_min: 60, descanso_segundos_max: 90 })
        expect(row.series[1]).toMatchObject({ descanso_segundos_min: 90, descanso_segundos_max: 90 })
    })

    it('a variação da semana ativa troca o descanso do exercício, mas não o da série', () => {
        const snapshot = snapshotFor(parsedPlan(planDocument(WITH_PLAN_DEFAULT)), 4)
        const [benchPress] = snapshot.exercicios

        expect(benchPress).toMatchObject({ descanso_segundos_min: 45, descanso_segundos_max: 60 })
        expect(snapshotSetRest(benchPress, benchPress.series[0])).toEqual(WEEK_REST)
        expect(snapshotSetRest(benchPress, benchPress.series[1])).toEqual(SET_REST)
    })

    it('semana sem variação usa o descanso do exercício', () => {
        const [benchPress] = snapshotFor(parsedPlan(planDocument(WITH_PLAN_DEFAULT)), 2).exercicios

        expect(snapshotSetRest(benchPress, benchPress.series[0])).toEqual(EXERCISE_REST)
    })

    it('intervalado não recebe o padrão do plano', () => {
        const [, , sprints] = snapshotFor(parsedPlan(planDocument(WITH_PLAN_DEFAULT)), null).exercicios

        expect(sprints).toMatchObject({ descanso_segundos_min: null, descanso_segundos_max: null })
        sprints.series.forEach((round) => expect(snapshotSetRest(sprints, round)).toBeNull())
    })

    it('série com o mesmo descanso do exercício não grava cópia', () => {
        const document = planDocument(WITH_PLAN_DEFAULT)
        const [, row] = snapshotFor(parsedPlan(document), null).exercicios
        const sameAsDefault = { ...WITH_PLAN_DEFAULT, descanso_padrao_segundos_min: 90, descanso_padrao_segundos_max: 90 }
        const [, rowWithSameDefault] = snapshotFor(parsedPlan(planDocument(sameAsDefault)), null).exercicios

        expect(row.series[1].descanso_segundos_min).toBe(90)
        expect(rowWithSameDefault.series[1]).toMatchObject({ descanso_segundos_min: null, descanso_segundos_max: null })
    })

    it('plano sem padrão fica como antes: exercício sem descanso segue sem descanso', () => {
        const [, row] = snapshotFor(parsedPlan(planDocument()), null).exercicios

        expect(row).toMatchObject({ descanso_segundos_min: null, descanso_segundos_max: null })
        expect(snapshotSetRest(row, row.series[0])).toBeNull()
        expect(snapshotSetRest(row, row.series[1])).toEqual({ min: 90, max: 90 })
    })

    it('o snapshot gravado não muda quando o plano muda depois', () => {
        const stored = JSON.parse(JSON.stringify(snapshotFor(parsedPlan(planDocument(WITH_PLAN_DEFAULT)), null)))
        const reread = normalizeWorkoutSnapshot(stored)

        expect(reread.exercicios[1]).toMatchObject({ descanso_segundos_min: 60, descanso_segundos_max: 90 })
        expect(reread.exercicios[0].series[1]).toMatchObject({ descanso_segundos_min: 180, descanso_segundos_max: 180 })
    })

    it('snapshot antigo sem descanso na série lê o descanso do exercício', () => {
        const stored = JSON.parse(JSON.stringify(snapshotFor(parsedPlan(planDocument()), null)))
        const [storedBenchPress] = stored.exercicios
        storedBenchPress.series.forEach((set: LooseObject) => {
            delete set.descanso_segundos_min
            delete set.descanso_segundos_max
        })
        const [benchPress] = normalizeWorkoutSnapshot(stored).exercicios

        expect(benchPress.series[1]).toMatchObject({ descanso_segundos_min: null, descanso_segundos_max: null })
        benchPress.series.forEach((set) => expect(snapshotSetRest(benchPress, set)).toEqual(EXERCISE_REST))
    })
})
