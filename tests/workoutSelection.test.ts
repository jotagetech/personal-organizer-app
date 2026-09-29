import { describe, expect, it } from 'vitest'

import { suggestWorkoutForWeekday } from '@/features/workout/workoutSelection'
import type { WorkoutPlan } from '@/lib/workoutPlanSchema'

function planWithWorkouts(
    workouts: { id: string; dias_semana?: string[] }[],
): WorkoutPlan {
    return {
        versao: 2,
        nome: 'Plano de teste',
        unidade_carga: 'kg',
        bloco_semanas: null,
        semanas: [],
        treinos: workouts.map((workout) => ({
            id: workout.id,
            nome: workout.id,
            dias_semana: workout.dias_semana as WorkoutPlan['treinos'][number]['dias_semana'],
            exercicios: [
                {
                    id: 'exercicio-1',
                    nome: 'Exercício 1',
                    equipamento: null,
                    forma_carga: 'total',
                    por_lado: false,
                    descanso_segundos_min: null,
                    descanso_segundos_max: null,
                    rir_alvo_min: null,
                    rir_alvo_max: null,
                    observacoes: null,
                    series: [{ metrica: 'repeticoes', alvo_min: 8, alvo_max: 12, carga_sugerida: null, quedas: [] }],
                    variacoes_semana: [],
                },
            ],
        })),
    }
}

describe('suggestWorkoutForWeekday', () => {
    it('sugere o único treino agendado para o dia', () => {
        const plan = planWithWorkouts([
            { id: 'treino-a', dias_semana: ['segunda'] },
            { id: 'treino-b', dias_semana: ['terca'] },
        ])

        const suggestion = suggestWorkoutForWeekday(plan, 'segunda')

        expect(suggestion.kind).toBe('single')
        if (suggestion.kind === 'single') {
            expect(suggestion.workout.id).toBe('treino-a')
        }
    })

    it('pede escolha quando mais de um treino está agendado para o dia', () => {
        const plan = planWithWorkouts([
            { id: 'treino-a', dias_semana: ['segunda'] },
            { id: 'treino-b', dias_semana: ['segunda'] },
        ])

        const suggestion = suggestWorkoutForWeekday(plan, 'segunda')

        expect(suggestion.kind).toBe('choose_one')
        if (suggestion.kind === 'choose_one') {
            expect(suggestion.workouts.map((workout) => workout.id)).toEqual(['treino-a', 'treino-b'])
        }
    })

    it('permite escolha manual quando não há treino agendado para o dia', () => {
        const plan = planWithWorkouts([
            { id: 'treino-a', dias_semana: ['terca'] },
            { id: 'treino-b' },
        ])

        const suggestion = suggestWorkoutForWeekday(plan, 'segunda')

        expect(suggestion.kind).toBe('no_schedule')
        if (suggestion.kind === 'no_schedule') {
            expect(suggestion.availableWorkouts).toHaveLength(2)
        }
    })
})
