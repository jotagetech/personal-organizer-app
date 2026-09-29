import { describe, expect, it } from 'vitest'

import {
    buildSavedWorkoutStep,
    forgetWorkoutStep,
    MAX_REMEMBERED_DATES,
    parseSavedWorkoutSteps,
    rememberWorkoutStep,
    restoreWorkoutStep,
    type SavedWorkoutStep,
} from '@/features/workout/sessionResume'
import { setKey, type WorkoutSetRow, type WorkoutSnapshot } from '@/features/workout/types'
import { EMPTY_SET_METRIC_COLUMNS, repsSnapshotSet, SNAPSHOT_EXERCISE_DEFAULTS } from './workoutFixtures'

function snapshotWithDropSet(): WorkoutSnapshot {
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
                series: [repsSnapshotSet(1, 8, 12, null), repsSnapshotSet(2, 8, 12, null)],
            },
            {
                ...SNAPSHOT_EXERCISE_DEFAULTS,
                exercise_key: 'rosca',
                nome: 'Rosca',
                forma_carga: 'total',
                series: [
                    {
                        ...repsSnapshotSet(1, 8, 12, null),
                        quedas: [
                            { drop_index: 1, alvo_min: 6, alvo_max: 8, carga_sugerida: null },
                            { drop_index: 2, alvo_min: 6, alvo_max: 8, carga_sugerida: null },
                        ],
                    },
                ],
            },
            {
                ...SNAPSHOT_EXERCISE_DEFAULTS,
                exercise_key: 'bike',
                nome: 'Bike',
                forma_carga: 'total',
                tipo: 'intervalado',
                series: [repsSnapshotSet(1, 30, 30, null), repsSnapshotSet(2, 30, 30, null)],
            },
        ],
    }
}

function savedStep(overrides: Partial<SavedWorkoutStep> = {}): SavedWorkoutStep {
    return { workoutKey: 'treino-a', exerciseIndex: 0, setIndexInExercise: 1, dropPosition: null, ...overrides }
}

function setRow(exerciseKey: string, setIndex: number, overrides: Partial<WorkoutSetRow> = {}): WorkoutSetRow {
    return {
        id: `${exerciseKey}-${setIndex}`,
        session_id: 'session-1',
        exercise_key: exerciseKey,
        set_index: setIndex,
        load_kg: 20,
        reps: 10,
        rir: null,
        note: null,
        completed_at: '2026-09-29T12:00:00.000Z',
        skipped_at: null,
        ...EMPTY_SET_METRIC_COLUMNS,
        updated_at: '2026-09-29T12:00:00.000Z',
        ...overrides,
    }
}

describe('restoreWorkoutStep', () => {
    it('volta para a série guardada, mesmo que não seja a primeira pendente', () => {
        const restored = restoreWorkoutStep(snapshotWithDropSet(), new Map(), savedStep({ exerciseIndex: 1, setIndexInExercise: 0 }))

        expect(restored).toEqual({ position: { exerciseIndex: 1, setIndexInExercise: 0 }, dropPosition: null })
    })

    it('volta para uma série já resolvida quando era ela que estava na tela', () => {
        const setsByKey = new Map([[setKey('supino', 2), setRow('supino', 2)]])
        const restored = restoreWorkoutStep(snapshotWithDropSet(), setsByKey, savedStep())

        expect(restored).toEqual({ position: { exerciseIndex: 0, setIndexInExercise: 1 }, dropPosition: null })
    })

    it('volta para a queda do drop set quando a série dela está concluída', () => {
        const setsByKey = new Map([[setKey('rosca', 1), setRow('rosca', 1)]])
        const restored = restoreWorkoutStep(
            snapshotWithDropSet(),
            setsByKey,
            savedStep({ exerciseIndex: 1, setIndexInExercise: 0, dropPosition: 1 }),
        )

        expect(restored).toEqual({ position: { exerciseIndex: 1, setIndexInExercise: 0 }, dropPosition: 1 })
    })

    it('troca a queda pela própria série quando a série não está concluída', () => {
        const skippedRow = setRow('rosca', 1, { completed_at: null, skipped_at: '2026-09-29T12:00:00.000Z' })
        const restored = restoreWorkoutStep(
            snapshotWithDropSet(),
            new Map([[setKey('rosca', 1), skippedRow]]),
            savedStep({ exerciseIndex: 1, setIndexInExercise: 0, dropPosition: 0 }),
        )

        expect(restored).toEqual({ position: { exerciseIndex: 1, setIndexInExercise: 0 }, dropPosition: null })
    })

    it('troca a queda pela própria série quando a queda não existe mais no plano', () => {
        const setsByKey = new Map([[setKey('rosca', 1), setRow('rosca', 1)]])
        const restored = restoreWorkoutStep(
            snapshotWithDropSet(),
            setsByKey,
            savedStep({ exerciseIndex: 1, setIndexInExercise: 0, dropPosition: 5 }),
        )

        expect(restored).toEqual({ position: { exerciseIndex: 1, setIndexInExercise: 0 }, dropPosition: null })
    })

    it('leva qualquer rodada do intervalado para o início do passo', () => {
        const restored = restoreWorkoutStep(snapshotWithDropSet(), new Map(), savedStep({ exerciseIndex: 2, setIndexInExercise: 1 }))

        expect(restored).toEqual({ position: { exerciseIndex: 2, setIndexInExercise: 0 }, dropPosition: null })
    })

    it('ignora o passo de outro treino', () => {
        expect(restoreWorkoutStep(snapshotWithDropSet(), new Map(), savedStep({ workoutKey: 'treino-b' }))).toBeNull()
    })

    it('ignora índices fora do treino atual', () => {
        const snapshot = snapshotWithDropSet()

        expect(restoreWorkoutStep(snapshot, new Map(), savedStep({ exerciseIndex: 3, setIndexInExercise: 0 }))).toBeNull()
        expect(restoreWorkoutStep(snapshot, new Map(), savedStep({ exerciseIndex: 0, setIndexInExercise: 2 }))).toBeNull()
    })

    it('sem passo guardado devolve null', () => {
        expect(restoreWorkoutStep(snapshotWithDropSet(), new Map(), null)).toBeNull()
    })
})

describe('buildSavedWorkoutStep', () => {
    it('guarda o treino, a posição e a queda do passo', () => {
        const step = { position: { exerciseIndex: 1, setIndexInExercise: 0 }, dropPosition: 1 }

        expect(buildSavedWorkoutStep(snapshotWithDropSet(), step)).toEqual({
            workoutKey: 'treino-a',
            exerciseIndex: 1,
            setIndexInExercise: 0,
            dropPosition: 1,
        })
    })
})

describe('parseSavedWorkoutSteps', () => {
    it('lê os passos guardados por data', () => {
        const raw = JSON.stringify({ '2026-09-29': savedStep() })

        expect(parseSavedWorkoutSteps(raw)).toEqual({ '2026-09-29': savedStep() })
    })

    it('trata JSON corrompido, ausente ou fora do formato como vazio', () => {
        expect(parseSavedWorkoutSteps(null)).toEqual({})
        expect(parseSavedWorkoutSteps('{não é json')).toEqual({})
        expect(parseSavedWorkoutSteps('[1, 2]')).toEqual({})
    })

    it('descarta só as entradas inválidas', () => {
        const raw = JSON.stringify({
            '2026-09-28': { ...savedStep(), exerciseIndex: -1 },
            '2026-09-29': savedStep(),
            '2026-09-30': { ...savedStep(), dropPosition: 'queda' },
            '2026-10-01': { ...savedStep(), setIndexInExercise: 1.5 },
            '2026-10-02': 'texto',
        })

        expect(parseSavedWorkoutSteps(raw)).toEqual({ '2026-09-29': savedStep() })
    })
})

describe('rememberWorkoutStep e forgetWorkoutStep', () => {
    it('substitui o passo da mesma data e mantém as outras', () => {
        const initial = { '2026-09-28': savedStep(), '2026-09-29': savedStep() }
        const updated = rememberWorkoutStep(initial, '2026-09-29', savedStep({ exerciseIndex: 1 }))

        expect(updated).toEqual({ '2026-09-28': savedStep(), '2026-09-29': savedStep({ exerciseIndex: 1 }) })
    })

    it('guarda só as datas mais recentes', () => {
        let savedSteps = {}
        for (let day = 1; day <= MAX_REMEMBERED_DATES + 2; day += 1) {
            savedSteps = rememberWorkoutStep(savedSteps, `2026-09-${String(day).padStart(2, '0')}`, savedStep())
        }

        const rememberedDates = Object.keys(savedSteps).sort()
        expect(rememberedDates).toHaveLength(MAX_REMEMBERED_DATES)
        expect(rememberedDates[0]).toBe('2026-09-03')
    })

    it('esquece só a data pedida', () => {
        const initial = { '2026-09-28': savedStep(), '2026-09-29': savedStep() }

        expect(forgetWorkoutStep(initial, '2026-09-29')).toEqual({ '2026-09-28': savedStep() })
    })
})
