import { describe, expect, it } from 'vitest'

import { buildWorkoutSnapshot } from '@/features/workout/snapshot'
import { parseWorkoutPlanJson } from '@/lib/workoutPlanSchema'
import { normalizeWorkoutSnapshot } from '@/lib/workoutSnapshotSchema'

// Formato gravado em workout_sessions.workout_snapshot antes da versão 2.
const LEGACY_SNAPSHOT = {
    workout_key: 'treino-a',
    nome: 'A: peito',
    exercicios: [
        {
            exercise_key: 'supino-reto',
            nome: 'Supino reto',
            forma_carga: 'total',
            series: [
                { set_index: 1, repeticoes_min: 8, repeticoes_max: 12, carga_sugerida: 60 },
                { set_index: 2, repeticoes_min: 8, repeticoes_max: 12, carga_sugerida: null },
            ],
        },
    ],
}

const V2_PLAN = {
    versao: 2,
    nome: 'Plano',
    unidade_carga: 'kg',
    treinos: [
        {
            id: 'treino-b',
            nome: 'B',
            exercicios: [
                {
                    id: 'prancha',
                    nome: 'Prancha lateral',
                    forma_carga: 'peso_corporal',
                    por_lado: true,
                    series: [{ segundos_min: 20, segundos_max: 40 }],
                },
                {
                    id: 'triceps',
                    nome: 'Tríceps na corda',
                    forma_carga: 'total',
                    series: [
                        {
                            repeticoes_min: 10,
                            repeticoes_max: 12,
                            carga_sugerida: 30,
                            quedas: [{ repeticoes_min: 8, repeticoes_max: 10, carga_sugerida: 20 }],
                        },
                    ],
                },
            ],
        },
    ],
}

describe('normalizeWorkoutSnapshot', () => {
    it('lê um snapshot antigo como séries de repetições, mantendo set_index', () => {
        const snapshot = normalizeWorkoutSnapshot(LEGACY_SNAPSHOT)

        expect(snapshot).toEqual({
            versao: 2,
            workout_key: 'treino-a',
            nome: 'A: peito',
            semana_bloco: null,
            bloco_semanas: null,
            descricao_semana: null,
            exercicios: [
                {
                    exercise_key: 'supino-reto',
                    nome: 'Supino reto',
                    tipo: 'series',
                    intervalado: null,
                    equipamento: null,
                    forma_carga: 'total',
                    por_lado: false,
                    descanso_segundos_min: null,
                    descanso_segundos_max: null,
                    rir_alvo_min: null,
                    rir_alvo_max: null,
                    observacoes: null,
                    series: [
                        { set_index: 1, metrica: 'repeticoes', alvo_min: 8, alvo_max: 12, carga_sugerida: 60, quedas: [] },
                        { set_index: 2, metrica: 'repeticoes', alvo_min: 8, alvo_max: 12, carga_sugerida: null, quedas: [] },
                    ],
                },
            ],
        })
    })

    it('devolve um snapshot atual sem alterações depois de passar pelo banco', () => {
        const parsed = parseWorkoutPlanJson(JSON.stringify(V2_PLAN))
        expect(parsed.success).toBe(true)
        if (!parsed.success) {
            return
        }

        const snapshot = buildWorkoutSnapshot(parsed.plan.treinos[0])
        const roundTripped = normalizeWorkoutSnapshot(JSON.parse(JSON.stringify(snapshot)))

        expect(roundTripped).toEqual(snapshot)
        expect(snapshot.exercicios[0]).toMatchObject({ por_lado: true })
        expect(snapshot.exercicios[0].series[0]).toMatchObject({ set_index: 1, metrica: 'tempo', alvo_min: 20, alvo_max: 40 })
        expect(snapshot.exercicios[1].series[0].quedas).toEqual([
            { drop_index: 1, alvo_min: 8, alvo_max: 10, carga_sugerida: 20 },
        ])
    })

    it('lê um snapshot v2 gravado antes da progressão por semana sem semana do bloco', () => {
        const parsed = parseWorkoutPlanJson(JSON.stringify(V2_PLAN))
        expect(parsed.success).toBe(true)
        if (!parsed.success) {
            return
        }

        const storedWithoutWeek: Record<string, unknown> = { ...buildWorkoutSnapshot(parsed.plan.treinos[0]) }
        delete storedWithoutWeek.semana_bloco
        delete storedWithoutWeek.bloco_semanas
        delete storedWithoutWeek.descricao_semana

        const snapshot = normalizeWorkoutSnapshot(storedWithoutWeek)

        expect(snapshot).toMatchObject({ semana_bloco: null, bloco_semanas: null, descricao_semana: null })
        expect(snapshot.exercicios).toHaveLength(2)
    })

    it('recusa snapshot em formato desconhecido', () => {
        expect(() => normalizeWorkoutSnapshot({ workout_key: 'x' })).toThrow('Snapshot de treino em formato desconhecido')
    })
})
