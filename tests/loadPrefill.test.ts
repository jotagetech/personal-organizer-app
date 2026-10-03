import { describe, expect, it } from 'vitest'

import type { LastTime, LastTimeSet } from '@/features/evolution/metrics/lastTime'
import { prefillLoadKgOf, type LoadPrefillSource } from '@/features/workout/loadPrefill'
import { setKey, type WorkoutSetRow } from '@/features/workout/types'

import { EMPTY_SET_METRIC_COLUMNS } from './workoutFixtures'

const EXERCISE_KEY = 'supino_reto'

function todaySet(setIndex: number, loadKg: number | null, isCompleted = true): WorkoutSetRow {
    return {
        id: `${EXERCISE_KEY}-${setIndex}`,
        session_id: 'session-1',
        exercise_key: EXERCISE_KEY,
        set_index: setIndex,
        load_kg: loadKg,
        reps: 10,
        rir: null,
        note: null,
        completed_at: isCompleted ? '2026-10-03T12:00:00.000Z' : null,
        skipped_at: null,
        ...EMPTY_SET_METRIC_COLUMNS,
        updated_at: '2026-10-03T12:00:00.000Z',
    }
}

function lastTimeSet(setIndex: number, loadKg: number | null): LastTimeSet {
    return { setIndex, loadKg, reps: 10, durationSeconds: null, distanceM: null, metric: 'repeticoes' }
}

function sourceOf(setIndex: number, todaySets: WorkoutSetRow[], lastTime: LastTime | null): LoadPrefillSource {
    const setsByKey = new Map(todaySets.map((row) => [setKey(row.exercise_key, row.set_index), row]))

    return { exerciseKey: EXERCISE_KEY, setIndex, setsByKey, lastTime }
}

const LAST_SESSION: LastTime = {
    sessionDate: '2026-09-28',
    sets: [lastTimeSet(0, 60), lastTimeSet(1, 62.5)],
}

describe('prefillLoadKgOf', () => {
    it('usa a carga da série de mesmo índice da última sessão', () => {
        expect(prefillLoadKgOf(sourceOf(1, [], LAST_SESSION))).toBe(62.5)
    })

    it('usa a última série da sessão anterior quando hoje há mais séries', () => {
        expect(prefillLoadKgOf(sourceOf(3, [], LAST_SESSION))).toBe(62.5)
    })

    it('prefere a carga concluída mais cedo no mesmo treino', () => {
        expect(prefillLoadKgOf(sourceOf(1, [todaySet(0, 65)], LAST_SESSION))).toBe(65)
    })

    it('ignora série de hoje ainda não concluída', () => {
        expect(prefillLoadKgOf(sourceOf(1, [todaySet(0, 70, false)], LAST_SESSION))).toBe(62.5)
    })

    it('não preenche sem histórico', () => {
        expect(prefillLoadKgOf(sourceOf(0, [], null))).toBeNull()
    })

    it('não preenche carga zero de peso corporal sem lastro', () => {
        const bodyweightSession: LastTime = { sessionDate: '2026-09-28', sets: [lastTimeSet(0, 0)] }
        expect(prefillLoadKgOf(sourceOf(0, [], bodyweightSession))).toBeNull()
    })
})
