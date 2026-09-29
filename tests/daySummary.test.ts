import { describe, expect, it } from 'vitest'

import { summarizeWorkoutSets } from '@/features/results/daySummary'
import type { WorkoutSetDropRow, WorkoutSetRow } from '@/features/workout/types'
import type { WorkoutSnapshot } from '@/lib/databaseTypes'
import { EMPTY_SET_METRIC_COLUMNS, repsSnapshotSet, SNAPSHOT_EXERCISE_DEFAULTS } from './workoutFixtures'

const SNAPSHOT: WorkoutSnapshot = {
    versao: 2,
    workout_key: 'treino_a',
    nome: 'Treino A',
    semana_bloco: null,
    bloco_semanas: null,
    descricao_semana: null,
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

    it('traz métrica, valores de tempo e distância, e a forma de carga do exercício', () => {
        const snapshot: WorkoutSnapshot = {
            ...SNAPSHOT,
            exercicios: [
                {
                    ...SNAPSHOT_EXERCISE_DEFAULTS,
                    exercise_key: 'prancha',
                    nome: 'Prancha lateral',
                    forma_carga: 'peso_corporal',
                    por_lado: true,
                    series: [
                        { set_index: 0, metrica: 'tempo', alvo_min: 20, alvo_max: 40, carga_sugerida: null, quedas: [] },
                    ],
                },
            ],
        }
        const sets = [
            buildSetRow({
                exercise_key: 'prancha',
                set_index: 0,
                metric: 'tempo',
                load_kg: 0,
                reps: null,
                duration_seconds: 35,
            }),
        ]

        const [exercise] = summarizeWorkoutSets(snapshot, sets).exercises

        expect(exercise.loadConvention).toBe('peso_corporal')
        expect(exercise.perSide).toBe(true)
        expect(exercise.sets[0]).toMatchObject({ metric: 'tempo', durationSeconds: 35, distanceM: null, drops: [] })
    })

    it('trata série sem métrica gravada como repetições', () => {
        const summary = summarizeWorkoutSets(SNAPSHOT, [buildSetRow({ exercise_key: 'supino', set_index: 0 })])

        expect(summary.exercises[0].sets[0].metric).toBe('repeticoes')
    })

    it('anexa as quedas de cada série na ordem, preservando a queda do meio vazia', () => {
        const dropRow = (overrides: Partial<WorkoutSetDropRow>): WorkoutSetDropRow => ({
            id: 'drop',
            set_id: 'set-supino-1',
            drop_index: 1,
            load_kg: null,
            reps: null,
            duration_seconds: null,
            distance_m: null,
            updated_at: '2026-09-28T12:00:00.000Z',
            ...overrides,
        })
        const sets = [
            buildSetRow({ id: 'set-supino-0', exercise_key: 'supino', set_index: 0 }),
            buildSetRow({ id: 'set-supino-1', exercise_key: 'supino', set_index: 1 }),
        ]
        const drops = [
            dropRow({ id: 'd3', drop_index: 3, load_kg: 20, reps: 6 }),
            dropRow({ id: 'd1', drop_index: 1, load_kg: 30, reps: 9 }),
        ]

        const [supino] = summarizeWorkoutSets(SNAPSHOT, sets, drops).exercises

        expect(supino.sets[0].drops).toEqual([])
        expect(supino.sets[1].drops).toEqual([
            { loadKg: 30, reps: 9, durationSeconds: null, distanceM: null },
            { loadKg: null, reps: null, durationSeconds: null, distanceM: null },
            { loadKg: 20, reps: 6, durationSeconds: null, distanceM: null },
        ])
    })
})
