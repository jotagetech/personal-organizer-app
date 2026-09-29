import { describe, expect, it } from 'vitest'

import { summarizeWorkoutSets } from '@/features/results/daySummary'
import type { WorkoutSetRow } from '@/features/workout/types'
import type { WorkoutSnapshot } from '@/lib/databaseTypes'
import { EMPTY_SET_METRIC_COLUMNS, repsSnapshotSet, SNAPSHOT_EXERCISE_DEFAULTS } from './workoutFixtures'

const SNAPSHOT: WorkoutSnapshot = {
    versao: 2,
    workout_key: 'treino_a',
    nome: 'Treino A',
    exercicios: [
        {
            ...SNAPSHOT_EXERCISE_DEFAULTS,
            exercise_key: 'supino',
            nome: 'Supino reto',
            forma_carga: 'total',
            series: [
                repsSnapshotSet(0, 8, 10, 40),
                repsSnapshotSet(1, 8, 10, 40),
            ],
        },
        {
            ...SNAPSHOT_EXERCISE_DEFAULTS,
            exercise_key: 'remada',
            nome: 'Remada curvada',
            forma_carga: 'total',
            series: [repsSnapshotSet(0, 10, 12, 30)],
        },
    ],
}

function buildSetRow(overrides: Partial<WorkoutSetRow>): WorkoutSetRow {
    const baseSet: WorkoutSetRow = {
        id: 'set-id',
        session_id: 'session-id',
        exercise_key: 'supino',
        set_index: 0,
        load_kg: 40,
        reps: 10,
        rir: 2,
        note: null,
        completed_at: '2026-09-28T12:00:00.000Z',
        skipped_at: null,
        ...EMPTY_SET_METRIC_COLUMNS,
        updated_at: '2026-09-28T12:00:00.000Z',
    }

    return { ...baseSet, ...overrides }
}

describe('summarizeWorkoutSets', () => {
    it('devolve as séries na ordem do snapshot, exercício por exercício', () => {
        const sets = [
            buildSetRow({ exercise_key: 'remada', set_index: 0, id: 'set-remada' }),
            buildSetRow({ exercise_key: 'supino', set_index: 1, id: 'set-supino-1' }),
            buildSetRow({ exercise_key: 'supino', set_index: 0, id: 'set-supino-0' }),
        ]

        const summary = summarizeWorkoutSets(SNAPSHOT, sets)

        expect(summary.exercises.map((exercise) => exercise.exerciseKey)).toEqual(['supino', 'remada'])
        expect(summary.exercises[0].sets.map((set) => set.setIndex)).toEqual([0, 1])
        expect(summary.exercises[1].sets.map((set) => set.setIndex)).toEqual([0])
    })

    it('separa séries órfãs cujo exercise_key não existe mais no snapshot', () => {
        const sets = [
            buildSetRow({ exercise_key: 'supino', set_index: 0, id: 'set-supino-0' }),
            buildSetRow({ exercise_key: 'agachamento', set_index: 0, id: 'set-orfa' }),
        ]

        const summary = summarizeWorkoutSets(SNAPSHOT, sets)

        expect(summary.orphanSets).toHaveLength(1)
        expect(summary.orphanSets[0].id).toBe('set-orfa')
        expect(summary.exercises.flatMap((exercise) => exercise.sets)).toHaveLength(3)
    })

    it('não confunde uma série sem completed_at com uma série concluída', () => {
        const sets = [buildSetRow({ exercise_key: 'supino', set_index: 0, completed_at: null })]

        const summary = summarizeWorkoutSets(SNAPSHOT, sets)

        const supinoFirstSet = summary.exercises[0].sets[0]
        expect(supinoFirstSet.isCompleted).toBe(false)
        expect(supinoFirstSet.loadKg).toBe(40)
    })

    it('marca uma série sem nenhum registro como não concluída, sem valores', () => {
        const summary = summarizeWorkoutSets(SNAPSHOT, [])

        const supinoFirstSet = summary.exercises[0].sets[0]
        expect(supinoFirstSet.isCompleted).toBe(false)
        expect(supinoFirstSet.status).toBe('pending')
        expect(supinoFirstSet.loadKg).toBeNull()
        expect(summary.orphanSets).toHaveLength(0)
    })

    it('marca série pulada com status skipped, sem contar como concluída, mantendo o comentário', () => {
        const sets = [
            buildSetRow({ exercise_key: 'supino', set_index: 0 }),
            buildSetRow({
                exercise_key: 'supino',
                set_index: 1,
                load_kg: null,
                reps: null,
                rir: null,
                note: 'cotovelo',
                completed_at: null,
                skipped_at: '2026-09-28T12:10:00.000Z',
            }),
        ]

        const summary = summarizeWorkoutSets(SNAPSHOT, sets)

        const [firstSet, skippedSet] = summary.exercises[0].sets
        expect(firstSet.status).toBe('completed')
        expect(firstSet.isCompleted).toBe(true)
        expect(skippedSet.status).toBe('skipped')
        expect(skippedSet.isCompleted).toBe(false)
        expect(skippedSet.note).toBe('cotovelo')
    })
})
