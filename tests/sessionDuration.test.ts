import { describe, expect, it } from 'vitest'

import { deriveSessionActiveWindow, formatDurationMinutes } from '@/features/workout/sessionDuration'
import type { WorkoutSetRow } from '@/features/workout/types'
import { EMPTY_SET_METRIC_COLUMNS } from './workoutFixtures'

function buildSetRow(overrides: Partial<WorkoutSetRow>): WorkoutSetRow {
    const baseSet: WorkoutSetRow = {
        id: 'set-id',
        session_id: 'session-id',
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

describe('deriveSessionActiveWindow', () => {
    it('usa a menor e a maior hora de conclusão, mesmo fora de ordem', () => {
        const sets = [
            buildSetRow({ set_index: 1, completed_at: '2026-09-28T12:30:00.000Z' }),
            buildSetRow({ set_index: 0, completed_at: '2026-09-28T12:05:00.000Z' }),
            buildSetRow({ set_index: 2, completed_at: '2026-09-28T12:50:00.000Z' }),
        ]

        expect(deriveSessionActiveWindow(sets)).toEqual({
            startIso: '2026-09-28T12:05:00.000Z',
            endIso: '2026-09-28T12:50:00.000Z',
        })
    })

    it('ignora séries puladas e séries sem conclusão', () => {
        const sets = [
            buildSetRow({ set_index: 0, completed_at: '2026-09-28T12:05:00.000Z' }),
            buildSetRow({ set_index: 1, completed_at: '2026-09-28T12:20:00.000Z' }),
            buildSetRow({ set_index: 2, load_kg: null, reps: null, skipped_at: '2026-09-28T13:30:00.000Z' }),
            buildSetRow({ set_index: 3 }),
        ]

        expect(deriveSessionActiveWindow(sets)).toEqual({
            startIso: '2026-09-28T12:05:00.000Z',
            endIso: '2026-09-28T12:20:00.000Z',
        })
    })

    it('retorna null sem nenhuma série concluída', () => {
        expect(deriveSessionActiveWindow([])).toBeNull()
        expect(deriveSessionActiveWindow([buildSetRow({ skipped_at: '2026-09-28T12:00:00.000Z' })])).toBeNull()
    })

    it('retorna null com uma única série concluída', () => {
        expect(deriveSessionActiveWindow([buildSetRow({ completed_at: '2026-09-28T12:00:00.000Z' })])).toBeNull()
    })

    it('retorna null quando início e fim coincidem', () => {
        const sets = [
            buildSetRow({ set_index: 0, completed_at: '2026-09-28T12:00:00.000Z' }),
            buildSetRow({ set_index: 1, completed_at: '2026-09-28T12:00:00.000Z' }),
        ]

        expect(deriveSessionActiveWindow(sets)).toBeNull()
    })
})

describe('formatDurationMinutes', () => {
    it('formata em minutos abaixo de uma hora', () => {
        expect(formatDurationMinutes('2026-09-28T12:00:00.000Z', '2026-09-28T12:45:00.000Z')).toBe('45 min')
    })

    it('formata em horas e minutos a partir de uma hora', () => {
        expect(formatDurationMinutes('2026-09-28T12:00:00.000Z', '2026-09-28T13:05:00.000Z')).toBe('1h 5min')
    })

    it('nunca devolve duração negativa', () => {
        expect(formatDurationMinutes('2026-09-28T13:00:00.000Z', '2026-09-28T12:00:00.000Z')).toBe('0 min')
    })
})
