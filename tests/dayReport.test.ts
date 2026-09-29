import { describe, expect, it } from 'vitest'

import type { DaySummary } from '@/features/results/api'
import { buildDayReport } from '@/features/results/dayReport'
import type { RoutineRow } from '@/features/routine/types'
import type { WorkoutSetRow } from '@/features/workout/types'
import type { WorkoutSnapshot } from '@/lib/databaseTypes'
import { EMPTY_SET_METRIC_COLUMNS, repsSnapshotSet, SNAPSHOT_EXERCISE_DEFAULTS } from './workoutFixtures'

const TODAY = '2026-09-28'
const PAST_DATE = '2026-09-20'

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
    ],
}

const SNAPSHOT_WITH_THREE_SETS: WorkoutSnapshot = {
    ...SNAPSHOT,
    exercicios: [
        {
            ...SNAPSHOT.exercicios[0],
            series: [
                ...SNAPSHOT.exercicios[0].series,
                repsSnapshotSet(2, 8, 10, 40),
            ],
        },
    ],
}

function buildWorkoutSet(overrides: Partial<WorkoutSetRow>): WorkoutSetRow {
    const baseSet: WorkoutSetRow = {
        id: `set-${overrides.set_index ?? 0}`,
        session_id: 'session-1',
        exercise_key: 'supino',
        set_index: 0,
        load_kg: 40,
        reps: 10,
        rir: null,
        note: null,
        completed_at: null,
        skipped_at: null,
        ...EMPTY_SET_METRIC_COLUMNS,
        updated_at: '2026-09-28T12:00:00.000Z',
    }
    return { ...baseSet, ...overrides }
}

function buildSummary(overrides: Partial<DaySummary> = {}): DaySummary {
    const baseSummary: DaySummary = {
        workoutSession: null,
        workoutSets: [],
        cardioEntries: [],
        activityTypes: [],
        foodEntries: [],
        bodyWeightEntry: null,
        sleepEntry: null,
        routineRows: [],
    }
    return { ...baseSummary, ...overrides }
}

function buildRoutineRow(overrides: Partial<RoutineRow> = {}): RoutineRow {
    const baseRow: RoutineRow = {
        id: 'row-1',
        title: 'Item de rotina',
        source: 'manual',
        state: 'pending',
        linkKind: null,
        routineItemId: 'item-1',
        dayEntryId: null,
        dueDate: null,
        deadline: null,
        carriedFromDate: null,
    }
    return { ...baseRow, ...overrides }
}

describe('buildDayReport', () => {
    it('marca como atrasada a tarefa pendente com prazo vencido', () => {
        const rows = [
            buildRoutineRow({ id: 'a', title: 'Pagar boleto', source: 'adhoc', deadline: 'overdue' }),
            buildRoutineRow({ id: 'b', title: 'Ligar pro dentista', source: 'adhoc', deadline: 'due_today' }),
        ]

        const report = buildDayReport(buildSummary(), rows, TODAY, TODAY)

        expect(report.pendingTitles).toEqual(['Pagar boleto (atrasada)', 'Ligar pro dentista'])
    })

    it('expõe as pendências estruturadas, com o título limpo e o atraso como flag', () => {
        const rows = [
            buildRoutineRow({ id: 'a', title: 'Pagar boleto', source: 'adhoc', deadline: 'overdue' }),
            buildRoutineRow({ id: 'b', title: 'Ligar pro dentista', source: 'adhoc', deadline: 'due_today' }),
            buildRoutineRow({ id: 'c', title: 'Academia', state: 'done' }),
        ]

        const report = buildDayReport(buildSummary(), rows, TODAY, TODAY)

        expect(report.pendingItems).toEqual([
            { title: 'Pagar boleto', isOverdue: true },
            { title: 'Ligar pro dentista', isOverdue: false },
        ])
    })

    it('classifica como no_routine quando não há nenhum item de rotina no dia', () => {
        const report = buildDayReport(buildSummary(), [], TODAY, TODAY)

        expect(report.band).toBe('no_routine')
        expect(report.routineTotalCount).toBe(0)
        expect(report.pendingTitles).toEqual([])
    })

    it('classifica como complete quando todos os itens estão feitos', () => {
        const rows = [
            buildRoutineRow({ id: 'a', state: 'done' }),
            buildRoutineRow({ id: 'b', state: 'done_manual_override' }),
        ]

        const report = buildDayReport(buildSummary(), rows, TODAY, TODAY)

        expect(report.band).toBe('complete')
        expect(report.routineDoneCount).toBe(2)
        expect(report.routineTotalCount).toBe(2)
        expect(report.pendingTitles).toEqual([])
    })

    it('classifica como none quando nada foi feito', () => {
        const rows = [buildRoutineRow({ id: 'a', title: 'Academia' }), buildRoutineRow({ id: 'b', title: 'Almoço' })]

        const report = buildDayReport(buildSummary(), rows, TODAY, TODAY)

        expect(report.band).toBe('none')
        expect(report.pendingTitles).toEqual(['Academia', 'Almoço'])
    })

    it('classifica como mostly quando metade ou mais está feito', () => {
        const rows = [
            buildRoutineRow({ id: 'a', state: 'done' }),
            buildRoutineRow({ id: 'b', state: 'pending', title: 'Pendente' }),
        ]

        const report = buildDayReport(buildSummary(), rows, TODAY, TODAY)

        expect(report.band).toBe('mostly')
        expect(report.pendingTitles).toEqual(['Pendente'])
    })

    it('classifica como partial quando menos da metade está feito', () => {
        const rows = [
            buildRoutineRow({ id: 'a', state: 'done' }),
            buildRoutineRow({ id: 'b', state: 'pending', title: 'Pendente 1' }),
            buildRoutineRow({ id: 'c', state: 'pending', title: 'Pendente 2' }),
        ]

        const report = buildDayReport(buildSummary(), rows, TODAY, TODAY)

        expect(report.band).toBe('partial')
        expect(report.pendingTitles).toEqual(['Pendente 1', 'Pendente 2'])
    })

    it('usa a mesma variação de frase pra uma mesma data (determinístico)', () => {
        const rows = [buildRoutineRow({ id: 'a', state: 'done' })]

        const firstReport = buildDayReport(buildSummary(), rows, TODAY, TODAY)
        const secondReport = buildDayReport(buildSummary(), rows, TODAY, TODAY)

        expect(firstReport.headline).toBe(secondReport.headline)
    })

    it('monta destaques a partir do treino, alimentação, cardio e peso/sono, no máximo 4', () => {
        const summary = buildSummary({
            workoutSession: {
                id: 'session-1',
                user_id: 'user-1',
                session_date: TODAY,
                plan_id: 'plan-1',
                workout_key: 'treino_a',
                workout_snapshot: SNAPSHOT,
                finished_at: '2026-09-28T13:00:00.000Z',
                feeling_scale: null,
                feeling_note: null,
                created_at: '2026-09-28T12:00:00.000Z',
                updated_at: '2026-09-28T13:00:00.000Z',
            },
            workoutSets: [
                {
                    id: 'set-1',
                    session_id: 'session-1',
                    exercise_key: 'supino',
                    set_index: 0,
                    load_kg: 40,
                    reps: 10,
                    rir: 2,
                    note: null,
                    completed_at: '2026-09-28T12:10:00.000Z',
                    skipped_at: null,
                    ...EMPTY_SET_METRIC_COLUMNS,
                    updated_at: '2026-09-28T12:10:00.000Z',
                },
            ],
            foodEntries: [
                {
                    id: 'food-1',
                    user_id: 'user-1',
                    entry_date: TODAY,
                    food_name: 'Arroz',
                    quantity: 100,
                    unit: 'g',
                    meal_category: 'almoco',
                    food_item_id: null,
                    kcal: 200,
                    protein_g: 10,
                    carbs_g: 40,
                    fat_g: 2,
                    created_at: '2026-09-28T12:00:00.000Z',
                    updated_at: '2026-09-28T12:00:00.000Z',
                },
            ],
            cardioEntries: [
                {
                    id: 'cardio-1',
                    user_id: 'user-1',
                    entry_date: TODAY,
                    activity_type_id: 'corrida',
                    duration_minutes: 30,
                    distance_km: 5,
                    feeling_scale: 4,
                    feeling_note: null,
                    note: null,
                    created_at: '2026-09-28T12:00:00.000Z',
                    updated_at: '2026-09-28T12:00:00.000Z',
                },
            ],
            bodyWeightEntry: {
                id: 'weight-1',
                user_id: 'user-1',
                entry_date: TODAY,
                weight_kg: 80,
                created_at: '2026-09-28T12:00:00.000Z',
            },
            sleepEntry: {
                id: 'sleep-1',
                user_id: 'user-1',
                entry_date: TODAY,
                hours: 7.5,
                created_at: '2026-09-28T12:00:00.000Z',
            },
        })

        const report = buildDayReport(summary, [], TODAY, TODAY)

        expect(report.highlights).toHaveLength(4)
        expect(report.highlights[0]).toContain('Treino: 1 de 2 séries')
        expect(report.highlights[1]).toContain('200 kcal')
        expect(report.highlights[2]).toContain('30 min de cardio')
        expect(report.highlights[3]).toBe('Peso e sono registrados')
    })

    it('não inclui destaque de treino quando a sessão não foi finalizada', () => {
        const summary = buildSummary({
            workoutSession: {
                id: 'session-1',
                user_id: 'user-1',
                session_date: TODAY,
                plan_id: 'plan-1',
                workout_key: 'treino_a',
                workout_snapshot: SNAPSHOT,
                finished_at: null,
                feeling_scale: null,
                feeling_note: null,
                created_at: '2026-09-28T12:00:00.000Z',
                updated_at: '2026-09-28T12:00:00.000Z',
            },
        })

        const report = buildDayReport(summary, [], TODAY, TODAY)

        expect(report.highlights).toEqual([])
    })

    it('conta séries puladas no destaque e tira a duração das séries, não da sessão', () => {
        const summary = buildSummary({
            workoutSession: {
                id: 'session-1',
                user_id: 'user-1',
                session_date: TODAY,
                plan_id: 'plan-1',
                workout_key: 'treino_a',
                workout_snapshot: SNAPSHOT_WITH_THREE_SETS,
                finished_at: '2026-09-28T18:00:00.000Z',
                feeling_scale: null,
                feeling_note: null,
                created_at: '2026-09-28T08:00:00.000Z',
                updated_at: '2026-09-28T18:00:00.000Z',
            },
            workoutSets: [
                buildWorkoutSet({ set_index: 0, completed_at: '2026-09-28T12:00:00.000Z' }),
                buildWorkoutSet({ set_index: 1, completed_at: '2026-09-28T12:45:00.000Z' }),
                buildWorkoutSet({
                    set_index: 2,
                    load_kg: null,
                    reps: null,
                    completed_at: null,
                    skipped_at: '2026-09-28T12:50:00.000Z',
                }),
            ],
        })

        const report = buildDayReport(summary, [], TODAY, TODAY)

        expect(report.highlights[0]).toBe('Treino: 2 de 3 séries (1 pulada), 45 min')
    })

    it('omite a duração do destaque quando não há duas séries concluídas', () => {
        const summary = buildSummary({
            workoutSession: {
                id: 'session-1',
                user_id: 'user-1',
                session_date: TODAY,
                plan_id: 'plan-1',
                workout_key: 'treino_a',
                workout_snapshot: SNAPSHOT,
                finished_at: '2026-09-28T13:00:00.000Z',
                feeling_scale: null,
                feeling_note: null,
                created_at: '2026-09-28T12:00:00.000Z',
                updated_at: '2026-09-28T13:00:00.000Z',
            },
            workoutSets: [buildWorkoutSet({ set_index: 0, completed_at: '2026-09-28T12:10:00.000Z' })],
        })

        const report = buildDayReport(summary, [], TODAY, TODAY)

        expect(report.highlights[0]).toBe('Treino: 1 de 2 séries')
    })

    it('trata dia passado com "não foi feito" em vez de "ainda falta"', () => {
        const rows = [buildRoutineRow({ id: 'a', title: 'Academia', state: 'pending' })]

        const report = buildDayReport(buildSummary(), rows, PAST_DATE, TODAY)

        expect(report.band).toBe('none')
        expect(report.headline).not.toContain('ainda')
    })
})
