import { describe, expect, it } from 'vitest'

import {
    formatIntervalPrescription,
    formatIntervalResult,
    formatIntervalSecondsRange,
} from '@/features/workout/intervalPresentation'
import {
    buildIntervalRoundValues,
    canConfirmRounds,
    roundsFromRows,
    roundsFromTimer,
    rpeFromRows,
} from '@/features/workout/intervalRounds'
import {
    countSetsByStatus,
    findFirstIncompletePosition,
    findNextUnresolvedPosition,
    firstUnresolvedSetInExercise,
    isFirstStep,
    isOnlyUnresolvedExercise,
    mainStepOf,
    retreatStep,
    stepStartOf,
} from '@/features/workout/sessionProgress'
import {
    setKey,
    type WorkoutSetRow,
    type WorkoutSnapshot,
    type WorkoutSnapshotExercise,
    type WorkoutSnapshotInterval,
} from '@/features/workout/types'
import { buildOverlaySetRow } from '@/lib/outbox/outboxQueue'
import { EMPTY_SET_METRIC_COLUMNS, repsSnapshotSet, SNAPSHOT_EXERCISE_DEFAULTS } from './workoutFixtures'

const SPRINTS: WorkoutSnapshotInterval = {
    modalidade: 'bike',
    rodadas: 3,
    trabalho_segundos_min: 30,
    trabalho_segundos_max: 30,
    recuperacao_segundos_min: 90,
    recuperacao_segundos_max: 90,
    rpe_alvo_min: 8,
    rpe_alvo_max: 8,
}

function intervalExercise(): WorkoutSnapshotExercise {
    return {
        ...SNAPSHOT_EXERCISE_DEFAULTS,
        exercise_key: 'tiros',
        nome: 'Tiros na bike',
        tipo: 'intervalado',
        intervalado: SPRINTS,
        forma_carga: 'peso_corporal',
        series: [1, 2, 3].map((setIndex) => ({
            set_index: setIndex,
            metrica: 'tempo' as const,
            alvo_min: 30,
            alvo_max: 30,
            carga_sugerida: null,
            quedas: [],
        })),
    }
}

// Supino, depois o intervalado de 3 rodadas, depois remada.
function snapshotWithInterval(): WorkoutSnapshot {
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
                series: [repsSnapshotSet(1, 8, 10, null)],
            },
            intervalExercise(),
            {
                ...SNAPSHOT_EXERCISE_DEFAULTS,
                exercise_key: 'remada',
                nome: 'Remada',
                forma_carga: 'total',
                series: [repsSnapshotSet(1, 8, 10, null)],
            },
        ],
    }
}

function row(exerciseKey: string, setIndex: number, overrides: Partial<WorkoutSetRow> = {}): WorkoutSetRow {
    return {
        id: `${exerciseKey}-${setIndex}`,
        session_id: 'sessao',
        exercise_key: exerciseKey,
        set_index: setIndex,
        load_kg: null,
        reps: null,
        rir: null,
        note: null,
        completed_at: '2026-09-29T10:00:00.000Z',
        skipped_at: null,
        ...EMPTY_SET_METRIC_COLUMNS,
        updated_at: '2026-09-29T10:00:00.000Z',
        ...overrides,
    }
}

function mapOf(rows: WorkoutSetRow[]): Map<string, WorkoutSetRow> {
    return new Map(rows.map((setRow) => [setKey(setRow.exercise_key, setRow.set_index), setRow]))
}

const INTERVAL_STEP = { exerciseIndex: 1, setIndexInExercise: 0 }

describe('sequência de passos com intervalado', () => {
    it('o intervalado inteiro é um passo, sempre na primeira rodada', () => {
        const snapshot = snapshotWithInterval()

        expect(stepStartOf(snapshot, { exerciseIndex: 1, setIndexInExercise: 2 })).toEqual(INTERVAL_STEP)
        expect(stepStartOf(snapshot, { exerciseIndex: 0, setIndexInExercise: 0 })).toEqual({
            exerciseIndex: 0,
            setIndexInExercise: 0,
        })
    })

    it('retoma no passo do intervalado mesmo com rodadas já feitas', () => {
        const snapshot = snapshotWithInterval()
        const sets = mapOf([row('supino', 1), row('tiros', 1)])

        expect(findFirstIncompletePosition(snapshot, sets)).toEqual(INTERVAL_STEP)
        expect(firstUnresolvedSetInExercise(snapshot, sets, 1)).toEqual(INTERVAL_STEP)
    })

    it('saindo do intervalado, o próximo passo é o exercício seguinte', () => {
        const snapshot = snapshotWithInterval()
        const sets = mapOf([row('supino', 1)])

        expect(findNextUnresolvedPosition(snapshot, sets, INTERVAL_STEP)).toEqual({
            exerciseIndex: 2,
            setIndexInExercise: 0,
        })
    })

    it('a volta para trás a partir do intervalado vai para a série anterior, e do seguinte cai no intervalado', () => {
        const snapshot = snapshotWithInterval()
        const sets = mapOf([])

        expect(retreatStep(snapshot, sets, mainStepOf(INTERVAL_STEP))).toEqual(
            mainStepOf({ exerciseIndex: 0, setIndexInExercise: 0 }),
        )
        expect(retreatStep(snapshot, sets, mainStepOf({ exerciseIndex: 2, setIndexInExercise: 0 }))).toEqual(
            mainStepOf(INTERVAL_STEP),
        )
    })

    it('treino que começa pelo intervalado tem nele o primeiro passo', () => {
        const snapshot = { ...snapshotWithInterval(), exercicios: [intervalExercise()] }

        expect(isFirstStep(mainStepOf(stepStartOf(snapshot, { exerciseIndex: 0, setIndexInExercise: 2 })))).toBe(true)
    })

    it('sabe quando só falta o intervalado para fechar o treino', () => {
        const snapshot = snapshotWithInterval()

        expect(isOnlyUnresolvedExercise(snapshot, mapOf([row('supino', 1)]), 1)).toBe(false)
        expect(isOnlyUnresolvedExercise(snapshot, mapOf([row('supino', 1), row('remada', 1)]), 1)).toBe(true)
    })

    it('cada rodada conta no progresso como uma série', () => {
        const snapshot = snapshotWithInterval()
        const skippedRound = row('tiros', 2, { completed_at: null, skipped_at: '2026-09-29T10:05:00Z' })
        const sets = mapOf([row('tiros', 1), skippedRound])

        expect(countSetsByStatus(snapshot, sets)).toEqual({ completed: 1, skipped: 1, pending: 3, total: 5 })
    })
})

describe('conferência das rodadas', () => {
    it('monta as rodadas do timer, com as que não começaram como puladas', () => {
        const rounds = roundsFromTimer(intervalExercise(), [
            { status: 'feita', workSeconds: 30, endedAtMs: Date.parse('2026-09-29T10:00:30.000Z') },
            { status: 'pulada', workSeconds: null, endedAtMs: Date.parse('2026-09-29T10:02:30.000Z') },
        ])

        expect(rounds).toEqual([
            { setIndex: 1, status: 'feita', secondsText: '30', resolvedAtIso: '2026-09-29T10:00:30.000Z' },
            { setIndex: 2, status: 'pulada', secondsText: '', resolvedAtIso: '2026-09-29T10:02:30.000Z' },
            { setIndex: 3, status: 'pulada', secondsText: '', resolvedAtIso: null },
        ])
    })

    it('sem registro, lança todas as rodadas como feitas no alvo', () => {
        const rounds = roundsFromRows(intervalExercise(), new Map())

        expect(rounds.map((round) => [round.status, round.secondsText])).toEqual([
            ['feita', '30'],
            ['feita', '30'],
            ['feita', '30'],
        ])
    })

    it('reabre o que já estava gravado, com o RPE do bloco', () => {
        const sets = mapOf([
            row('tiros', 1, { metric: 'tempo', duration_seconds: 28, rpe: 9 }),
            row('tiros', 2, { completed_at: null, skipped_at: '2026-09-29T10:03:00.000Z' }),
        ])

        expect(roundsFromRows(intervalExercise(), sets).map((round) => [round.status, round.secondsText])).toEqual([
            ['feita', '28'],
            ['pulada', '30'],
            ['feita', '30'],
        ])
        expect(rpeFromRows(intervalExercise(), sets)).toBe(9)
    })

    it('só confirma com tempo inteiro positivo em toda rodada feita', () => {
        const rounds = roundsFromRows(intervalExercise(), new Map())

        expect(canConfirmRounds(rounds, 8)).toBe(true)
        expect(canConfirmRounds([{ ...rounds[0], secondsText: '0' }, ...rounds.slice(1)], null)).toBe(false)
        expect(canConfirmRounds([{ ...rounds[0], secondsText: '', status: 'pulada' }, ...rounds.slice(1)], null)).toBe(true)
        expect(canConfirmRounds(rounds, 11)).toBe(false)
    })

    it('grava cada rodada como série de tempo com o RPE do bloco', () => {
        const rounds = [
            { setIndex: 1, status: 'feita' as const, secondsText: '30', resolvedAtIso: '2026-09-29T10:00:30.000Z' },
            { setIndex: 2, status: 'pulada' as const, secondsText: '', resolvedAtIso: null },
        ]
        const existing = mapOf([row('tiros', 2, { completed_at: null, note: 'câimbra' })])
        const values = buildIntervalRoundValues(intervalExercise(), rounds, 8, existing, '2026-09-29T10:10:00.000Z')

        expect(values).toEqual([
            {
                setIndex: 1,
                values: {
                    loadKg: null,
                    reps: null,
                    rir: null,
                    note: null,
                    completedAt: '2026-09-29T10:00:30.000Z',
                    skippedAt: null,
                    metric: 'tempo',
                    durationSeconds: 30,
                    distanceM: null,
                    rpe: 8,
                },
            },
            {
                setIndex: 2,
                values: {
                    loadKg: null,
                    reps: null,
                    rir: null,
                    note: 'câimbra',
                    completedAt: null,
                    skippedAt: '2026-09-29T10:10:00.000Z',
                    metric: 'tempo',
                    durationSeconds: null,
                    distanceM: null,
                    rpe: null,
                },
            },
        ])
    })

    it('a linha otimista da fila leva o RPE, e escrita sem RPE mantém o do servidor', () => {
        const operationBase = {
            kind: 'upsert_set' as const,
            sessionDate: '2026-09-29',
            planId: 'plano',
            snapshot: snapshotWithInterval(),
            exerciseKey: 'tiros',
            setIndex: 1,
            enqueuedAt: '2026-09-29T10:10:00.000Z',
            attempts: 0,
            status: 'pending' as const,
        }
        const values = { loadKg: null, reps: null, rir: null, note: null, completedAt: null, skippedAt: null }

        expect(buildOverlaySetRow({ ...operationBase, values: { ...values, rpe: 7 } }, undefined).rpe).toBe(7)
        expect(buildOverlaySetRow({ ...operationBase, values }, row('tiros', 1, { rpe: 9 })).rpe).toBe(9)
        const clearedRow = buildOverlaySetRow({ ...operationBase, values: { ...values, rpe: null } }, row('tiros', 1, { rpe: 9 }))
        expect(clearedRow.rpe).toBeNull()
    })
})

describe('textos do intervalado', () => {
    it('escreve a prescrição em segundos ou em minutos inteiros', () => {
        expect(formatIntervalPrescription({ ...SPRINTS, rodadas: 8 })).toBe('8 × 30 s / 90 s')
        expect(
            formatIntervalPrescription({
                ...SPRINTS,
                rodadas: 4,
                trabalho_segundos_min: 180,
                trabalho_segundos_max: 240,
                recuperacao_segundos_min: 120,
                recuperacao_segundos_max: 120,
            }),
        ).toBe('4 × 3 a 4 min / 2 min')
        expect(formatIntervalSecondsRange(90, 150)).toBe('90 a 150 s')
    })

    it('resume o que foi feito no dia', () => {
        const done = { status: 'completed' as const, durationSeconds: 30, rpe: 8 }
        const rounds = Array.from({ length: 8 }, () => done)

        expect(formatIntervalResult(SPRINTS, rounds)).toBe('8 × 30 s / 90 s · RPE 8')
        expect(
            formatIntervalResult(SPRINTS, [
                done,
                { status: 'completed', durationSeconds: 25, rpe: 9 },
                { status: 'skipped', durationSeconds: null, rpe: null },
            ]),
        ).toBe('2 × 25 a 30 s / 90 s · RPE 8 a 9 · 1 pulada')
        expect(formatIntervalResult(SPRINTS, [{ status: 'pending', durationSeconds: null, rpe: null }])).toBe(
            'não registrado',
        )
    })
})
