// Quedas de drop set como a tela as enxerga: uma lista por série, na ordem da
// ficha, em que a posição na lista é o índice da queda (a primeira é 0 aqui e
// 1 no banco). Uma queda ainda não feita é um registro com tudo nulo.

import { setKey, type WorkoutSetDropRow, type WorkoutSetRow } from '@/features/workout/types'
import type { OutboxDropValues } from '@/lib/outbox/outboxQueue'

export const EMPTY_DROP_VALUES: OutboxDropValues = {
    loadKg: null,
    reps: null,
    durationSeconds: null,
    distanceM: null,
}

function isEmptyDrop(drop: OutboxDropValues): boolean {
    return drop.loadKg === null && drop.reps === null && drop.durationSeconds === null && drop.distanceM === null
}

function dropValuesOfRow(row: WorkoutSetDropRow): OutboxDropValues {
    return {
        loadKg: row.load_kg,
        reps: row.reps,
        durationSeconds: row.duration_seconds,
        distanceM: row.distance_m,
    }
}

export function dropsFromRows(rows: WorkoutSetDropRow[]): OutboxDropValues[] {
    const drops: OutboxDropValues[] = []

    for (const row of rows) {
        const dropPosition = row.drop_index - 1
        while (drops.length < dropPosition) {
            drops.push(EMPTY_DROP_VALUES)
        }
        drops[dropPosition] = dropValuesOfRow(row)
    }

    return drops
}

export function groupDropsBySetKey(
    sets: WorkoutSetRow[],
    dropRows: WorkoutSetDropRow[],
): Map<string, OutboxDropValues[]> {
    const dropsBySetKey = new Map<string, OutboxDropValues[]>()

    for (const set of sets) {
        const rowsOfSet = dropRows
            .filter((dropRow) => dropRow.set_id === set.id)
            .sort((a, b) => a.drop_index - b.drop_index)
        if (rowsOfSet.length > 0) {
            dropsBySetKey.set(setKey(set.exercise_key, set.set_index), dropsFromRows(rowsOfSet))
        }
    }

    return dropsBySetKey
}

// A lista gravada substitui todas as quedas da série, então ela sempre leva
// as anteriores junto. Quedas vazias no fim são cortadas para apagar um valor
// não deixar registro vazio no banco; as do meio ficam para não mudar o
// índice das seguintes.
export function replaceDropAt(
    drops: OutboxDropValues[],
    dropPosition: number,
    drop: OutboxDropValues,
): OutboxDropValues[] {
    const nextDrops = [...drops]
    while (nextDrops.length <= dropPosition) {
        nextDrops.push(EMPTY_DROP_VALUES)
    }
    nextDrops[dropPosition] = drop

    while (nextDrops.length > 0 && isEmptyDrop(nextDrops[nextDrops.length - 1])) {
        nextDrops.pop()
    }

    return nextDrops
}
