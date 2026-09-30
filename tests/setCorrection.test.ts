import { describe, expect, it } from 'vitest'

import type { WorkoutSetSummary } from '@/features/results/daySummary'
import {
    correctionShapeOf,
    initialCorrectionFields,
    isCorrectionBlocked,
    replaceSetRow,
    validateCorrection,
    type SetCorrectionFields,
} from '@/features/results/setCorrection'
import type { WorkoutSetRow } from '@/features/workout/types'
import type { OutboxOperation } from '@/lib/outbox/outboxQueue'

function buildSetSummary(overrides: Partial<WorkoutSetSummary>): WorkoutSetSummary {
    return {
        setId: 'set-1',
        setIndex: 1,
        loadKg: 60,
        reps: 10,
        durationSeconds: null,
        distanceM: null,
        metric: 'repeticoes',
        drops: [],
        rir: null,
        rpe: null,
        note: null,
        isCompleted: true,
        status: 'completed',
        ...overrides,
    }
}

function buildFields(overrides: Partial<SetCorrectionFields>): SetCorrectionFields {
    return { loadText: '60', resultText: '10', rirText: '', noteText: '', ...overrides }
}

function buildSetRow(overrides: Partial<WorkoutSetRow>): WorkoutSetRow {
    return {
        id: 'set-1',
        session_id: 'session-1',
        exercise_key: 'supino',
        set_index: 1,
        load_kg: 60,
        reps: 10,
        rir: null,
        note: null,
        completed_at: '2026-09-29T10:00:00.000Z',
        skipped_at: null,
        metric: 'repeticoes',
        duration_seconds: null,
        distance_m: null,
        updated_at: '2026-09-29T10:00:00.000Z',
        ...overrides,
    }
}

const PENDING_FINISH: OutboxOperation = {
    kind: 'finish_session',
    sessionDate: '2026-09-29',
    enqueuedAt: '2026-09-29T11:00:00.000Z',
    attempts: 0,
    status: 'pending',
}

describe('correctionShapeOf', () => {
    it('série de repetições abre carga; tempo e distância abrem só a medida', () => {
        expect(correctionShapeOf(buildSetSummary({}), 'total').hasLoadField).toBe(true)
        expect(correctionShapeOf(buildSetSummary({ metric: 'tempo' }), 'total').hasLoadField).toBe(false)
        expect(correctionShapeOf(buildSetSummary({ metric: 'distancia' }), 'total').hasLoadField).toBe(false)
    })

    it('comentário só aparece quando a série já tinha um', () => {
        expect(correctionShapeOf(buildSetSummary({}), 'total').hasNoteField).toBe(false)
        expect(correctionShapeOf(buildSetSummary({ note: 'ombro' }), 'total').hasNoteField).toBe(true)
    })
})

describe('initialCorrectionFields', () => {
    it('preenche com o que foi gravado, no campo da métrica da série', () => {
        expect(initialCorrectionFields(buildSetSummary({ loadKg: 22.5, rir: 2, note: 'ombro' }))).toEqual({
            loadText: '22.5',
            resultText: '10',
            rirText: '2',
            noteText: 'ombro',
        })
        expect(
            initialCorrectionFields(buildSetSummary({ metric: 'tempo', loadKg: null, reps: null, durationSeconds: 45 })),
        ).toEqual({ loadText: '', resultText: '45', rirText: '', noteText: '' })
    })
})

describe('validateCorrection', () => {
    const repsShape = correctionShapeOf(buildSetSummary({}), 'total')

    it('série de repetições grava carga, repetições e RIR, sem mexer em tempo nem distância', () => {
        expect(validateCorrection(repsShape, buildFields({ loadText: '62,5', resultText: '8', rirText: '1' }))).toEqual({
            isValid: true,
            patch: { load_kg: 62.5, reps: 8, rir: 1 },
        })
    })

    it('recusa repetições quebradas e carga vazia onde ela é obrigatória', () => {
        expect(validateCorrection(repsShape, buildFields({ resultText: '9,5' })).isValid).toBe(false)
        expect(validateCorrection(repsShape, buildFields({ loadText: '' })).isValid).toBe(false)
    })

    it('peso corporal sem lastro grava carga 0, como na confirmação', () => {
        const bodyweightShape = correctionShapeOf(buildSetSummary({}), 'peso_corporal')

        expect(validateCorrection(bodyweightShape, buildFields({ loadText: '' }))).toEqual({
            isValid: true,
            patch: { load_kg: 0, reps: 10, rir: null },
        })
    })

    it('tempo e distância gravam só a própria medida', () => {
        const timeShape = correctionShapeOf(buildSetSummary({ metric: 'tempo' }), 'total')
        const distanceShape = correctionShapeOf(buildSetSummary({ metric: 'distancia' }), 'total')

        expect(validateCorrection(timeShape, buildFields({ loadText: '', resultText: '40' }))).toEqual({
            isValid: true,
            patch: { duration_seconds: 40, rir: null },
        })
        expect(validateCorrection(timeShape, buildFields({ resultText: '30,5' })).isValid).toBe(false)
        expect(validateCorrection(distanceShape, buildFields({ resultText: '32,5' }))).toEqual({
            isValid: true,
            patch: { distance_m: 32.5, rir: null },
        })
    })

    it('RIR vazio vira nulo, e fora de 0 a 10 é recusado', () => {
        expect(validateCorrection(repsShape, buildFields({ rirText: '11' })).isValid).toBe(false)
        expect(validateCorrection(repsShape, buildFields({ rirText: '1,5' })).isValid).toBe(false)
        expect(validateCorrection(repsShape, buildFields({ rirText: '10' })).isValid).toBe(true)
    })

    it('comentário só entra no patch quando o campo existe, e apagado vira nulo', () => {
        const noteShape = correctionShapeOf(buildSetSummary({ note: 'ombro' }), 'total')

        expect(validateCorrection(noteShape, buildFields({ noteText: '  joelho  ' }))).toEqual({
            isValid: true,
            patch: { load_kg: 60, reps: 10, rir: null, note: 'joelho' },
        })
        expect(validateCorrection(noteShape, buildFields({ noteText: ' ' }))).toEqual({
            isValid: true,
            patch: { load_kg: 60, reps: 10, rir: null, note: null },
        })
    })
})

describe('isCorrectionBlocked', () => {
    it('bloqueia com qualquer operação da data na fila, pendente ou com falha', () => {
        expect(isCorrectionBlocked([], 'set-1')).toBe(false)
        expect(isCorrectionBlocked([PENDING_FINISH], 'set-1')).toBe(true)
        expect(isCorrectionBlocked([{ ...PENDING_FINISH, status: 'failed' }], 'set-1')).toBe(true)
    })

    it('bloqueia série que ainda não tem id do servidor', () => {
        expect(isCorrectionBlocked([], null)).toBe(true)
        expect(isCorrectionBlocked([], 'pending:supino:1')).toBe(true)
    })
})

describe('replaceSetRow', () => {
    it('troca só a linha corrigida, na mesma posição', () => {
        const other = buildSetRow({ id: 'set-2', set_index: 2 })
        const corrected = buildSetRow({ reps: 8 })

        expect(replaceSetRow([buildSetRow({}), other], corrected)).toEqual([corrected, other])
    })
})
