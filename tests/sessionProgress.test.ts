import { describe, expect, it } from 'vitest'

import {
    advancePosition,
    findFirstIncompletePosition,
    isLastPosition,
    positionToGlobalIndex,
    retreatPosition,
    totalSetCount,
} from '@/features/workout/sessionProgress'
import { setKey, type WorkoutSetRow, type WorkoutSnapshot } from '@/features/workout/types'

function snapshotWithTwoExercises(): WorkoutSnapshot {
    return {
        workout_key: 'treino-a',
        nome: 'Treino A',
        exercicios: [
            {
                exercise_key: 'supino',
                nome: 'Supino',
                forma_carga: 'total',
                series: [
                    { set_index: 1, repeticoes_min: 8, repeticoes_max: 12, carga_sugerida: null },
                    { set_index: 2, repeticoes_min: 8, repeticoes_max: 12, carga_sugerida: null },
                ],
            },
            {
                exercise_key: 'triceps',
                nome: 'Tríceps',
                forma_carga: 'total',
                series: [{ set_index: 1, repeticoes_min: 10, repeticoes_max: 15, carga_sugerida: null }],
            },
        ],
    }
}

function completedSet(exerciseKey: string, setIndex: number): WorkoutSetRow {
    return {
        id: `${exerciseKey}-${setIndex}`,
        session_id: 'session-1',
        exercise_key: exerciseKey,
        set_index: setIndex,
        load_kg: 10,
        reps: 10,
        rir: null,
        note: null,
        completed_at: '2026-09-27T12:00:00.000Z',
        updated_at: '2026-09-27T12:00:00.000Z',
    }
}

describe('findFirstIncompletePosition', () => {
    it('retoma no início quando nada foi confirmado', () => {
        const position = findFirstIncompletePosition(snapshotWithTwoExercises(), new Map())
        expect(position).toEqual({ exerciseIndex: 0, setIndexInExercise: 0 })
    })

    it('pula séries já confirmadas e retoma na primeira pendente', () => {
        const setsByKey = new Map([[setKey('supino', 1), completedSet('supino', 1)]])
        const position = findFirstIncompletePosition(snapshotWithTwoExercises(), setsByKey)
        expect(position).toEqual({ exerciseIndex: 0, setIndexInExercise: 1 })
    })

    it('retorna null quando todas as séries já foram confirmadas', () => {
        const setsByKey = new Map([
            [setKey('supino', 1), completedSet('supino', 1)],
            [setKey('supino', 2), completedSet('supino', 2)],
            [setKey('triceps', 1), completedSet('triceps', 1)],
        ])
        const position = findFirstIncompletePosition(snapshotWithTwoExercises(), setsByKey)
        expect(position).toBeNull()
    })
})

describe('advancePosition', () => {
    it('avança para a próxima série dentro do mesmo exercício', () => {
        const nextPosition = advancePosition(snapshotWithTwoExercises(), {
            exerciseIndex: 0,
            setIndexInExercise: 0,
        })
        expect(nextPosition).toEqual({ exerciseIndex: 0, setIndexInExercise: 1 })
    })

    it('avança para o próximo exercício ao esgotar as séries do atual', () => {
        const nextPosition = advancePosition(snapshotWithTwoExercises(), {
            exerciseIndex: 0,
            setIndexInExercise: 1,
        })
        expect(nextPosition).toEqual({ exerciseIndex: 1, setIndexInExercise: 0 })
    })

    it('retorna null ao confirmar a última série do último exercício', () => {
        const nextPosition = advancePosition(snapshotWithTwoExercises(), {
            exerciseIndex: 1,
            setIndexInExercise: 0,
        })
        expect(nextPosition).toBeNull()
    })
})

describe('retreatPosition', () => {
    it('volta para a série anterior dentro do mesmo exercício', () => {
        const previousPosition = retreatPosition(snapshotWithTwoExercises(), {
            exerciseIndex: 0,
            setIndexInExercise: 1,
        })
        expect(previousPosition).toEqual({ exerciseIndex: 0, setIndexInExercise: 0 })
    })

    it('volta para a última série do exercício anterior', () => {
        const previousPosition = retreatPosition(snapshotWithTwoExercises(), {
            exerciseIndex: 1,
            setIndexInExercise: 0,
        })
        expect(previousPosition).toEqual({ exerciseIndex: 0, setIndexInExercise: 1 })
    })
})

describe('totalSetCount', () => {
    it('soma as séries de todos os exercícios do treino', () => {
        expect(totalSetCount(snapshotWithTwoExercises())).toBe(3)
    })
})

describe('positionToGlobalIndex', () => {
    it('conta zero na primeira série do treino', () => {
        expect(positionToGlobalIndex(snapshotWithTwoExercises(), { exerciseIndex: 0, setIndexInExercise: 0 })).toBe(0)
    })

    it('soma as séries dos exercícios anteriores', () => {
        expect(positionToGlobalIndex(snapshotWithTwoExercises(), { exerciseIndex: 1, setIndexInExercise: 0 })).toBe(2)
    })
})

describe('isLastPosition', () => {
    it('identifica a última série do treino', () => {
        const result = isLastPosition(snapshotWithTwoExercises(), { exerciseIndex: 1, setIndexInExercise: 0 })
        expect(result).toBe(true)
    })

    it('não marca como última uma série do meio do treino', () => {
        const result = isLastPosition(snapshotWithTwoExercises(), { exerciseIndex: 0, setIndexInExercise: 1 })
        expect(result).toBe(false)
    })
})
