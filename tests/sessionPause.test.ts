import { describe, expect, it } from 'vitest'

import {
    activeSecondsBetween,
    canCancelStart,
    isPaused,
    pauseAt,
    pausedSecondsUntil,
    pauseStateFromSession,
    resumeAt,
    RUNNING_PAUSE_STATE,
} from '@/features/workout/sessionPause'
import type { WorkoutSetRow } from '@/features/workout/types'
import { EMPTY_SET_METRIC_COLUMNS } from './workoutFixtures'

const STARTED_AT = '2026-09-28T12:00:00.000Z'

function timeOf(iso: string): number {
    return new Date(iso).getTime()
}

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

describe('pausar e retomar', () => {
    it('acumula várias pausas encerradas', () => {
        const firstPause = pauseAt(RUNNING_PAUSE_STATE, '2026-09-28T12:10:00.000Z')
        const afterFirst = resumeAt(firstPause, '2026-09-28T12:15:00.000Z')
        const secondPause = pauseAt(afterFirst, '2026-09-28T12:30:00.000Z')
        const afterSecond = resumeAt(secondPause, '2026-09-28T12:32:30.000Z')

        expect(afterFirst).toEqual({ pausedAt: null, pausedSeconds: 300 })
        expect(afterSecond).toEqual({ pausedAt: null, pausedSeconds: 450 })
    })

    it('pausar de novo mantém o início da primeira pausa', () => {
        const paused = pauseAt(RUNNING_PAUSE_STATE, '2026-09-28T12:10:00.000Z')

        expect(pauseAt(paused, '2026-09-28T12:20:00.000Z')).toBe(paused)
        expect(isPaused(paused)).toBe(true)
    })

    it('retomar sem pausa em andamento não muda nada', () => {
        expect(resumeAt(RUNNING_PAUSE_STATE, '2026-09-28T12:10:00.000Z')).toBe(RUNNING_PAUSE_STATE)
    })

    it('relógio que voltou para trás não gera pausa negativa', () => {
        const paused = pauseAt(RUNNING_PAUSE_STATE, '2026-09-28T12:10:00.000Z')

        expect(resumeAt(paused, '2026-09-28T12:05:00.000Z')).toEqual({ pausedAt: null, pausedSeconds: 0 })
    })
})

describe('tempo de treino efetivo', () => {
    it('desconta as pausas encerradas', () => {
        const pauseState = { pausedAt: null, pausedSeconds: 600 }

        expect(activeSecondsBetween(STARTED_AT, timeOf('2026-09-28T12:30:00.000Z'), pauseState)).toBe(1200)
    })

    it('fica congelado enquanto a pausa está em andamento', () => {
        const pauseState = { pausedAt: '2026-09-28T12:20:00.000Z', pausedSeconds: 60 }
        const atPauseStart = activeSecondsBetween(STARTED_AT, timeOf('2026-09-28T12:20:00.000Z'), pauseState)
        const muchLater = activeSecondsBetween(STARTED_AT, timeOf('2026-09-28T13:40:00.000Z'), pauseState)

        expect(atPauseStart).toBe(1140)
        expect(muchLater).toBe(1140)
    })

    it('conta a pausa em andamento até o instante pedido', () => {
        const pauseState = { pausedAt: '2026-09-28T12:20:00.000Z', pausedSeconds: 60 }

        expect(pausedSecondsUntil(pauseState, timeOf('2026-09-28T12:25:00.000Z'))).toBe(360)
    })

    it('nunca fica negativo', () => {
        const pauseState = { pausedAt: null, pausedSeconds: 99_999 }

        expect(activeSecondsBetween(STARTED_AT, timeOf('2026-09-28T12:30:00.000Z'), pauseState)).toBe(0)
    })
})

describe('pauseStateFromSession', () => {
    it('lê as colunas da sessão, com sessão antiga sem elas contando sem pausa', () => {
        expect(pauseStateFromSession({ paused_at: '2026-09-28T12:20:00.000Z', paused_seconds: 90 })).toEqual({
            pausedAt: '2026-09-28T12:20:00.000Z',
            pausedSeconds: 90,
        })
        expect(pauseStateFromSession({})).toEqual(RUNNING_PAUSE_STATE)
    })
})

describe('canCancelStart', () => {
    it('permite cancelar sem nenhuma série resolvida', () => {
        expect(canCancelStart([])).toBe(true)
        expect(canCancelStart([buildSetRow({ load_kg: 50 })])).toBe(true)
    })

    it('não permite depois de uma série concluída ou pulada', () => {
        expect(canCancelStart([buildSetRow({ completed_at: '2026-09-28T12:05:00.000Z' })])).toBe(false)
        expect(canCancelStart([buildSetRow({ skipped_at: '2026-09-28T12:05:00.000Z' })])).toBe(false)
    })
})
