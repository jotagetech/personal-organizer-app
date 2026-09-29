import { describe, expect, it } from 'vitest'

import {
    canConfirmEntry,
    loadRequirementOf,
    parseMeasuredValues,
    resultTextOf,
    withBodyweightDefault,
} from '@/features/workout/setEntry'
import { dropsFromRows, groupDropsBySetKey, replaceDropAt } from '@/features/workout/setDrops'
import type { WorkoutSetDropRow, WorkoutSetRow } from '@/features/workout/types'
import { EMPTY_SET_METRIC_COLUMNS } from './workoutFixtures'

const EMPTY_DROP = { loadKg: null, reps: null, durationSeconds: null, distanceM: null }

describe('canConfirmEntry', () => {
    it('série de repetições exige carga e repetições inteiras', () => {
        expect(canConfirmEntry('repeticoes', 'total', '60', '10')).toBe(true)
        expect(canConfirmEntry('repeticoes', 'total', '', '10')).toBe(false)
        expect(canConfirmEntry('repeticoes', 'total', '60', '9,5')).toBe(false)
    })

    it('peso corporal aceita confirmar sem lastro, mas não com lastro inválido', () => {
        expect(canConfirmEntry('repeticoes', 'peso_corporal', '', '12')).toBe(true)
        expect(canConfirmEntry('repeticoes', 'peso_corporal', 'abc', '12')).toBe(false)
        expect(canConfirmEntry('tempo', 'peso_corporal', '', '40')).toBe(true)
    })

    it('tempo exige segundos inteiros e distância aceita metros com decimal', () => {
        expect(canConfirmEntry('tempo', 'peso_corporal', '', '')).toBe(false)
        expect(canConfirmEntry('tempo', 'peso_corporal', '', '30,5')).toBe(false)
        expect(canConfirmEntry('distancia', 'por_halter', '24', '32,5')).toBe(true)
        expect(canConfirmEntry('distancia', 'por_halter', '', '32,5')).toBe(false)
    })

    it('assistência é uma carga como as outras: obrigatória', () => {
        expect(loadRequirementOf('assistencia')).toBe('required')
        expect(canConfirmEntry('repeticoes', 'assistencia', '', '8')).toBe(false)
    })
})

describe('parseMeasuredValues', () => {
    it('preenche só a coluna de resultado da métrica da série', () => {
        expect(parseMeasuredValues('repeticoes', '22,5', '9')).toEqual({
            loadKg: 22.5,
            reps: 9,
            durationSeconds: null,
            distanceM: null,
        })
        expect(parseMeasuredValues('tempo', '', '40')).toEqual({
            loadKg: null,
            reps: null,
            durationSeconds: 40,
            distanceM: null,
        })
        expect(parseMeasuredValues('distancia', '24', '30,5')).toEqual({
            loadKg: 24,
            reps: null,
            durationSeconds: null,
            distanceM: 30.5,
        })
    })

    it('confirmar peso corporal sem lastro grava carga 0, e as outras formas ficam como estão', () => {
        const withoutLoad = parseMeasuredValues('repeticoes', '', '12')
        expect(withBodyweightDefault(withoutLoad, 'peso_corporal').loadKg).toBe(0)
        expect(withBodyweightDefault(withoutLoad, 'total').loadKg).toBeNull()
        expect(withBodyweightDefault(parseMeasuredValues('repeticoes', '10', '12'), 'peso_corporal').loadKg).toBe(10)
    })
})

describe('resultTextOf', () => {
    it('lê o resultado da coluna da métrica', () => {
        const row: WorkoutSetRow = {
            id: 'set-1',
            session_id: 'session-1',
            exercise_key: 'prancha',
            set_index: 1,
            load_kg: null,
            reps: null,
            rir: null,
            note: null,
            completed_at: null,
            skipped_at: null,
            ...EMPTY_SET_METRIC_COLUMNS,
            metric: 'tempo',
            duration_seconds: 35,
            updated_at: '2026-09-29T12:00:00.000Z',
        }

        expect(resultTextOf('tempo', row)).toBe('35')
        expect(resultTextOf('repeticoes', row)).toBe('')
        expect(resultTextOf('distancia', undefined)).toBe('')
    })
})

function dropRow(setId: string, dropIndex: number, loadKg: number, reps: number): WorkoutSetDropRow {
    return {
        id: `${setId}-${dropIndex}`,
        set_id: setId,
        drop_index: dropIndex,
        load_kg: loadKg,
        reps,
        duration_seconds: null,
        distance_m: null,
        updated_at: '2026-09-29T12:00:00.000Z',
    }
}

describe('quedas vindas do servidor', () => {
    it('ordena pela posição e preenche buracos com queda vazia', () => {
        expect(dropsFromRows([dropRow('s', 1, 20, 8), dropRow('s', 3, 10, 6)])).toEqual([
            { loadKg: 20, reps: 8, durationSeconds: null, distanceM: null },
            EMPTY_DROP,
            { loadKg: 10, reps: 6, durationSeconds: null, distanceM: null },
        ])
    })

    it('agrupa pela chave da série, ligando set_id ao exercício e índice', () => {
        const set = { id: 'set-9', exercise_key: 'triceps', set_index: 2 } as WorkoutSetRow
        const grouped = groupDropsBySetKey([set], [dropRow('set-9', 2, 15, 8), dropRow('set-9', 1, 22.5, 9)])

        expect(grouped.get('triceps:2')?.map((drop) => drop.loadKg)).toEqual([22.5, 15])
    })
})

describe('replaceDropAt', () => {
    const firstDrop = { loadKg: 22.5, reps: 9, durationSeconds: null, distanceM: null }
    const secondDrop = { loadKg: 15, reps: 8, durationSeconds: null, distanceM: null }

    it('mantém as quedas anteriores e completa com vazias até a posição', () => {
        expect(replaceDropAt([firstDrop], 1, secondDrop)).toEqual([firstDrop, secondDrop])
        expect(replaceDropAt([], 1, secondDrop)).toEqual([EMPTY_DROP, secondDrop])
    })

    it('apagar a última queda corta as vazias do fim, mas não as do meio', () => {
        expect(replaceDropAt([firstDrop, secondDrop], 1, EMPTY_DROP)).toEqual([firstDrop])
        expect(replaceDropAt([firstDrop, secondDrop], 0, EMPTY_DROP)).toEqual([EMPTY_DROP, secondDrop])
    })
})
