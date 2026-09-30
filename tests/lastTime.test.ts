import { describe, expect, it } from 'vitest'

import {
    formatLastTimeText,
    groupLastTimeByExercise,
    lastTimeForSet,
    type LastTime,
    type LastTimeRow,
    type LastTimeSet,
} from '@/features/evolution/metrics/lastTime'

function lastSet(setIndex: number, extraFields: Partial<LastTimeSet> = {}): LastTimeSet {
    return {
        setIndex,
        loadKg: 40,
        reps: 10,
        durationSeconds: null,
        distanceM: null,
        metric: 'repeticoes',
        ...extraFields,
    }
}

const TWO_SETS: LastTime = { sessionDate: '2026-09-28', sets: [lastSet(1), lastSet(2, { loadKg: 42.5, reps: 8 })] }

describe('lastTimeForSet', () => {
    it('escolhe a série de mesmo índice', () => {
        expect(lastTimeForSet(TWO_SETS, 2)?.loadKg).toBe(42.5)
    })

    it('usa a última série quando o índice não existe na última vez', () => {
        expect(lastTimeForSet(TWO_SETS, 4)?.setIndex).toBe(2)
    })

    it('devolve nulo sem histórico', () => {
        expect(lastTimeForSet(null, 1)).toBeNull()
        expect(lastTimeForSet({ sessionDate: '2026-09-28', sets: [] }, 1)).toBeNull()
    })
})

describe('formatLastTimeText', () => {
    it('monta o texto com a data e o resultado da série de mesmo índice', () => {
        expect(formatLastTimeText(TWO_SETS, 1, 'total', 'repeticoes', false)).toBe('Última vez (28/09): 40 kg × 10 reps')
    })

    it('mostra a última série quando o índice pedido não existe', () => {
        expect(formatLastTimeText(TWO_SETS, 5, 'total', 'repeticoes', false)).toBe(
            'Última vez (28/09): 42,5 kg × 8 reps',
        )
    })

    it('mostra tempo e distância pela métrica guardada', () => {
        const timed: LastTime = {
            sessionDate: '2026-09-20',
            sets: [lastSet(1, { loadKg: 10, reps: null, durationSeconds: 35, metric: 'tempo' })],
        }
        const walked: LastTime = {
            sessionDate: '2026-09-21',
            sets: [lastSet(1, { loadKg: 24, reps: null, distanceM: 32.5, metric: 'distancia' })],
        }

        expect(formatLastTimeText(timed, 1, 'total', 'tempo', false)).toBe('Última vez (20/09): 10 kg × 35 s')
        expect(formatLastTimeText(walked, 1, 'por_halter', 'distancia', false)).toBe(
            'Última vez (21/09): 24 kg por halter × 32,5 m',
        )
    })

    it('usa a métrica da série de hoje quando a guardada é ausente, e o lado do exercício', () => {
        const legacy: LastTime = { sessionDate: '2026-09-28', sets: [lastSet(1, { metric: null })] }

        expect(formatLastTimeText(legacy, 1, 'por_halter', 'repeticoes', true)).toBe(
            'Última vez (28/09): 40 kg por halter × 10 reps por lado',
        )
    })

    it('devolve nulo sem histórico', () => {
        expect(formatLastTimeText(null, 1, 'total', 'repeticoes', false)).toBeNull()
    })
})

describe('groupLastTimeByExercise', () => {
    function row(exerciseKey: string, sessionDate: string, setIndex: number, loadKg: number): LastTimeRow {
        return { ...lastSet(setIndex, { loadKg }), exerciseKey, sessionDate }
    }

    it('fica com a sessão mais recente de cada chave e ordena as séries', () => {
        const grouped = groupLastTimeByExercise([
            row('supino', '2026-09-20', 1, 30),
            row('supino', '2026-09-28', 2, 41),
            row('supino', '2026-09-28', 1, 40),
            row('remada', '2026-09-10', 1, 50),
        ])

        expect(grouped.get('supino')?.sessionDate).toBe('2026-09-28')
        expect(grouped.get('supino')?.sets.map((set) => set.loadKg)).toEqual([40, 41])
        expect(grouped.get('remada')?.sessionDate).toBe('2026-09-10')
        expect(grouped.has('agachamento')).toBe(false)
    })
})
