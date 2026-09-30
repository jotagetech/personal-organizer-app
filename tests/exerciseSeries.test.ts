import { describe, expect, it } from 'vitest'

import type { ExerciseLog, LogSession, LogSet } from '@/features/evolution/data/exerciseLog'
import { exerciseSessionSeries } from '@/features/evolution/metrics/exerciseSeries'
import { exerciseRecords } from '@/features/evolution/metrics/exerciseStats'
import type { WorkoutSnapshotExercise } from '@/lib/workoutSnapshotSchema'

import { NO_SET_REST, SNAPSHOT_EXERCISE_DEFAULTS, repsSnapshotSet } from './workoutFixtures'

const KEY = 'agachamento'
const SERIES = [repsSnapshotSet(1, 8, 10, 40), repsSnapshotSet(2, 8, 10, 40)]

function exerciseOf(
    formaCarga: WorkoutSnapshotExercise['forma_carga'],
    series: WorkoutSnapshotExercise['series'] = SERIES,
): WorkoutSnapshotExercise {
    return { ...SNAPSHOT_EXERCISE_DEFAULTS, exercise_key: KEY, nome: 'Exercício', forma_carga: formaCarga, series }
}

function sessionOf(id: string, sessionDate: string, exercise: WorkoutSnapshotExercise): LogSession {
    return {
        id,
        sessionDate,
        finishedAt: `${sessionDate}T20:00:00Z`,
        snapshot: {
            versao: 2,
            workout_key: 'a',
            nome: 'Treino A',
            semana_bloco: null,
            bloco_semanas: null,
            descricao_semana: null,
            exercicios: [exercise],
        },
    }
}

function setOf(sessionId: string, setIndex: number, loadKg: number | null, reps: number | null): LogSet {
    return {
        sessionId,
        exerciseKey: KEY,
        setIndex,
        loadKg,
        reps,
        durationSeconds: null,
        distanceM: null,
        metric: 'repeticoes',
        drops: [],
    }
}

function logOf(sessions: LogSession[], sets: LogSet[]): ExerciseLog {
    return { sessions, sets, unreadableSessionCount: 0 }
}

const LOADED_LOG = logOf(
    [sessionOf('s1', '2026-08-03', exerciseOf('total')), sessionOf('s2', '2026-08-10', exerciseOf('total'))],
    [
        setOf('s1', 1, 40, 10),
        setOf('s1', 2, 40, 8),
        {
            ...setOf('s2', 1, 50, 5),
            drops: [{ loadKg: 40, reps: 6, durationSeconds: null, distanceM: null }],
        },
        setOf('s2', 2, 45, 10),
    ],
)

describe('exerciseSessionSeries', () => {
    it('devolve um ponto por sessão em ordem cronológica, com carga, 1RM e volume', () => {
        const series = exerciseSessionSeries(LOADED_LOG, KEY)

        expect(series.map((point) => point.date)).toEqual(['2026-08-03', '2026-08-10'])
        expect(series[0]).toMatchObject({ topValue: 40, volume: 40 * 10 + 40 * 8 })
        expect(series[0].oneRepMax).toBeCloseTo(40 * (1 + 10 / 30))
        expect(series[1].topValue).toBe(50)
        expect(series[1].oneRepMax).toBeCloseTo(45 * (1 + 10 / 30))
    })

    it('inclui as quedas no volume, como nos recordes', () => {
        const series = exerciseSessionSeries(LOADED_LOG, KEY)

        expect(series[1].volume).toBe(50 * 5 + 40 * 6 + 45 * 10)
    })

    it('bate com os recordes em carga, 1RM e volume', () => {
        const series = exerciseSessionSeries(LOADED_LOG, KEY)
        const records = exerciseRecords(LOADED_LOG, KEY)

        expect(Math.max(...series.map((point) => point.topValue))).toBe(records?.maxLoad?.value)
        expect(Math.max(...series.map((point) => point.oneRepMax ?? 0))).toBeCloseTo(records?.bestOneRepMax?.value ?? 0)
        expect(Math.max(...series.map((point) => point.volume ?? 0))).toBe(records?.bestVolume?.value)
    })

    it('deixa o 1RM nulo quando nenhuma série é estimável', () => {
        const log = logOf([sessionOf('s1', '2026-08-03', exerciseOf('total'))], [setOf('s1', 1, 20, 15)])

        const [point] = exerciseSessionSeries(log, KEY)

        expect(point.topValue).toBe(20)
        expect(point.oneRepMax).toBeNull()
        expect(point.volume).toBe(300)
    })

    it('respeita o filtro de período', () => {
        const series = exerciseSessionSeries(LOADED_LOG, KEY, { from: '2026-08-05', to: null })

        expect(series.map((point) => point.date)).toEqual(['2026-08-10'])
    })

    it('usa só as sessões da forma de carga mais recente', () => {
        const log = logOf(
            [sessionOf('s1', '2026-08-03', exerciseOf('por_lado')), sessionOf('s2', '2026-08-10', exerciseOf('total'))],
            [setOf('s1', 1, 100, 10), setOf('s2', 1, 60, 10)],
        )

        const series = exerciseSessionSeries(log, KEY)

        expect(series.map((point) => point.topValue)).toEqual([60])
    })

    it('no peso corporal usa as maiores repetições e o total de repetições, sem 1RM', () => {
        const log = logOf(
            [
                sessionOf('s1', '2026-08-03', exerciseOf('peso_corporal')),
                sessionOf('s2', '2026-08-10', exerciseOf('peso_corporal')),
            ],
            [setOf('s1', 1, 0, 12), setOf('s1', 2, 0, 10), setOf('s2', 1, 5, 8), setOf('s2', 2, 0, 15)],
        )

        const series = exerciseSessionSeries(log, KEY)

        expect(series.map((point) => point.topValue)).toEqual([12, 15])
        expect(series.map((point) => point.volume)).toEqual([22, 23])
        expect(series.map((point) => point.oneRepMax)).toEqual([null, null])
    })

    it('na assistência usa a menor assistência com ao menos 1 rep, sem 1RM nem volume', () => {
        const log = logOf(
            [
                sessionOf('s1', '2026-08-03', exerciseOf('assistencia')),
                sessionOf('s2', '2026-08-10', exerciseOf('assistencia')),
            ],
            [setOf('s1', 1, 30, 8), setOf('s1', 2, 20, 6), setOf('s1', 3, 10, 0), setOf('s2', 1, 0, 3)],
        )

        const series = exerciseSessionSeries(log, KEY)

        expect(series.map((point) => point.topValue)).toEqual([20, 0])
        expect(series.every((point) => point.oneRepMax === null && point.volume === null)).toBe(true)
    })

    it('em tempo usa o maior valor, sem 1RM nem volume', () => {
        const timed = { ...SERIES[0], metrica: 'tempo' as const, ...NO_SET_REST }
        const log = logOf(
            [
                sessionOf('s1', '2026-08-03', exerciseOf('total', [timed])),
                sessionOf('s2', '2026-08-10', exerciseOf('total', [timed])),
            ],
            [
                { ...setOf('s1', 1, null, null), durationSeconds: 40, metric: 'tempo' },
                { ...setOf('s1', 2, null, null), durationSeconds: 35, metric: 'tempo' },
                { ...setOf('s2', 1, null, null), durationSeconds: 55, metric: 'tempo' },
            ],
        )

        const series = exerciseSessionSeries(log, KEY)

        expect(series.map((point) => point.topValue)).toEqual([40, 55])
        expect(series.every((point) => point.oneRepMax === null && point.volume === null)).toBe(true)
    })

    it('em distância usa a maior distância', () => {
        const distance = { ...SERIES[0], metrica: 'distancia' as const, ...NO_SET_REST }
        const log = logOf(
            [sessionOf('s1', '2026-08-03', exerciseOf('total', [distance]))],
            [
                { ...setOf('s1', 1, null, null), distanceM: 20, metric: 'distancia' },
                { ...setOf('s1', 2, null, null), distanceM: 30, metric: 'distancia' },
            ],
        )

        expect(exerciseSessionSeries(log, KEY).map((point) => point.topValue)).toEqual([30])
    })

    it('devolve vazio para chave desconhecida', () => {
        expect(exerciseSessionSeries(LOADED_LOG, 'inexistente')).toEqual([])
    })
})
