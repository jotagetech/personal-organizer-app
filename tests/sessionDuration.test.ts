import { describe, expect, it } from 'vitest'

import {
    deriveSessionActiveWindow,
    durationInMinutes,
    formatDurationMinutes,
    resolveSessionDuration,
} from '@/features/workout/sessionDuration'
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

describe('resolveSessionDuration', () => {
    const sets = [
        buildSetRow({ set_index: 0, completed_at: '2026-09-28T12:10:00.000Z' }),
        buildSetRow({ set_index: 1, completed_at: '2026-09-28T12:40:00.000Z' }),
    ]

    it('usa o início marcado e o fim da sessão quando os dois existem', () => {
        const session = { started_at: '2026-09-28T12:00:00.000Z', finished_at: '2026-09-28T12:55:00.000Z' }

        expect(resolveSessionDuration(session, sets)).toEqual({
            startIso: '2026-09-28T12:00:00.000Z',
            endIso: '2026-09-28T12:55:00.000Z',
        })
    })

    it('cai na janela das séries em sessão antiga, sem início', () => {
        const withoutColumn = { finished_at: '2026-09-28T12:55:00.000Z' }
        const withNullStart = { started_at: null, finished_at: '2026-09-28T12:55:00.000Z' }
        const derivedWindow = { startIso: '2026-09-28T12:10:00.000Z', endIso: '2026-09-28T12:40:00.000Z' }

        expect(resolveSessionDuration(withoutColumn, sets)).toEqual(derivedWindow)
        expect(resolveSessionDuration(withNullStart, sets)).toEqual(derivedWindow)
    })

    it('cai na janela das séries enquanto a sessão não terminou', () => {
        const session = { started_at: '2026-09-28T12:00:00.000Z', finished_at: null }

        expect(resolveSessionDuration(session, sets)).toEqual({
            startIso: '2026-09-28T12:10:00.000Z',
            endIso: '2026-09-28T12:40:00.000Z',
        })
    })

    it('ignora horários invertidos ou inválidos', () => {
        const inverted = { started_at: '2026-09-28T13:00:00.000Z', finished_at: '2026-09-28T12:55:00.000Z' }
        const invalid = { started_at: 'ontem', finished_at: '2026-09-28T12:55:00.000Z' }

        expect(resolveSessionDuration(inverted, sets)?.startIso).toBe('2026-09-28T12:10:00.000Z')
        expect(resolveSessionDuration(invalid, sets)?.startIso).toBe('2026-09-28T12:10:00.000Z')
    })

    it('mede um treino com início marcado mesmo sem nenhuma série concluída', () => {
        const session = { started_at: '2026-09-28T12:00:00.000Z', finished_at: '2026-09-28T12:20:00.000Z' }

        expect(resolveSessionDuration(session, [])).not.toBeNull()
        expect(resolveSessionDuration({ started_at: null, finished_at: null }, [])).toBeNull()
    })
})

describe('durationInMinutes', () => {
    it('arredonda para o minuto mais próximo', () => {
        expect(durationInMinutes({ startIso: '2026-09-28T12:00:00.000Z', endIso: '2026-09-28T12:44:40.000Z' })).toBe(45)
    })
})

describe('resolveSessionDuration com pausas', () => {
    const startedAt = '2026-09-28T12:00:00.000Z'
    const finishedAt = '2026-09-28T13:00:00.000Z'

    it('desconta o total das pausas encerradas', () => {
        const session = { started_at: startedAt, finished_at: finishedAt, paused_at: null, paused_seconds: 15 * 60 }
        const activeWindow = resolveSessionDuration(session, [])

        expect(activeWindow).toEqual({ startIso: '2026-09-28T12:15:00.000Z', endIso: finishedAt })
        expect(activeWindow && formatDurationMinutes(activeWindow.startIso, activeWindow.endIso)).toBe('45 min')
    })

    it('sessão sem pausa continua com a janela do início ao fim', () => {
        const session = { started_at: startedAt, finished_at: finishedAt, paused_at: null, paused_seconds: 0 }

        expect(resolveSessionDuration(session, [])).toEqual({ startIso: startedAt, endIso: finishedAt })
    })

    it('uma pausa ainda aberta numa sessão finalizada conta até o fim', () => {
        const session = {
            started_at: startedAt,
            finished_at: finishedAt,
            paused_at: '2026-09-28T12:50:00.000Z',
            paused_seconds: 5 * 60,
        }
        const activeWindow = resolveSessionDuration(session, [])

        expect(activeWindow && durationInMinutes(activeWindow)).toBe(45)
    })

    it('pausa maior que o treino dá zero, nunca duração negativa', () => {
        const session = { started_at: startedAt, finished_at: finishedAt, paused_at: null, paused_seconds: 2 * 60 * 60 }
        const activeWindow = resolveSessionDuration(session, [])

        expect(activeWindow && durationInMinutes(activeWindow)).toBe(0)
    })

    it('ignora tempo pausado inválido', () => {
        const session = { started_at: startedAt, finished_at: finishedAt, paused_at: 'ontem', paused_seconds: -30 }

        expect(resolveSessionDuration(session, [])).toEqual({ startIso: startedAt, endIso: finishedAt })
    })
})
