import { describe, expect, it } from 'vitest'

import { cycleWeekOn } from '@/features/cycle/cycleProgress'
import { applyWeekToWorkout, formatPlanWeekLabel, resolvePlanWeek } from '@/features/workout/planWeek'
import { buildWorkoutSnapshot } from '@/features/workout/snapshot'
import { parseWorkoutPlanJson, type WorkoutPlan } from '@/lib/workoutPlanSchema'
import { normalizeWorkoutSnapshot } from '@/lib/workoutSnapshotSchema'

const CYCLE_START = '2026-09-07'

const repsSet = (repsMin: number, repsMax: number, suggestedLoadKg?: number) => ({
    repeticoes_min: repsMin,
    repeticoes_max: repsMax,
    ...(suggestedLoadKg === undefined ? {} : { carga_sugerida: suggestedLoadKg }),
})

// Bloco de 4 semanas: calibração, mais repetições com a mesma carga, mais
// carga e redução de volume (4 séries viram 3, 3 viram 2).
const BLOCK_PLAN = {
    versao: 2,
    nome: 'Bloco de 4 semanas',
    unidade_carga: 'kg',
    bloco_semanas: 4,
    semanas: [
        { semana: 1, descricao: 'Calibração' },
        { semana: 4, descricao: 'Redução de volume' },
    ],
    treinos: [
        {
            id: 'treino-a',
            nome: 'A',
            exercicios: [
                {
                    id: 'agachamento',
                    nome: 'Agachamento',
                    forma_carga: 'total',
                    descanso_segundos_min: 120,
                    descanso_segundos_max: 180,
                    rir_alvo_min: 2,
                    rir_alvo_max: 3,
                    series: [repsSet(6, 8, 80), repsSet(6, 8, 80), repsSet(6, 8, 80), repsSet(6, 8, 80)],
                    variacoes_semana: [
                        { semanas: [2], series: [repsSet(8, 10, 80), repsSet(8, 10, 80), repsSet(8, 10, 80), repsSet(8, 10, 80)] },
                        { semanas: [3], series: [repsSet(6, 8, 82.5), repsSet(6, 8, 82.5), repsSet(6, 8, 82.5), repsSet(6, 8, 82.5)] },
                        { semanas: [4], series: [repsSet(6, 8, 80), repsSet(6, 8, 80), repsSet(6, 8, 80)], rir_alvo_min: 3, rir_alvo_max: 4 },
                    ],
                },
                {
                    id: 'remada',
                    nome: 'Remada',
                    forma_carga: 'por_halter',
                    series: [repsSet(10, 12), repsSet(10, 12), repsSet(10, 12)],
                    variacoes_semana: [{ semanas: [4], series: [repsSet(10, 12), repsSet(10, 12)] }],
                },
            ],
        },
    ],
}

function parseBlockPlan(): WorkoutPlan {
    const result = parseWorkoutPlanJson(JSON.stringify(BLOCK_PLAN))
    if (!result.success) {
        throw new Error(JSON.stringify(result.errors))
    }

    return result.plan
}

describe('cycleWeekOn', () => {
    it('conta dias 1 a 7 como semana 1 e o dia 8 como semana 2', () => {
        expect(cycleWeekOn(CYCLE_START, '2026-09-07')).toBe(1)
        expect(cycleWeekOn(CYCLE_START, '2026-09-13')).toBe(1)
        expect(cycleWeekOn(CYCLE_START, '2026-09-14')).toBe(2)
    })

    it('não tem semana antes do início do ciclo', () => {
        expect(cycleWeekOn(CYCLE_START, '2026-09-06')).toBeNull()
    })
})

describe('resolvePlanWeek', () => {
    it('devolve a semana do bloco com a descrição dela', () => {
        const plan = parseBlockPlan()

        expect(resolvePlanWeek(plan, CYCLE_START, '2026-09-07')).toEqual({
            semana: 1,
            totalSemanas: 4,
            descricao: 'Calibração',
        })
        expect(resolvePlanWeek(plan, CYCLE_START, '2026-09-21')).toEqual({ semana: 3, totalSemanas: 4, descricao: null })
        expect(resolvePlanWeek(plan, CYCLE_START, '2026-10-04')).toMatchObject({ semana: 4 })
    })

    it('recomeça o bloco na semana 1 quando o ciclo passa da duração dele', () => {
        const plan = parseBlockPlan()

        expect(resolvePlanWeek(plan, CYCLE_START, '2026-10-05')).toMatchObject({ semana: 1, descricao: 'Calibração' })
        expect(resolvePlanWeek(plan, CYCLE_START, '2026-10-12')).toMatchObject({ semana: 2 })
        expect(resolvePlanWeek(plan, CYCLE_START, '2026-11-02')).toMatchObject({ semana: 1 })
    })

    it('não tem semana sem ciclo, antes do início do ciclo ou com plano sem bloco', () => {
        const plan = parseBlockPlan()
        const planWithoutBlock: WorkoutPlan = { ...plan, bloco_semanas: null, semanas: [] }

        expect(resolvePlanWeek(plan, null, '2026-09-07')).toBeNull()
        expect(resolvePlanWeek(plan, CYCLE_START, '2026-09-01')).toBeNull()
        expect(resolvePlanWeek(planWithoutBlock, CYCLE_START, '2026-09-07')).toBeNull()
    })

    it('formata o rótulo da semana', () => {
        expect(formatPlanWeekLabel(2, 4)).toBe('Semana 2 de 4')
    })
})

describe('applyWeekToWorkout', () => {
    it('usa as séries base na semana sem variação', () => {
        const [workout] = parseBlockPlan().treinos
        const [squat] = applyWeekToWorkout(workout, 1).exercicios

        expect(squat.series).toHaveLength(4)
        expect(squat.series[0]).toMatchObject({ alvo_min: 6, alvo_max: 8, carga_sugerida: 80 })
        expect(squat).toMatchObject({ rir_alvo_min: 2, rir_alvo_max: 3, descanso_segundos_min: 120 })
    })

    it('troca as séries nas semanas de mais repetições e de mais carga', () => {
        const [workout] = parseBlockPlan().treinos

        expect(applyWeekToWorkout(workout, 2).exercicios[0].series[0]).toMatchObject({ alvo_min: 8, alvo_max: 10, carga_sugerida: 80 })
        expect(applyWeekToWorkout(workout, 3).exercicios[0].series[0]).toMatchObject({ alvo_min: 6, alvo_max: 8, carga_sugerida: 82.5 })
    })

    it('reduz o volume na semana 4 e troca só o RIR alvo, mantendo o descanso do exercício', () => {
        const [workout] = parseBlockPlan().treinos
        const [squat, row] = applyWeekToWorkout(workout, 4).exercicios

        expect(squat.series).toHaveLength(3)
        expect(row.series).toHaveLength(2)
        expect(squat).toMatchObject({
            rir_alvo_min: 3,
            rir_alvo_max: 4,
            descanso_segundos_min: 120,
            descanso_segundos_max: 180,
        })
    })

    it('devolve o treino como está sem semana', () => {
        const [workout] = parseBlockPlan().treinos

        expect(applyWeekToWorkout(workout, null)).toBe(workout)
    })
})

describe('buildWorkoutSnapshot com semana do bloco', () => {
    it('grava as séries já resolvidas e a semana, e continua igual depois de passar pelo banco', () => {
        const plan = parseBlockPlan()
        const planWeek = resolvePlanWeek(plan, CYCLE_START, '2026-09-28')

        const snapshot = buildWorkoutSnapshot(plan.treinos[0], planWeek)

        expect(snapshot).toMatchObject({ semana_bloco: 4, bloco_semanas: 4, descricao_semana: 'Redução de volume' })
        expect(snapshot.exercicios[0].series.map((set) => set.set_index)).toEqual([1, 2, 3])
        expect(snapshot.exercicios[0].rir_alvo_min).toBe(3)
        expect(snapshot.exercicios[1].series).toHaveLength(2)
        expect(normalizeWorkoutSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot)
    })

    it('grava as séries base e a semana nula sem semana', () => {
        const snapshot = buildWorkoutSnapshot(parseBlockPlan().treinos[0])

        expect(snapshot).toMatchObject({ semana_bloco: null, bloco_semanas: null, descricao_semana: null })
        expect(snapshot.exercicios[0].series).toHaveLength(4)
    })
})
