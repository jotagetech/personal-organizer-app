import { describe, expect, it } from 'vitest'

import {
    advancePosition,
    buildSkipValuesForRemainingSets,
    countSetsByStatus,
    findFirstIncompletePosition,
    findNextUnresolvedPosition,
    firstUnresolvedSetInExercise,
    isLastPosition,
    isOnlyUnresolvedSet,
    positionToGlobalIndex,
    retreatPosition,
    setStatusOf,
    summarizeExerciseProgress,
    totalSetCount,
} from '@/features/workout/sessionProgress'
import { setKey, type WorkoutSetRow, type WorkoutSnapshot } from '@/features/workout/types'
import { EMPTY_SET_METRIC_COLUMNS, repsSnapshotSet, SNAPSHOT_EXERCISE_DEFAULTS } from './workoutFixtures'

function snapshotWithTwoExercises(): WorkoutSnapshot {
    return {
        versao: 2,
        workout_key: 'treino-a',
        nome: 'Treino A',
        semana_bloco: null,
        bloco_semanas: null,
        descricao_semana: null,
        exercicios: [
            {
                ...SNAPSHOT_EXERCISE_DEFAULTS,
                exercise_key: 'supino',
                nome: 'Supino',
                forma_carga: 'total',
                series: [
                    repsSnapshotSet(1, 8, 12, null),
                    repsSnapshotSet(2, 8, 12, null),
                ],
            },
            {
                ...SNAPSHOT_EXERCISE_DEFAULTS,
                exercise_key: 'triceps',
                nome: 'Tríceps',
                forma_carga: 'total',
                series: [repsSnapshotSet(1, 10, 15, null)],
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
        skipped_at: null,
        ...EMPTY_SET_METRIC_COLUMNS,
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

function skippedSet(exerciseKey: string, setIndex: number, note: string | null = null): WorkoutSetRow {
    return {
        ...completedSet(exerciseKey, setIndex),
        load_kg: null,
        reps: null,
        note,
        completed_at: null,
        skipped_at: '2026-09-27T12:05:00.000Z',
    }
}

function pendingSet(exerciseKey: string, setIndex: number, note: string | null = null): WorkoutSetRow {
    return { ...completedSet(exerciseKey, setIndex), load_kg: 20, reps: 5, note, completed_at: null }
}

function mapOf(rows: WorkoutSetRow[]): Map<string, WorkoutSetRow> {
    return new Map(rows.map((row) => [setKey(row.exercise_key, row.set_index), row]))
}

describe('setStatusOf', () => {
    it('considera concluída a série com completed_at', () => {
        expect(setStatusOf(completedSet('supino', 1))).toBe('completed')
    })

    it('considera pulada a série com skipped_at', () => {
        expect(setStatusOf(skippedSet('supino', 1))).toBe('skipped')
    })

    it('considera pendente a série registrada sem nenhum dos dois', () => {
        expect(setStatusOf(pendingSet('supino', 1))).toBe('pending')
    })

    it('considera pendente a série sem nenhum registro', () => {
        expect(setStatusOf(undefined)).toBe('pending')
    })
})

describe('findFirstIncompletePosition com séries puladas', () => {
    it('trata série pulada como resolvida e retoma na seguinte', () => {
        const setsByKey = mapOf([completedSet('supino', 1), skippedSet('supino', 2)])
        const position = findFirstIncompletePosition(snapshotWithTwoExercises(), setsByKey)
        expect(position).toEqual({ exerciseIndex: 1, setIndexInExercise: 0 })
    })

    it('retorna null quando tudo está concluído ou pulado', () => {
        const setsByKey = mapOf([completedSet('supino', 1), skippedSet('supino', 2), skippedSet('triceps', 1)])
        expect(findFirstIncompletePosition(snapshotWithTwoExercises(), setsByKey)).toBeNull()
    })
})

describe('buildSkipValuesForRemainingSets', () => {
    const nowIso = '2026-09-27T13:00:00.000Z'

    it('marca como puladas só as séries ainda pendentes, ignorando as concluídas', () => {
        const exercicio = snapshotWithTwoExercises().exercicios[0]
        const setsByKey = mapOf([completedSet('supino', 1)])

        const skipValues = buildSkipValuesForRemainingSets(exercicio, setsByKey, nowIso)

        expect(skipValues).toEqual([
            {
                setIndex: 2,
                values: { loadKg: null, reps: null, rir: null, note: null, completedAt: null, skippedAt: nowIso },
            },
        ])
    })

    it('preserva o comentário e zera carga, repetições e RIR da série pendente', () => {
        const exercicio = snapshotWithTwoExercises().exercicios[0]
        const setsByKey = mapOf([pendingSet('supino', 1, 'ombro doendo')])

        const skipValues = buildSkipValuesForRemainingSets(exercicio, setsByKey, nowIso)

        expect(skipValues).toHaveLength(2)
        expect(skipValues[0]).toEqual({
            setIndex: 1,
            values: { loadKg: null, reps: null, rir: null, note: 'ombro doendo', completedAt: null, skippedAt: nowIso },
        })
    })

    it('nunca produz uma série concluída e pulada ao mesmo tempo', () => {
        const exercicio = snapshotWithTwoExercises().exercicios[0]
        const skipValues = buildSkipValuesForRemainingSets(exercicio, new Map(), nowIso)

        for (const { values } of skipValues) {
            expect(values.completedAt).toBeNull()
            expect(values.skippedAt).toBe(nowIso)
        }
    })

    it('não devolve nada quando o exercício já está todo resolvido', () => {
        const exercicio = snapshotWithTwoExercises().exercicios[0]
        const setsByKey = mapOf([completedSet('supino', 1), skippedSet('supino', 2)])

        expect(buildSkipValuesForRemainingSets(exercicio, setsByKey, nowIso)).toEqual([])
    })
})

describe('countSetsByStatus', () => {
    it('conta concluídas, puladas e pendentes do treino inteiro', () => {
        const setsByKey = mapOf([completedSet('supino', 1), skippedSet('supino', 2)])

        expect(countSetsByStatus(snapshotWithTwoExercises(), setsByKey)).toEqual({
            completed: 1,
            skipped: 1,
            pending: 1,
            total: 3,
        })
    })

    it('ignora séries órfãs que não fazem parte do snapshot', () => {
        const setsByKey = mapOf([completedSet('remada', 1)])

        expect(countSetsByStatus(snapshotWithTwoExercises(), setsByKey)).toEqual({
            completed: 0,
            skipped: 0,
            pending: 3,
            total: 3,
        })
    })
})

describe('findNextUnresolvedPosition', () => {
    it('vai para a série seguinte no mesmo exercício', () => {
        const setsByKey = mapOf([completedSet('supino', 1)])
        const next = findNextUnresolvedPosition(snapshotWithTwoExercises(), setsByKey, {
            exerciseIndex: 0,
            setIndexInExercise: 0,
        })
        expect(next).toEqual({ exerciseIndex: 0, setIndexInExercise: 1 })
    })

    it('pula séries já resolvidas à frente', () => {
        const setsByKey = mapOf([completedSet('supino', 1), completedSet('supino', 2)])
        const next = findNextUnresolvedPosition(snapshotWithTwoExercises(), setsByKey, {
            exerciseIndex: 0,
            setIndexInExercise: 0,
        })
        expect(next).toEqual({ exerciseIndex: 1, setIndexInExercise: 0 })
    })

    it('dá a volta até o início quando o que falta ficou para trás', () => {
        const setsByKey = mapOf([completedSet('supino', 2), completedSet('triceps', 1)])
        const next = findNextUnresolvedPosition(snapshotWithTwoExercises(), setsByKey, {
            exerciseIndex: 1,
            setIndexInExercise: 0,
        })
        expect(next).toEqual({ exerciseIndex: 0, setIndexInExercise: 0 })
    })

    it('trata série pulada como resolvida', () => {
        const setsByKey = mapOf([completedSet('supino', 1), skippedSet('supino', 2)])
        const next = findNextUnresolvedPosition(snapshotWithTwoExercises(), setsByKey, {
            exerciseIndex: 0,
            setIndexInExercise: 0,
        })
        expect(next).toEqual({ exerciseIndex: 1, setIndexInExercise: 0 })
    })

    it('retorna null quando tudo está resolvido', () => {
        const setsByKey = mapOf([completedSet('supino', 1), skippedSet('supino', 2), completedSet('triceps', 1)])
        const next = findNextUnresolvedPosition(snapshotWithTwoExercises(), setsByKey, {
            exerciseIndex: 1,
            setIndexInExercise: 0,
        })
        expect(next).toBeNull()
    })
})

describe('firstUnresolvedSetInExercise', () => {
    it('leva à primeira série não resolvida do exercício', () => {
        const setsByKey = mapOf([completedSet('supino', 1)])
        expect(firstUnresolvedSetInExercise(snapshotWithTwoExercises(), setsByKey, 0)).toEqual({
            exerciseIndex: 0,
            setIndexInExercise: 1,
        })
    })

    it('leva à série 1 quando o exercício inteiro já está resolvido', () => {
        const setsByKey = mapOf([completedSet('supino', 1), skippedSet('supino', 2)])
        expect(firstUnresolvedSetInExercise(snapshotWithTwoExercises(), setsByKey, 0)).toEqual({
            exerciseIndex: 0,
            setIndexInExercise: 0,
        })
    })
})

describe('isOnlyUnresolvedSet', () => {
    it('é verdadeiro quando todas as outras séries estão resolvidas', () => {
        const setsByKey = mapOf([completedSet('supino', 1), skippedSet('triceps', 1)])
        expect(
            isOnlyUnresolvedSet(snapshotWithTwoExercises(), setsByKey, { exerciseIndex: 0, setIndexInExercise: 1 }),
        ).toBe(true)
    })

    it('é falso quando ainda falta outra série além da atual', () => {
        const setsByKey = mapOf([completedSet('supino', 1)])
        expect(
            isOnlyUnresolvedSet(snapshotWithTwoExercises(), setsByKey, { exerciseIndex: 0, setIndexInExercise: 1 }),
        ).toBe(false)
    })
})

describe('summarizeExerciseProgress', () => {
    it('resume concluídas, puladas e total por exercício, na ordem da ficha', () => {
        const setsByKey = mapOf([completedSet('supino', 1), skippedSet('supino', 2)])

        expect(summarizeExerciseProgress(snapshotWithTwoExercises(), setsByKey)).toEqual([
            { exerciseIndex: 0, nome: 'Supino', completed: 1, skipped: 1, total: 2 },
            { exerciseIndex: 1, nome: 'Tríceps', completed: 0, skipped: 0, total: 1 },
        ])
    })
})
