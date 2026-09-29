import { describe, expect, it } from 'vitest'

import {
    buildOverlaySetRow,
    enqueueOperation,
    overlayPendingDrops,
    setValuesFromRow,
    type OutboxDropValues,
    type OutboxSetValues,
    type UpsertSetOperation,
} from '@/lib/outbox/outboxQueue'
import { setKey, type WorkoutSnapshot } from '@/features/workout/types'
import { repsSnapshotSet, SNAPSHOT_EXERCISE_DEFAULTS } from './workoutFixtures'

const SESSION_DATE = '2026-09-28'

const BASE_VALUES: OutboxSetValues = {
    loadKg: 30,
    reps: 11,
    rir: 0,
    note: null,
    completedAt: '2026-09-28T12:00:00.000Z',
    skippedAt: null,
    metric: 'repeticoes',
}

const DROPS: OutboxDropValues[] = [
    { loadKg: 22.5, reps: 9, durationSeconds: null, distanceM: null },
    { loadKg: 15, reps: 8, durationSeconds: null, distanceM: null },
]

function snapshot(): WorkoutSnapshot {
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
                exercise_key: 'triceps',
                nome: 'Tríceps',
                forma_carga: 'total',
                series: [repsSnapshotSet(1, 10, 12, 30), repsSnapshotSet(2, 10, 12, 30)],
            },
        ],
    }
}

function upsert(setIndex: number, values: OutboxSetValues, sessionDate = SESSION_DATE): UpsertSetOperation {
    return {
        kind: 'upsert_set',
        sessionDate,
        planId: 'plan-1',
        snapshot: snapshot(),
        exerciseKey: 'triceps',
        setIndex,
        values,
        enqueuedAt: '2026-09-28T12:00:00.000Z',
        attempts: 0,
        status: 'pending',
    }
}

describe('enqueueOperation com quedas de drop set', () => {
    it('escrita da série sem drops mantém as quedas ainda pendentes da escrita anterior', () => {
        const withDrops = upsert(1, { ...BASE_VALUES, drops: DROPS })
        const loadFix = upsert(1, { ...BASE_VALUES, loadKg: 32.5 })

        const queue = enqueueOperation(enqueueOperation([], withDrops), loadFix)
        const [merged] = queue as UpsertSetOperation[]

        expect(queue).toHaveLength(1)
        expect(merged.values.loadKg).toBe(32.5)
        expect(merged.values.drops).toEqual(DROPS)
    })

    it('uma lista nova de quedas, mesmo vazia, substitui a pendente', () => {
        const withDrops = upsert(1, { ...BASE_VALUES, drops: DROPS })
        const cleared = upsert(1, { ...BASE_VALUES, drops: [] })

        const [merged] = enqueueOperation(enqueueOperation([], withDrops), cleared) as UpsertSetOperation[]

        expect(merged.values.drops).toEqual([])
    })
})

describe('overlayPendingDrops', () => {
    it('a lista pendente vence a do servidor, e escrita sem drops ou de outra data não mexe', () => {
        const serverDrops = new Map([
            [setKey('triceps', 1), [DROPS[0]]],
            [setKey('triceps', 2), [DROPS[1]]],
        ])
        const operations = [
            upsert(1, { ...BASE_VALUES, drops: DROPS }),
            upsert(2, BASE_VALUES),
            upsert(2, { ...BASE_VALUES, drops: [] }, '2026-09-27'),
        ]

        const overlaid = overlayPendingDrops(serverDrops, operations, SESSION_DATE)

        expect(overlaid.get(setKey('triceps', 1))).toEqual(DROPS)
        expect(overlaid.get(setKey('triceps', 2))).toEqual([DROPS[1]])
    })

    it('mostra as quedas digitadas sem sinal numa sessão que ainda não existe no servidor', () => {
        const overlaid = overlayPendingDrops(new Map(), [upsert(2, { ...BASE_VALUES, drops: DROPS })], SESSION_DATE)

        expect(overlaid.get(setKey('triceps', 2))).toEqual(DROPS)
    })
})

describe('setValuesFromRow', () => {
    it('regrava a série exatamente como está, para mudar só as quedas', () => {
        const values: OutboxSetValues = { ...BASE_VALUES, note: 'última pesada', durationSeconds: null, distanceM: null }

        expect(setValuesFromRow(buildOverlaySetRow(upsert(1, values), undefined))).toEqual(values)
    })
})
