import { describe, expect, it } from 'vitest'

import {
    buildSkipValuesForRemainingSets,
    countSetsByStatus,
    findFirstIncompletePosition,
    isFirstStep,
    mainStepOf,
    nextStepWithinSet,
    retreatStep,
} from '@/features/workout/sessionProgress'
import { setKey, type WorkoutSetRow, type WorkoutSnapshot } from '@/features/workout/types'
import { EMPTY_SET_METRIC_COLUMNS, repsSnapshotSet, SNAPSHOT_EXERCISE_DEFAULTS } from './workoutFixtures'

function snapshotWithDropSet(): WorkoutSnapshot {
    const dropSet = {
        ...repsSnapshotSet(2, 10, 12, 30),
        quedas: [
            { drop_index: 1, alvo_min: 8, alvo_max: 10, carga_sugerida: 22.5 },
            { drop_index: 2, alvo_min: 6, alvo_max: 10, carga_sugerida: 15 },
        ],
    }

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
                exercise_key: 'triceps',
                nome: 'Tríceps',
                forma_carga: 'total',
                series: [repsSnapshotSet(1, 10, 12, 30), dropSet],
            },
            {
                ...SNAPSHOT_EXERCISE_DEFAULTS,
                exercise_key: 'rosca',
                nome: 'Rosca',
                forma_carga: 'por_halter',
                series: [repsSnapshotSet(1, 10, 12, null)],
            },
        ],
    }
}

function setRow(exerciseKey: string, setIndex: number, status: 'completed' | 'skipped'): WorkoutSetRow {
    const isCompleted = status === 'completed'

    return {
        id: `${exerciseKey}-${setIndex}`,
        session_id: 'session-1',
        exercise_key: exerciseKey,
        set_index: setIndex,
        load_kg: isCompleted ? 30 : null,
        reps: isCompleted ? 10 : null,
        rir: null,
        note: null,
        completed_at: isCompleted ? '2026-09-29T12:00:00.000Z' : null,
        skipped_at: isCompleted ? null : '2026-09-29T12:00:00.000Z',
        ...EMPTY_SET_METRIC_COLUMNS,
        updated_at: '2026-09-29T12:00:00.000Z',
    }
}

function mapOf(rows: WorkoutSetRow[]): Map<string, WorkoutSetRow> {
    return new Map(rows.map((row) => [setKey(row.exercise_key, row.set_index), row]))
}

const DROP_SET_POSITION = { exerciseIndex: 0, setIndexInExercise: 1 }

describe('nextStepWithinSet', () => {
    it('sai da série quando ela não tem quedas', () => {
        const step = mainStepOf({ exerciseIndex: 0, setIndexInExercise: 0 })
        expect(nextStepWithinSet(snapshotWithDropSet(), step)).toBeNull()
    })

    it('segue da série principal para a primeira queda', () => {
        expect(nextStepWithinSet(snapshotWithDropSet(), mainStepOf(DROP_SET_POSITION))).toEqual({
            position: DROP_SET_POSITION,
            dropPosition: 0,
        })
    })

    it('avança de queda em queda e sai da série depois da última', () => {
        const snapshot = snapshotWithDropSet()
        expect(nextStepWithinSet(snapshot, { position: DROP_SET_POSITION, dropPosition: 0 })).toEqual({
            position: DROP_SET_POSITION,
            dropPosition: 1,
        })
        expect(nextStepWithinSet(snapshot, { position: DROP_SET_POSITION, dropPosition: 1 })).toBeNull()
    })
})

describe('retreatStep', () => {
    it('volta de uma queda para a anterior e da primeira para a série principal', () => {
        const snapshot = snapshotWithDropSet()
        expect(retreatStep(snapshot, new Map(), { position: DROP_SET_POSITION, dropPosition: 1 })).toEqual({
            position: DROP_SET_POSITION,
            dropPosition: 0,
        })
        expect(retreatStep(snapshot, new Map(), { position: DROP_SET_POSITION, dropPosition: 0 })).toEqual(
            mainStepOf(DROP_SET_POSITION),
        )
    })

    it('volta para a última queda da série anterior quando ela foi concluída', () => {
        const setsByKey = mapOf([setRow('triceps', 2, 'completed')])
        const step = mainStepOf({ exerciseIndex: 1, setIndexInExercise: 0 })
        expect(retreatStep(snapshotWithDropSet(), setsByKey, step)).toEqual({
            position: DROP_SET_POSITION,
            dropPosition: 1,
        })
    })

    it('volta para a série principal anterior quando ela foi pulada ou está pendente', () => {
        const step = mainStepOf({ exerciseIndex: 1, setIndexInExercise: 0 })
        const skippedSetsByKey = mapOf([setRow('triceps', 2, 'skipped')])
        expect(retreatStep(snapshotWithDropSet(), skippedSetsByKey, step)).toEqual(mainStepOf(DROP_SET_POSITION))
        expect(retreatStep(snapshotWithDropSet(), new Map(), step)).toEqual(mainStepOf(DROP_SET_POSITION))
    })
})

describe('isFirstStep', () => {
    it('só a série principal da primeira série do treino é o primeiro passo', () => {
        const firstPosition = { exerciseIndex: 0, setIndexInExercise: 0 }
        expect(isFirstStep(mainStepOf(firstPosition))).toBe(true)
        expect(isFirstStep({ position: firstPosition, dropPosition: 0 })).toBe(false)
        expect(isFirstStep(mainStepOf(DROP_SET_POSITION))).toBe(false)
    })
})

describe('progresso com drop set', () => {
    it('conta a série com quedas uma vez só, pelo status da série principal', () => {
        const setsByKey = mapOf([setRow('triceps', 1, 'completed'), setRow('triceps', 2, 'completed')])
        expect(countSetsByStatus(snapshotWithDropSet(), setsByKey)).toEqual({
            completed: 2,
            skipped: 0,
            pending: 1,
            total: 3,
        })
        expect(findFirstIncompletePosition(snapshotWithDropSet(), setsByKey)).toEqual({
            exerciseIndex: 1,
            setIndexInExercise: 0,
        })
    })

    it('pular o exercício limpa as quedas só das séries com drop set', () => {
        const nowIso = '2026-09-29T12:00:00.000Z'
        const skipValues = buildSkipValuesForRemainingSets(snapshotWithDropSet().exercicios[0], new Map(), nowIso)

        expect(skipValues[0].values).not.toHaveProperty('drops')
        expect(skipValues[1].values.drops).toEqual([])
    })
})
