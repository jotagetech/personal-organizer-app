import { describe, expect, it } from 'vitest'

import type { BodyWeightEntryRow, SleepEntryRow } from '@/features/bodyMetrics/types'
import type { CardioActivityTypeRow, CardioEntryRow } from '@/features/cardio/types'
import {
    buildPeriodExport,
    exportFileName,
    summarizePeriodExport,
    type PeriodExportRawData,
} from '@/features/export/buildPeriodExport'
import type { FoodEntryRow } from '@/features/food/types'
import type { RoutineDayEntryRow, RoutineItemRow } from '@/features/routine/types'
import type { WorkoutSessionRow, WorkoutSetDropRow, WorkoutSetRow, WorkoutSnapshot } from '@/features/workout/types'
import { EMPTY_SET_METRIC_COLUMNS, repsSnapshotSet, SNAPSHOT_EXERCISE_DEFAULTS } from './workoutFixtures'

const PERIOD = { start: '2026-09-28', end: '2026-09-30' } // segunda a quarta
const META = {
    timezone: 'America/Sao_Paulo',
    generatedAt: '2026-09-30T23:00:00.000Z',
    currentCycleStartDate: '2026-09-01',
}

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
                repsSnapshotSet(1, 8, 10, 60),
                repsSnapshotSet(2, 8, 10, 60),
                repsSnapshotSet(3, 8, 10, null),
            ],
        },
        {
            ...SNAPSHOT_EXERCISE_DEFAULTS,
            exercise_key: 'remada',
            nome: 'Remada curvada',
            forma_carga: 'por_halter',
            series: [repsSnapshotSet(1, 10, 12, 20)],
        },
    ],
}

function buildSession(overrides: Partial<WorkoutSessionRow> = {}): WorkoutSessionRow {
    return {
        id: 'session-1',
        user_id: 'user-1',
        session_date: '2026-09-28',
        plan_id: 'plan-1',
        workout_key: 'treino_a',
        workout_snapshot: SNAPSHOT,
        finished_at: '2026-09-28T11:30:00.000Z',
        feeling_scale: 4,
        feeling_note: 'rendeu bem',
        created_at: '2026-09-28T09:00:00.000Z',
        updated_at: '2026-09-28T11:30:00.000Z',
        ...overrides,
    }
}

function buildSet(overrides: Partial<WorkoutSetRow>): WorkoutSetRow {
    return {
        id: 'set',
        session_id: 'session-1',
        exercise_key: 'supino',
        set_index: 1,
        load_kg: null,
        reps: null,
        rir: null,
        note: null,
        completed_at: null,
        skipped_at: null,
        ...EMPTY_SET_METRIC_COLUMNS,
        updated_at: '2026-09-28T10:00:00.000Z',
        ...overrides,
    }
}

function buildFood(overrides: Partial<FoodEntryRow>): FoodEntryRow {
    return {
        id: 'food',
        user_id: 'user-1',
        entry_date: '2026-09-28',
        food_name: 'Arroz',
        quantity: 100,
        unit: 'g',
        meal_category: 'almoco',
        food_item_id: 'item-arroz',
        kcal: 128,
        protein_g: 2.5,
        carbs_g: 28.1,
        fat_g: 0.2,
        created_at: '2026-09-28T12:00:00.000Z',
        updated_at: '2026-09-28T12:00:00.000Z',
        ...overrides,
    }
}

function buildCardio(overrides: Partial<CardioEntryRow>): CardioEntryRow {
    return {
        id: 'cardio',
        user_id: 'user-1',
        entry_date: '2026-09-29',
        activity_type_id: 'type-bike',
        duration_minutes: 30,
        distance_km: 12.5,
        feeling_scale: 3,
        feeling_note: null,
        note: 'ergométrica',
        created_at: '2026-09-29T18:00:00.000Z',
        updated_at: '2026-09-29T18:00:00.000Z',
        ...overrides,
    }
}

function buildRoutineItem(overrides: Partial<RoutineItemRow>): RoutineItemRow {
    return {
        id: 'routine-item',
        user_id: 'user-1',
        title: 'Academia',
        weekdays: ['segunda', 'terca', 'quarta'],
        link_kind: 'workout_finished',
        sort_order: 0,
        active_from: '2026-01-01',
        archived_on: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        ...overrides,
    }
}

function buildRoutineEntry(overrides: Partial<RoutineDayEntryRow>): RoutineDayEntryRow {
    return {
        id: 'routine-entry',
        user_id: 'user-1',
        entry_date: '2026-09-26',
        routine_item_id: null,
        title: 'Pagar boleto',
        completed_at: null,
        due_date: '2026-09-27',
        completed_on: null,
        sort_order: 0,
        created_at: '2026-09-26T08:00:00.000Z',
        updated_at: '2026-09-26T08:00:00.000Z',
        ...overrides,
    }
}

const ACTIVITY_TYPES: CardioActivityTypeRow[] = [
    { id: 'type-bike', user_id: 'user-1', name: 'Bicicleta', created_at: '2026-01-01T00:00:00.000Z' },
]

function buildBodyWeight(entryDate: string, weightKg: number): BodyWeightEntryRow {
    return {
        id: `bw-${entryDate}`,
        user_id: 'user-1',
        entry_date: entryDate,
        weight_kg: weightKg,
        created_at: `${entryDate}T07:00:00.000Z`,
    }
}

function buildSleep(entryDate: string, hours: number): SleepEntryRow {
    return {
        id: `sleep-${entryDate}`,
        user_id: 'user-1',
        entry_date: entryDate,
        hours,
        created_at: `${entryDate}T07:00:00.000Z`,
    }
}

function buildRawData(overrides: Partial<PeriodExportRawData> = {}): PeriodExportRawData {
    return {
        workoutSessions: [buildSession()],
        workoutSetDrops: [],
        workoutSets: [
            buildSet({ id: 's2', set_index: 2, load_kg: 62.5, reps: 8, rir: 1, completed_at: '2026-09-28T10:40:00.000Z' }),
            buildSet({
                id: 's1',
                set_index: 1,
                load_kg: 60,
                reps: 10,
                rir: 2,
                note: 'fácil',
                completed_at: '2026-09-28T10:00:00.000Z',
            }),
            buildSet({ id: 's3', set_index: 3, note: 'ombro', skipped_at: '2026-09-28T10:45:00.000Z' }),
        ],
        cardioEntries: [buildCardio({ id: 'c1' })],
        activityTypes: ACTIVITY_TYPES,
        foodEntries: [
            buildFood({
                id: 'f3',
                entry_date: '2026-09-29',
                food_name: 'Feijão',
                kcal: 76,
                protein_g: 4.8,
                carbs_g: 13.6,
                fat_g: 0.5,
                created_at: '2026-09-29T12:00:00.000Z',
            }),
            buildFood({
                id: 'f2',
                entry_date: '2026-09-29',
                food_name: 'Tempero caseiro',
                food_item_id: null,
                kcal: null,
                protein_g: null,
                carbs_g: null,
                fat_g: null,
                created_at: '2026-09-29T11:00:00.000Z',
            }),
            buildFood({ id: 'f1' }),
        ],
        routineItems: [buildRoutineItem({ id: 'ri-academia' })],
        routineEntries: [buildRoutineEntry({ id: 're-boleto' })],
        bodyWeightEntries: [buildBodyWeight('2026-09-30', 81.2), buildBodyWeight('2026-09-28', 81.6)],
        sleepEntries: [buildSleep('2026-09-29', 7.5)],
        ...overrides,
    }
}

describe('buildPeriodExport', () => {
    it('monta o treino com o status de cada série e a duração derivada das séries concluídas', () => {
        const periodExport = buildPeriodExport(buildRawData(), PERIOD, META)

        expect(periodExport.workouts).toHaveLength(1)
        const [workout] = periodExport.workouts
        expect(workout).toMatchObject({
            date: '2026-09-28',
            workout_name: 'Treino A',
            workout_key: 'treino_a',
            first_set_completed_at: '2026-09-28T10:00:00.000Z',
            last_set_completed_at: '2026-09-28T10:40:00.000Z',
            finished_at: '2026-09-28T11:30:00.000Z',
            duration_minutes: 40,
            feeling_scale: 4,
            feeling_note: 'rendeu bem',
        })

        const [supino, remada] = workout.exercises
        expect(supino.name).toBe('Supino reto')
        expect(supino.load_convention).toBe('total')
        expect(supino.planned[0]).toEqual({
            set_index: 1,
            metric: 'repeticoes',
            target_min: 8,
            target_max: 10,
            reps_min: 8,
            reps_max: 10,
            suggested_load_kg: 60,
            rest_seconds_min: null,
            rest_seconds_max: null,
            drops: [],
        })
        expect(supino.sets.map((set) => set.status)).toEqual(['completed', 'completed', 'skipped'])
        expect(supino.sets[0]).toEqual({
            set_index: 1,
            status: 'completed',
            load_kg: 60,
            reps: 10,
            rir: 2,
            note: 'fácil',
            duration_seconds: null,
            distance_m: null,
            drops: [],
            rpe: null,
            completed_at: '2026-09-28T10:00:00.000Z',
        })
        expect(supino.sets[2]).toMatchObject({ status: 'skipped', load_kg: null, note: 'ombro', completed_at: null })
        expect(remada.sets).toEqual([
            {
                set_index: 1,
                status: 'pending',
                load_kg: null,
                reps: null,
                rir: null,
                note: null,
                duration_seconds: null,
                distance_m: null,
                drops: [],
                rpe: null,
                completed_at: null,
            },
        ])
    })

    it('deixa a duração nula quando há menos de duas séries concluídas', () => {
        const periodExport = buildPeriodExport(
            buildRawData({ workoutSets: [buildSet({ id: 's1', completed_at: '2026-09-28T10:00:00.000Z' })] }),
            PERIOD,
            META,
        )

        expect(periodExport.workouts[0].duration_minutes).toBeNull()
        expect(periodExport.workouts[0].first_set_completed_at).toBeNull()
    })

    it('ignora registros fora do período', () => {
        const periodExport = buildPeriodExport(
            buildRawData({
                workoutSessions: [buildSession(), buildSession({ id: 'session-old', session_date: '2026-09-27' })],
                cardioEntries: [buildCardio({ id: 'c1' }), buildCardio({ id: 'c-future', entry_date: '2026-10-01' })],
            }),
            PERIOD,
            META,
        )

        expect(periodExport.workouts.map((workout) => workout.date)).toEqual(['2026-09-28'])
        expect(periodExport.cardio).toHaveLength(1)
    })

    it('ordena os treinos por data mesmo vindo fora de ordem', () => {
        const periodExport = buildPeriodExport(
            buildRawData({
                workoutSessions: [
                    buildSession({ id: 'session-3', session_date: '2026-09-30' }),
                    buildSession(),
                    buildSession({ id: 'session-2', session_date: '2026-09-29' }),
                ],
            }),
            PERIOD,
            META,
        )

        expect(periodExport.workouts.map((workout) => workout.date)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30'])
    })

    it('troca o id do tipo de atividade pelo nome no cardio', () => {
        const periodExport = buildPeriodExport(buildRawData(), PERIOD, META)

        expect(periodExport.cardio).toEqual([
            {
                date: '2026-09-29',
                activity: 'Bicicleta',
                duration_minutes: 30,
                distance_km: 12.5,
                feeling_scale: 3,
                feeling_note: null,
                note: 'ergométrica',
            },
        ])
    })

    it('ordena alimentos por data e hora de registro e soma os totais por dia', () => {
        const periodExport = buildPeriodExport(buildRawData(), PERIOD, META)

        expect(periodExport.food.map((entry) => entry.food)).toEqual(['Arroz', 'Tempero caseiro', 'Feijão'])
        expect(periodExport.food[0]).toEqual({
            date: '2026-09-28',
            meal: 'almoco',
            food: 'Arroz',
            quantity: 100,
            unit: 'g',
            kcal: 128,
            protein_g: 2.5,
            carbs_g: 28.1,
            fat_g: 0.2,
        })
        expect(periodExport.food_daily_totals).toEqual([
            { date: '2026-09-28', kcal: 128, protein_g: 3, carbs_g: 28, fat_g: 0, entries_without_nutrition: 0 },
            { date: '2026-09-29', kcal: 76, protein_g: 5, carbs_g: 14, fat_g: 1, entries_without_nutrition: 1 },
        ])
    })

    it('resolve a rotina de cada dia com os sinais do próprio período, incluindo avulsa atrasada', () => {
        const periodExport = buildPeriodExport(buildRawData(), PERIOD, META)

        expect(periodExport.routine.map((day) => day.date)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30'])
        expect(periodExport.routine[0].items).toEqual([
            { title: 'Academia', source: 'linked', state: 'done', due_date: null, overdue: false },
            { title: 'Pagar boleto', source: 'adhoc', state: 'pending', due_date: '2026-09-27', overdue: true },
        ])
        expect(periodExport.routine[1].items[0]).toMatchObject({ title: 'Academia', state: 'pending' })
        expect(periodExport.routine[2].items[1]).toMatchObject({ title: 'Pagar boleto', overdue: true })
    })

    it('tira a avulsa da rotina depois do dia em que foi concluída', () => {
        const periodExport = buildPeriodExport(
            buildRawData({
                routineEntries: [
                    buildRoutineEntry({
                        id: 're-boleto',
                        completed_at: '2026-09-29T15:00:00.000Z',
                        completed_on: '2026-09-29',
                    }),
                ],
            }),
            PERIOD,
            META,
        )

        const boletoStateByDate = periodExport.routine.map((day) => [
            day.date,
            day.items.find((item) => item.title === 'Pagar boleto')?.state ?? null,
        ])
        expect(boletoStateByDate).toEqual([
            ['2026-09-28', 'pending'],
            ['2026-09-29', 'done'],
            ['2026-09-30', null],
        ])
    })

    it('ordena peso e sono por data e preenche o meta', () => {
        const periodExport = buildPeriodExport(buildRawData(), PERIOD, META)

        expect(periodExport.body_weight).toEqual([
            { date: '2026-09-28', weight_kg: 81.6 },
            { date: '2026-09-30', weight_kg: 81.2 },
        ])
        expect(periodExport.sleep).toEqual([{ date: '2026-09-29', hours: 7.5 }])
        expect(periodExport.meta).toEqual({
            period: PERIOD,
            timezone: 'America/Sao_Paulo',
            generated_at: '2026-09-30T23:00:00.000Z',
            format_version: 1,
            current_cycle_start_date: '2026-09-01',
            units: { load: 'kg', weight: 'kg', sleep: 'hours', distance: 'km', duration: 'minutes' },
        })
    })

    it('exporta os campos do exercício e as quedas planejadas e realizadas de cada série', () => {
        const snapshot: WorkoutSnapshot = {
            versao: 2,
            workout_key: 'treino_a',
            nome: 'Treino A',
            semana_bloco: null,
            bloco_semanas: null,
            descricao_semana: null,
            exercicios: [
                {
                    exercise_key: 'triceps',
                    nome: 'Tríceps na corda',
                    tipo: 'series',
                    intervalado: null,
                    equipamento: 'cabo',
                    forma_carga: 'total',
                    por_lado: true,
                    descanso_segundos_min: 60,
                    descanso_segundos_max: 90,
                    rir_alvo_min: 0,
                    rir_alvo_max: 1,
                    observacoes: 'Última série em drop set.',
                    series: [
                        {
                            set_index: 1,
                            metrica: 'repeticoes',
                            alvo_min: 10,
                            alvo_max: 12,
                            carga_sugerida: 30,
                            descanso_segundos_min: null,
                            descanso_segundos_max: null,
                            quedas: [
                                { drop_index: 1, alvo_min: 8, alvo_max: 10, carga_sugerida: 22.5 },
                                { drop_index: 2, alvo_min: 8, alvo_max: 10, carga_sugerida: 15 },
                            ],
                        },
                        {
                            set_index: 2,
                            metrica: 'repeticoes',
                            alvo_min: 10,
                            alvo_max: 12,
                            carga_sugerida: 30,
                            descanso_segundos_min: 120,
                            descanso_segundos_max: 120,
                            quedas: [],
                        },
                    ],
                },
            ],
        }
        const dropRow = (overrides: Partial<WorkoutSetDropRow>): WorkoutSetDropRow => ({
            id: 'drop',
            set_id: 'ts1',
            drop_index: 1,
            load_kg: null,
            reps: null,
            duration_seconds: null,
            distance_m: null,
            updated_at: '2026-09-28T10:00:00.000Z',
            ...overrides,
        })
        const raw = buildRawData({
            workoutSessions: [buildSession({ workout_snapshot: snapshot })],
            workoutSets: [
                buildSet({
                    id: 'ts1',
                    exercise_key: 'triceps',
                    set_index: 1,
                    load_kg: 30,
                    reps: 11,
                    completed_at: '2026-09-28T10:00:00.000Z',
                }),
                buildSet({
                    id: 'ts2',
                    exercise_key: 'triceps',
                    set_index: 2,
                    load_kg: 30,
                    reps: 10,
                    completed_at: '2026-09-28T10:05:00.000Z',
                }),
            ],
            workoutSetDrops: [
                dropRow({ id: 'd2', drop_index: 2, load_kg: 15, reps: 7 }),
                dropRow({ id: 'd1', drop_index: 1, load_kg: 22.5, reps: 9 }),
            ],
        })

        const [exercise] = buildPeriodExport(raw, PERIOD, META).workouts[0].exercises

        expect(exercise).toMatchObject({
            equipment: 'cabo',
            per_side: true,
            rest_seconds_min: 60,
            rest_seconds_max: 90,
            target_rir_min: 0,
            target_rir_max: 1,
            notes: 'Última série em drop set.',
        })
        expect(exercise.planned[0]).toMatchObject({ rest_seconds_min: 60, rest_seconds_max: 90 })
        expect(exercise.planned[1]).toMatchObject({ rest_seconds_min: 120, rest_seconds_max: 120 })
        expect(exercise.planned[0].drops).toEqual([
            { drop_index: 1, target_min: 8, target_max: 10, suggested_load_kg: 22.5 },
            { drop_index: 2, target_min: 8, target_max: 10, suggested_load_kg: 15 },
        ])
        expect(exercise.sets[0].drops).toEqual([
            { drop_index: 1, load_kg: 22.5, reps: 9, duration_seconds: null, distance_m: null },
            { drop_index: 2, load_kg: 15, reps: 7, duration_seconds: null, distance_m: null },
        ])
        expect(exercise.sets[1].drops).toEqual([])
    })

    it('exporta série de tempo com a unidade própria e exercício antigo com os campos novos vazios', () => {
        const raw = buildRawData({
            workoutSets: [
                buildSet({
                    id: 's1',
                    set_index: 1,
                    metric: 'tempo',
                    load_kg: 0,
                    duration_seconds: 35,
                    completed_at: '2026-09-28T10:00:00.000Z',
                }),
            ],
        })

        const [supino] = buildPeriodExport(raw, PERIOD, META).workouts[0].exercises

        expect(supino.sets[0]).toMatchObject({ load_kg: 0, reps: null, duration_seconds: 35, distance_m: null })
        expect(supino).toMatchObject({
            equipment: null,
            per_side: false,
            rest_seconds_min: null,
            rest_seconds_max: null,
            target_rir_min: null,
            target_rir_max: null,
            notes: null,
        })
    })

    it('exporta o intervalado com a prescrição e cada rodada com trabalho e RPE', () => {
        const snapshot: WorkoutSnapshot = {
            ...SNAPSHOT,
            exercicios: [
                {
                    ...SNAPSHOT_EXERCISE_DEFAULTS,
                    exercise_key: 'tiros',
                    nome: 'Tiros na bike',
                    tipo: 'intervalado',
                    intervalado: {
                        modalidade: 'bike',
                        rodadas: 2,
                        trabalho_segundos_min: 30,
                        trabalho_segundos_max: 30,
                        recuperacao_segundos_min: 90,
                        recuperacao_segundos_max: 90,
                        rpe_alvo_min: 8,
                        rpe_alvo_max: 8,
                    },
                    forma_carga: 'peso_corporal',
                    series: [1, 2].map((setIndex) => ({
                        set_index: setIndex,
                        metrica: 'tempo' as const,
                        alvo_min: 30,
                        alvo_max: 30,
                        carga_sugerida: null,
                        descanso_segundos_min: null,
                        descanso_segundos_max: null,
                        quedas: [],
                    })),
                },
            ],
        }
        const raw = buildRawData({
            workoutSessions: [buildSession({ workout_snapshot: snapshot })],
            workoutSets: [
                buildSet({
                    id: 'r1',
                    exercise_key: 'tiros',
                    set_index: 1,
                    metric: 'tempo',
                    duration_seconds: 30,
                    rpe: 8,
                    completed_at: '2026-09-28T10:00:30.000Z',
                }),
            ],
        })

        const [exercise] = buildPeriodExport(raw, PERIOD, META).workouts[0].exercises

        expect(exercise).toMatchObject({
            exercise_type: 'intervalado',
            interval: {
                modality: 'bike',
                rounds: 2,
                work_seconds_min: 30,
                work_seconds_max: 30,
                recovery_seconds_min: 90,
                recovery_seconds_max: 90,
                target_rpe_min: 8,
                target_rpe_max: 8,
            },
        })
        expect(exercise.planned.map((planned) => planned.metric)).toEqual(['tempo', 'tempo'])
        expect(exercise.sets.map((set) => [set.status, set.duration_seconds, set.rpe])).toEqual([
            ['completed', 30, 8],
            ['pending', null, null],
        ])
    })

    it('exporta exercício de séries com tipo series e sem intervalado', () => {
        const [supino] = buildPeriodExport(buildRawData(), PERIOD, META).workouts[0].exercises

        expect(supino).toMatchObject({ exercise_type: 'series', interval: null })
    })

    it('exporta a semana do bloco gravada na sessão e deixa nula quando não havia bloco', () => {
        const sessionInWeek = buildSession({
            workout_snapshot: { ...SNAPSHOT, semana_bloco: 3, bloco_semanas: 4, descricao_semana: 'Mais carga' },
        })
        const [workoutInWeek] = buildPeriodExport(buildRawData({ workoutSessions: [sessionInWeek] }), PERIOD, META).workouts
        const [workoutWithoutBlock] = buildPeriodExport(buildRawData(), PERIOD, META).workouts

        expect(workoutInWeek).toMatchObject({ block_week: 3, block_weeks: 4 })
        expect(workoutWithoutBlock).toMatchObject({ block_week: null, block_weeks: null })
    })

    it('exporta o início marcado e mede a duração entre ele e o fim da sessão', () => {
        const startedSession = buildSession({ started_at: '2026-09-28T09:50:00.000Z' })
        const [startedWorkout] = buildPeriodExport(buildRawData({ workoutSessions: [startedSession] }), PERIOD, META).workouts
        const [oldWorkout] = buildPeriodExport(buildRawData(), PERIOD, META).workouts

        expect(startedWorkout).toMatchObject({
            started_at: '2026-09-28T09:50:00.000Z',
            first_set_completed_at: '2026-09-28T10:00:00.000Z',
            duration_minutes: 100,
        })
        expect(oldWorkout).toMatchObject({ started_at: null, duration_minutes: 40 })
    })

    it('exporta o tempo pausado e desconta ele da duração', () => {
        const pausedSession = buildSession({ started_at: '2026-09-28T09:50:00.000Z', paused_seconds: 20 * 60 })
        const [pausedWorkout] = buildPeriodExport(buildRawData({ workoutSessions: [pausedSession] }), PERIOD, META).workouts
        const [oldWorkout] = buildPeriodExport(buildRawData(), PERIOD, META).workouts

        expect(pausedWorkout).toMatchObject({ paused_seconds: 1200, duration_minutes: 80 })
        expect(oldWorkout).toMatchObject({ paused_seconds: 0 })
    })

    it('não expõe user_id em nenhum ponto do resultado', () => {
        const serialized = JSON.stringify(buildPeriodExport(buildRawData(), PERIOD, META))

        expect(serialized).not.toContain('user_id')
        expect(serialized).not.toContain('user-1')
    })
})

describe('summarizePeriodExport', () => {
    it('conta cada seção numa linha só', () => {
        const summary = summarizePeriodExport(buildPeriodExport(buildRawData(), PERIOD, META))

        expect(summary).toBe('1 treino, 2 séries concluídas, 1 cardio, 3 alimentos, 6 itens de rotina, 2 pesos, 1 sono')
    })

    it('usa o plural com zero registros', () => {
        const emptyRaw = buildRawData({
            workoutSessions: [],
            workoutSets: [],
            cardioEntries: [],
            foodEntries: [],
            routineItems: [],
            routineEntries: [],
            bodyWeightEntries: [],
            sleepEntries: [],
        })

        expect(summarizePeriodExport(buildPeriodExport(emptyRaw, PERIOD, META))).toBe(
            '0 treinos, 0 séries concluídas, 0 cardios, 0 alimentos, 0 itens de rotina, 0 pesos, 0 sonos',
        )
    })
})

describe('exportFileName', () => {
    it('usa as datas do período no nome do arquivo', () => {
        expect(exportFileName(PERIOD)).toBe('organizer-export_2026-09-28_2026-09-30.json')
    })
})
