import { describe, expect, it } from 'vitest'

import type { WorkoutCycleRow } from '@/features/cycle/types'
import type { ExerciseLog, LogSession, LogSet } from '@/features/evolution/data/exerciseLog'
import {
    buildExerciseIndex,
    cycleDateRange,
    exerciseHistory,
    exerciseRecords,
} from '@/features/evolution/metrics/exerciseStats'
import type { WorkoutSnapshotExercise } from '@/lib/workoutSnapshotSchema'

import { NO_SET_REST, SNAPSHOT_EXERCISE_DEFAULTS, repsSnapshotSet } from './workoutFixtures'

const SQUAT = 'agachamento'
const PLANK = 'prancha'

type SnapshotSet = WorkoutSnapshotExercise['series'][number]

function snapshotExercise(key: string, name: string, series: SnapshotSet[]): WorkoutSnapshotExercise {
    return { ...SNAPSHOT_EXERCISE_DEFAULTS, exercise_key: key, nome: name, forma_carga: 'total', series }
}

function timeSnapshotSet(setIndex: number): SnapshotSet {
    return {
        set_index: setIndex,
        metrica: 'tempo',
        alvo_min: 30,
        alvo_max: 45,
        carga_sugerida: null,
        ...NO_SET_REST,
        quedas: [],
    }
}

function sessionOf(id: string, sessionDate: string, exercicios: WorkoutSnapshotExercise[]): LogSession {
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
            exercicios,
        },
    }
}

function logOf(input: Omit<ExerciseLog, 'unreadableSessionCount'>, unreadableSessionCount = 0): ExerciseLog {
    return { ...input, unreadableSessionCount }
}

function repsSet(sessionId: string, exerciseKey: string, setIndex: number, loadKg: number, reps: number): LogSet {
    return {
        sessionId,
        exerciseKey,
        setIndex,
        loadKg,
        reps,
        durationSeconds: null,
        distanceM: null,
        metric: 'repeticoes',
        drops: [],
    }
}

function timeSet(sessionId: string, exerciseKey: string, setIndex: number, durationSeconds: number): LogSet {
    return {
        sessionId,
        exerciseKey,
        setIndex,
        loadKg: null,
        reps: null,
        durationSeconds,
        distanceM: null,
        metric: 'tempo',
        drops: [],
    }
}

const SQUAT_SERIES = [repsSnapshotSet(1, 8, 10, 37.5), repsSnapshotSet(2, 8, 10, 37.5)]

const SQUAT_LOG = logOf({
    sessions: [
        sessionOf('s1', '2026-08-03', [snapshotExercise(SQUAT, 'Agachamento livre', SQUAT_SERIES)]),
        sessionOf('s2', '2026-08-10', [snapshotExercise(SQUAT, 'Agachamento livre', SQUAT_SERIES)]),
    ],
    sets: [
        repsSet('s1', SQUAT, 1, 40, 10),
        repsSet('s1', SQUAT, 2, 40, 8),
        repsSet('s2', SQUAT, 1, 50, 5),
        repsSet('s2', SQUAT, 2, 45, 10),
    ],
})

describe('exerciseRecords', () => {
    it('calcula carga, 1RM estimado e volume com a data de cada um', () => {
        const records = exerciseRecords(SQUAT_LOG, SQUAT)

        expect(records?.maxLoad).toEqual({ value: 50, date: '2026-08-10' })
        expect(records?.bestOneRepMax?.value).toBeCloseTo(45 * (1 + 10 / 30))
        expect(records?.bestOneRepMax?.date).toBe('2026-08-10')
        expect(records?.bestVolume).toEqual({ value: 40 * 10 + 40 * 8, date: '2026-08-03' })
    })

    it('ignora reps fora de 1 a 12 no 1RM, mas mantém a carga e o volume', () => {
        const log = logOf({
            sessions: [sessionOf('s1', '2026-08-03', [snapshotExercise(SQUAT, 'Agachamento', SQUAT_SERIES)])],
            sets: [repsSet('s1', SQUAT, 1, 20, 15), repsSet('s1', SQUAT, 2, 30, 0)],
        })

        const records = exerciseRecords(log, SQUAT)

        expect(records?.bestOneRepMax).toBeNull()
        expect(records?.maxLoad?.value).toBe(30)
        expect(records?.bestVolume?.value).toBe(300)
    })

    it('fica com a sessão mais antiga no empate', () => {
        const log = logOf({
            sessions: [
                sessionOf('s1', '2026-08-03', [snapshotExercise(SQUAT, 'Agachamento', SQUAT_SERIES)]),
                sessionOf('s2', '2026-08-10', [snapshotExercise(SQUAT, 'Agachamento', SQUAT_SERIES)]),
            ],
            sets: [repsSet('s1', SQUAT, 1, 40, 10), repsSet('s2', SQUAT, 1, 40, 10)],
        })

        expect(exerciseRecords(log, SQUAT)?.maxLoad?.date).toBe('2026-08-03')
    })

    it('usa só o maior tempo nas métricas de tempo, sem 1RM nem volume', () => {
        const plank = snapshotExercise(PLANK, 'Prancha', [timeSnapshotSet(1), timeSnapshotSet(2)])
        const log = logOf({
            sessions: [sessionOf('s1', '2026-08-03', [plank]), sessionOf('s2', '2026-08-10', [plank])],
            sets: [timeSet('s1', PLANK, 1, 40), timeSet('s2', PLANK, 1, 55), timeSet('s2', PLANK, 2, 50)],
        })

        const records = exerciseRecords(log, PLANK)

        expect(records?.metric).toBe('tempo')
        expect(records?.maxDuration).toEqual({ value: 55, date: '2026-08-10' })
        expect(records?.maxLoad).toBeNull()
        expect(records?.bestOneRepMax).toBeNull()
        expect(records?.bestVolume).toBeNull()
    })

    it('usa a maior distância nas métricas de distância', () => {
        const sled = snapshotExercise('sled', 'Trenó', [{ ...timeSnapshotSet(1), metrica: 'distancia' }])
        const log = logOf({
            sessions: [sessionOf('s1', '2026-08-03', [sled])],
            sets: [{ ...timeSet('s1', 'sled', 1, 0), durationSeconds: null, distanceM: 30, metric: 'distancia' }],
        })

        expect(exerciseRecords(log, 'sled')?.maxDistance).toEqual({ value: 30, date: '2026-08-03' })
    })

    it('respeita o filtro de período', () => {
        const records = exerciseRecords(SQUAT_LOG, SQUAT, { from: '2026-08-01', to: '2026-08-09' })

        expect(records?.maxLoad).toEqual({ value: 40, date: '2026-08-03' })
    })

    it('devolve nulo para exercício sem série concluída', () => {
        const log = logOf({
            sessions: [sessionOf('s1', '2026-08-03', [snapshotExercise(SQUAT, 'Agachamento', SQUAT_SERIES)])],
            sets: [],
        })

        expect(exerciseRecords(log, SQUAT)).toBeNull()
    })
})

describe('buildExerciseIndex', () => {
    it('une o exercício de dois planos que têm a mesma chave', () => {
        const log = logOf({
            sessions: [
                sessionOf('s1', '2026-08-03', [snapshotExercise(SQUAT, 'Agachamento', SQUAT_SERIES)]),
                sessionOf('s2', '2026-08-10', [snapshotExercise(SQUAT, 'Agachamento', SQUAT_SERIES)]),
            ],
            sets: [repsSet('s1', SQUAT, 1, 40, 10), repsSet('s2', SQUAT, 1, 45, 10)],
        })

        const index = buildExerciseIndex(log)

        expect(index).toHaveLength(1)
        expect(index[0].sessionCount).toBe(2)
        expect(index[0].lastDate).toBe('2026-08-10')
        expect(index[0].mainRecord).toEqual({ kind: 'maxLoad', formaCarga: 'total', value: 45, date: '2026-08-10' })
    })

    it('guarda o nome mais recente e os anteriores diferentes', () => {
        const log = logOf({
            sessions: [
                sessionOf('s1', '2026-08-03', [snapshotExercise(SQUAT, 'Agacho', SQUAT_SERIES)]),
                sessionOf('s2', '2026-08-10', [snapshotExercise(SQUAT, 'Agachamento', SQUAT_SERIES)]),
                sessionOf('s3', '2026-08-17', [snapshotExercise(SQUAT, 'Agachamento livre', SQUAT_SERIES)]),
            ],
            sets: [repsSet('s1', SQUAT, 1, 40, 10), repsSet('s2', SQUAT, 1, 40, 10), repsSet('s3', SQUAT, 1, 40, 10)],
        })

        const [entry] = buildExerciseIndex(log)

        expect(entry.name).toBe('Agachamento livre')
        expect(entry.previousNames).toEqual(['Agachamento', 'Agacho'])
    })

    it('deixa de fora o exercício sem série concluída', () => {
        const log = logOf({
            sessions: [
                sessionOf('s1', '2026-08-03', [
                    snapshotExercise(SQUAT, 'Agachamento', SQUAT_SERIES),
                    snapshotExercise('remada', 'Remada', SQUAT_SERIES),
                ]),
            ],
            sets: [repsSet('s1', SQUAT, 1, 40, 10)],
        })

        expect(buildExerciseIndex(log).map((entry) => entry.key)).toEqual([SQUAT])
    })

    it('ordena pela última sessão e respeita o filtro de período', () => {
        const log = logOf({
            sessions: [
                sessionOf('s1', '2026-08-03', [snapshotExercise('remada', 'Remada', SQUAT_SERIES)]),
                sessionOf('s2', '2026-08-10', [snapshotExercise(SQUAT, 'Agachamento', SQUAT_SERIES)]),
            ],
            sets: [repsSet('s1', 'remada', 1, 30, 10), repsSet('s2', SQUAT, 1, 40, 10)],
        })

        expect(buildExerciseIndex(log).map((entry) => entry.key)).toEqual([SQUAT, 'remada'])
        expect(buildExerciseIndex(log, { from: null, to: '2026-08-05' }).map((entry) => entry.key)).toEqual(['remada'])
    })

    it('usa a métrica do snapshot quando a série não guardou a dela', () => {
        const plank = snapshotExercise(PLANK, 'Prancha', [timeSnapshotSet(1)])
        const log = logOf({
            sessions: [sessionOf('s1', '2026-08-03', [plank])],
            sets: [{ ...timeSet('s1', PLANK, 1, 40), metric: null }],
        })

        const [entry] = buildExerciseIndex(log)

        expect(entry.metric).toBe('tempo')
        expect(entry.mainRecord).toEqual({ kind: 'maxDuration', formaCarga: 'total', value: 40, date: '2026-08-03' })
    })
})

describe('exerciseHistory', () => {
    it('lista da sessão mais recente para a mais antiga, com o planejado e o feito', () => {
        const history = exerciseHistory(SQUAT_LOG, SQUAT)

        expect(history.map((entry) => entry.date)).toEqual(['2026-08-10', '2026-08-03'])
        expect(history[1].sets[0].planned).toEqual({
            metric: 'repeticoes',
            targetMin: 8,
            targetMax: 10,
            suggestedLoadKg: 37.5,
        })
        expect(history[1].sets[0].done).toMatchObject({ loadKg: 40, reps: 10 })
    })

    it('deixa o planejado nulo quando o snapshot não tinha a série', () => {
        const log = logOf({
            sessions: [sessionOf('s1', '2026-08-03', [snapshotExercise(SQUAT, 'Agachamento', [SQUAT_SERIES[0]])])],
            sets: [repsSet('s1', SQUAT, 1, 40, 10), repsSet('s1', SQUAT, 2, 40, 8)],
        })

        const [entry] = exerciseHistory(log, SQUAT)

        expect(entry.sets[1].planned).toBeNull()
    })

    it('respeita o filtro de período e devolve vazio para chave desconhecida', () => {
        expect(exerciseHistory(SQUAT_LOG, SQUAT, { from: '2026-08-05', to: null })).toHaveLength(1)
        expect(exerciseHistory(SQUAT_LOG, 'inexistente')).toEqual([])
    })
})

describe('cycleDateRange', () => {
    const cycles: WorkoutCycleRow[] = [
        { id: 'c1', user_id: 'u', start_date: '2026-07-06', created_at: '2026-07-06T00:00:00Z' },
        { id: 'c2', user_id: 'u', start_date: '2026-08-03', created_at: '2026-08-03T00:00:00Z' },
    ]

    it('vai do início ao último dia do ciclo, e sem fim no ciclo aberto', () => {
        expect(cycleDateRange(cycles, '2026-07-20')).toEqual({ from: '2026-07-06', to: '2026-08-02' })
        expect(cycleDateRange(cycles, '2026-08-20')).toEqual({ from: '2026-08-03', to: null })
    })

    it('devolve nulo antes do primeiro ciclo', () => {
        expect(cycleDateRange(cycles, '2026-06-01')).toBeNull()
    })
})

function withForm(exercise: WorkoutSnapshotExercise, formaCarga: WorkoutSnapshotExercise['forma_carga']) {
    return { ...exercise, forma_carga: formaCarga }
}

function singleExerciseLog(formaCarga: WorkoutSnapshotExercise['forma_carga'], sets: LogSet[][]): ExerciseLog {
    const sessions = sets.map((_, position) =>
        sessionOf(`s${position + 1}`, `2026-08-${String(position + 1).padStart(2, '0')}`, [
            withForm(snapshotExercise(SQUAT, 'Exercício', SQUAT_SERIES), formaCarga),
        ]),
    )

    return logOf({ sessions, sets: sets.flat() })
}

describe('exerciseRecords por forma de carga', () => {
    it('mantém os recordes de carga em por_lado e por_halter, com a forma de cada um', () => {
        const sets = [[repsSet('s1', SQUAT, 1, 40, 10), repsSet('s1', SQUAT, 2, 40, 8)]]

        const perSide = exerciseRecords(singleExerciseLog('por_lado', sets), SQUAT)
        const perDumbbell = exerciseRecords(singleExerciseLog('por_halter', sets), SQUAT)

        expect(perSide?.formaCarga).toBe('por_lado')
        expect(perSide?.maxLoad?.value).toBe(40)
        expect(perDumbbell?.formaCarga).toBe('por_halter')
        expect(perDumbbell?.bestVolume?.value).toBe(40 * 10 + 40 * 8)
        expect(perDumbbell?.bestOneRepMax?.value).toBeCloseTo(40 * (1 + 10 / 30))
    })

    it('compara repetições e lastro no peso corporal, sem 1RM e com volume em repetições', () => {
        const log = singleExerciseLog('peso_corporal', [
            [repsSet('s1', SQUAT, 1, 0, 12), repsSet('s1', SQUAT, 2, 0, 10)],
            [repsSet('s2', SQUAT, 1, 5, 8), repsSet('s2', SQUAT, 2, 0, 15)],
        ])

        const records = exerciseRecords(log, SQUAT)

        expect(records?.maxReps).toEqual({ value: 15, date: '2026-08-02' })
        expect(records?.maxBallast).toEqual({ value: 5, date: '2026-08-02' })
        expect(records?.bestVolume).toEqual({ value: 23, date: '2026-08-02' })
        expect(records?.maxLoad).toBeNull()
        expect(records?.bestOneRepMax).toBeNull()
        expect(buildExerciseIndex(log)[0].mainRecord).toMatchObject({ kind: 'maxReps', value: 15 })
    })

    it('não cria recorde de lastro quando nunca houve lastro', () => {
        const log = singleExerciseLog('peso_corporal', [[repsSet('s1', SQUAT, 1, 0, 12)]])

        expect(exerciseRecords(log, SQUAT)?.maxBallast).toBeNull()
    })

    it('usa a menor assistência com pelo menos 1 rep, e zero é o melhor valor', () => {
        const withoutZero = singleExerciseLog('assistencia', [
            [repsSet('s1', SQUAT, 1, 30, 8), repsSet('s1', SQUAT, 2, 20, 6), repsSet('s1', SQUAT, 3, 10, 0)],
        ])
        const withZero = singleExerciseLog('assistencia', [
            [repsSet('s1', SQUAT, 1, 20, 6)],
            [repsSet('s2', SQUAT, 1, 0, 3)],
        ])

        expect(exerciseRecords(withoutZero, SQUAT)?.minAssistance).toEqual({ value: 20, date: '2026-08-01' })
        expect(exerciseRecords(withZero, SQUAT)?.minAssistance).toEqual({ value: 0, date: '2026-08-02' })
        expect(exerciseRecords(withZero, SQUAT)?.bestOneRepMax).toBeNull()
        expect(exerciseRecords(withZero, SQUAT)?.bestVolume).toBeNull()
        expect(buildExerciseIndex(withZero)[0].mainRecord).toMatchObject({ kind: 'minAssistance', value: 0 })
    })

    it('calcula só com as sessões da forma mais recente e avisa das outras', () => {
        const log = logOf({
            sessions: [
                sessionOf('s1', '2026-08-03', [withForm(snapshotExercise(SQUAT, 'Agachamento', SQUAT_SERIES), 'por_lado')]),
                sessionOf('s2', '2026-08-10', [withForm(snapshotExercise(SQUAT, 'Agachamento', SQUAT_SERIES), 'total')]),
            ],
            sets: [repsSet('s1', SQUAT, 1, 100, 10), repsSet('s2', SQUAT, 1, 60, 10)],
        })

        const records = exerciseRecords(log, SQUAT)

        expect(records?.formaCarga).toBe('total')
        expect(records?.hasOtherLoadForm).toBe(true)
        expect(records?.maxLoad).toEqual({ value: 60, date: '2026-08-10' })
        expect(exerciseRecords(SQUAT_LOG, SQUAT)?.hasOtherLoadForm).toBe(false)
    })
})

describe('quedas', () => {
    const plannedDrops = [
        {
            ...repsSnapshotSet(1, 8, 10, 50),
            quedas: [{ drop_index: 1, alvo_min: 8, alvo_max: 10, carga_sugerida: 40 }],
        },
    ]
    const dropEmpty = { loadKg: null, reps: null, durationSeconds: null, distanceM: null }
    const dropLog = logOf({
        sessions: [sessionOf('s1', '2026-08-03', [snapshotExercise(SQUAT, 'Agachamento', plannedDrops)])],
        sets: [
            {
                ...repsSet('s1', SQUAT, 1, 50, 5),
                drops: [
                    { ...dropEmpty, loadKg: 40, reps: 6 },
                    { ...dropEmpty, loadKg: 30, reps: 8 },
                ],
            },
        ],
    })

    it('soma as quedas ao volume e deixa carga e 1RM só com a série principal', () => {
        const records = exerciseRecords(dropLog, SQUAT)

        expect(records?.bestVolume?.value).toBe(50 * 5 + 40 * 6 + 30 * 8)
        expect(records?.maxLoad?.value).toBe(50)
        expect(records?.bestOneRepMax?.value).toBeCloseTo(50 * (1 + 5 / 30))
    })

    it('mostra as quedas no histórico com a meta do snapshot', () => {
        const [entry] = exerciseHistory(dropLog, SQUAT)

        expect(entry.sets[0].drops).toHaveLength(2)
        expect(entry.sets[0].drops[0]).toMatchObject({
            dropIndex: 1,
            planned: { targetMin: 8, targetMax: 10, suggestedLoadKg: 40 },
            done: { loadKg: 40, reps: 6 },
        })
        expect(entry.sets[0].drops[1].planned).toBeNull()
    })
})

describe('séries sem o exercício no snapshot', () => {
    it('viram uma aparição sem planejado, com a forma de carga da aparição mais recente', () => {
        const log = logOf({
            sessions: [
                sessionOf('s1', '2026-08-03', [snapshotExercise('outro', 'Outro', SQUAT_SERIES)]),
                sessionOf('s2', '2026-08-10', [withForm(snapshotExercise(SQUAT, 'Agachamento', SQUAT_SERIES), 'por_lado')]),
            ],
            sets: [repsSet('s1', SQUAT, 1, 40, 10), repsSet('s2', SQUAT, 1, 45, 10)],
        })

        const history = exerciseHistory(log, SQUAT)

        expect(history).toHaveLength(2)
        expect(history[1].sets[0].planned).toBeNull()
        expect(history[1].formaCarga).toBe('por_lado')
        expect(history[1].name).toBe('Agachamento')
        expect(buildExerciseIndex(log).find((entry) => entry.key === SQUAT)?.sessionCount).toBe(2)
    })

    it('usam total quando nenhuma sessão descreve o exercício', () => {
        const log = logOf({
            sessions: [sessionOf('s1', '2026-08-03', [snapshotExercise('outro', 'Outro', SQUAT_SERIES)])],
            sets: [repsSet('s1', SQUAT, 1, 40, 10)],
        })

        const [entry] = exerciseHistory(log, SQUAT)

        expect(entry.formaCarga).toBe('total')
        expect(entry.sets[0].planned).toBeNull()
    })
})
