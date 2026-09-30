import { describe, expect, it } from 'vitest'

import {
    advancePosition,
    countSetsByStatus,
    findFirstIncompletePosition,
    findNextUnresolvedPosition,
    firstUnresolvedSetInExercise,
    isLastPosition,
    mainStepOf,
    nextStepWithinSet,
    positionToGlobalIndex,
    retreatPosition,
    retreatStep,
    type StepPosition,
} from '@/features/workout/sessionProgress'
import { closesGroupRound, exerciseBlocksOf, groupContextOf, restAfterSet } from '@/features/workout/supersets'
import {
    setKey,
    type WorkoutSetRow,
    type WorkoutSnapshot,
    type WorkoutSnapshotExercise,
    type WorkoutSnapshotExerciseSet,
} from '@/features/workout/types'
import { EMPTY_SET_METRIC_COLUMNS, repsSnapshotSet, SNAPSHOT_EXERCISE_DEFAULTS } from './workoutFixtures'

const EXERCISE_REST = { descanso_segundos_min: 60, descanso_segundos_max: 90 }

function sets(count: number): WorkoutSnapshotExerciseSet[] {
    return Array.from({ length: count }, (_, index) => repsSnapshotSet(index + 1, 8, 12, 20))
}

function exercise(
    exerciseKey: string,
    series: WorkoutSnapshotExerciseSet[],
    extraFields: Partial<WorkoutSnapshotExercise> = {},
): WorkoutSnapshotExercise {
    return {
        ...SNAPSHOT_EXERCISE_DEFAULTS,
        ...EXERCISE_REST,
        exercise_key: exerciseKey,
        nome: exerciseKey,
        forma_carga: 'total',
        series,
        ...extraFields,
    }
}

function snapshotOf(exercicios: WorkoutSnapshotExercise[]): WorkoutSnapshot {
    return {
        versao: 2,
        workout_key: 'treino-a',
        nome: 'Treino A',
        semana_bloco: null,
        bloco_semanas: null,
        descricao_semana: null,
        exercicios,
    }
}

function position(exerciseIndex: number, setIndexInExercise: number): StepPosition {
    return { exerciseIndex, setIndexInExercise }
}

function walkOrder(snapshot: WorkoutSnapshot): [number, number][] {
    const order: [number, number][] = []
    let current: StepPosition | null = position(0, 0)
    while (current) {
        order.push([current.exerciseIndex, current.setIndexInExercise])
        current = advancePosition(snapshot, current)
    }

    return order
}

function row(exerciseKey: string, setIndex: number, status: 'completed' | 'skipped' = 'completed'): WorkoutSetRow {
    const isCompleted = status === 'completed'

    return {
        id: `${exerciseKey}-${setIndex}`,
        session_id: 'session-1',
        exercise_key: exerciseKey,
        set_index: setIndex,
        load_kg: isCompleted ? 20 : null,
        reps: isCompleted ? 10 : null,
        rir: null,
        note: null,
        completed_at: isCompleted ? '2026-09-30T10:00:00.000Z' : null,
        skipped_at: isCompleted ? null : '2026-09-30T10:00:00.000Z',
        ...EMPTY_SET_METRIC_COLUMNS,
        updated_at: '2026-09-30T10:00:00.000Z',
    }
}

function setsByKeyOf(rows: WorkoutSetRow[]): Map<string, WorkoutSetRow> {
    return new Map(rows.map((setRow) => [setKey(setRow.exercise_key, setRow.set_index), setRow]))
}

// Aquecimento avulso, bi-set de supino e remada com 3 séries cada e rosca
// avulsa no fim.
function biSetSnapshot(): WorkoutSnapshot {
    return snapshotOf([
        exercise('aquecimento', sets(1)),
        exercise('supino', sets(3), { grupo: 'A' }),
        exercise('remada', sets(3), { grupo: 'A' }),
        exercise('rosca', sets(2)),
    ])
}

// Tri-set com contagens diferentes: 3, 2 e 4 séries.
function unevenTriSetSnapshot(): WorkoutSnapshot {
    return snapshotOf([
        exercise('supino', sets(3), { grupo: 'T' }),
        exercise('remada', sets(2), { grupo: 'T' }),
        exercise('elevacao', sets(4), { grupo: 'T' }),
    ])
}

function dropSetBiSetSnapshot(): WorkoutSnapshot {
    const dropSet = {
        ...repsSnapshotSet(2, 10, 12, 30),
        quedas: [
            { drop_index: 1, alvo_min: 8, alvo_max: 10, carga_sugerida: 22.5 },
            { drop_index: 2, alvo_min: 6, alvo_max: 10, carga_sugerida: 15 },
        ],
    }

    return snapshotOf([
        exercise('supino', sets(2), { grupo: 'A' }),
        exercise('triceps', [repsSnapshotSet(1, 10, 12, 30), dropSet], { grupo: 'A' }),
    ])
}

describe('exerciseBlocksOf', () => {
    it('junta só vizinhos de séries do plano com o mesmo grupo', () => {
        const snapshot = snapshotOf([
            exercise('a', sets(1), { grupo: 'X' }),
            exercise('b', sets(1), { grupo: 'X' }),
            exercise('c', sets(1), { grupo: 'Y' }),
            exercise('d', sets(1)),
            exercise('e', sets(1), { grupo: 'Z' }),
            exercise('f', sets(1), { grupo: 'Z', extra: true }),
        ])

        expect(exerciseBlocksOf(snapshot)).toEqual([
            { grupo: 'X', exerciseIndexes: [0, 1] },
            { grupo: null, exerciseIndexes: [2] },
            { grupo: null, exerciseIndexes: [3] },
            { grupo: null, exerciseIndexes: [4] },
            { grupo: null, exerciseIndexes: [5] },
        ])
    })
})

describe('ordem do bi-set', () => {
    it('alterna os membros rodada a rodada e mantém os avulsos em sequência', () => {
        expect(walkOrder(biSetSnapshot())).toEqual([
            [0, 0],
            [1, 0],
            [2, 0],
            [1, 1],
            [2, 1],
            [1, 2],
            [2, 2],
            [3, 0],
            [3, 1],
        ])
    })

    it('no tri-set desigual, quem tem menos séries sai das rodadas finais', () => {
        expect(walkOrder(unevenTriSetSnapshot())).toEqual([
            [0, 0],
            [1, 0],
            [2, 0],
            [0, 1],
            [1, 1],
            [2, 1],
            [0, 2],
            [2, 2],
            [2, 3],
        ])
    })

    it('volta, conta e marca a última posição pela mesma ordem', () => {
        const snapshot = biSetSnapshot()

        expect(retreatPosition(snapshot, position(1, 1))).toEqual(position(2, 0))
        expect(retreatPosition(snapshot, position(3, 0))).toEqual(position(2, 2))
        expect(retreatPosition(snapshot, position(0, 0))).toEqual(position(0, 0))
        expect(positionToGlobalIndex(snapshot, position(2, 0))).toBe(2)
        expect(positionToGlobalIndex(snapshot, position(1, 1))).toBe(3)
        expect(isLastPosition(snapshot, position(3, 1))).toBe(true)
        expect(isLastPosition(snapshot, position(2, 2))).toBe(false)
    })

    it('segue para o outro membro da rodada ao resolver uma série', () => {
        const snapshot = biSetSnapshot()
        const done = setsByKeyOf([row('aquecimento', 1), row('supino', 1)])

        expect(findNextUnresolvedPosition(snapshot, done, position(1, 0))).toEqual(position(2, 0))
        expect(findFirstIncompletePosition(snapshot, done)).toEqual(position(2, 0))
    })

    it('retoma na rodada certa e passa por cima de membro pulado', () => {
        const snapshot = biSetSnapshot()
        const done = setsByKeyOf([
            row('aquecimento', 1),
            row('supino', 1),
            row('remada', 1),
            row('supino', 2),
            row('remada', 2, 'skipped'),
            row('remada', 3, 'skipped'),
        ])

        expect(findFirstIncompletePosition(snapshot, done)).toEqual(position(1, 2))
        expect(findNextUnresolvedPosition(snapshot, done, position(1, 2))).toEqual(position(3, 0))
    })

    it('na navegação livre, escolher um membro vai para a primeira série pendente dele', () => {
        const snapshot = biSetSnapshot()
        const done = setsByKeyOf([row('supino', 1), row('supino', 2)])

        expect(firstUnresolvedSetInExercise(snapshot, done, 1)).toEqual(position(1, 2))
        expect(countSetsByStatus(snapshot, done)).toEqual({ completed: 2, skipped: 0, pending: 7, total: 9 })
    })

    it('a volta para a última série da cronologia dá a volta até o início', () => {
        const snapshot = biSetSnapshot()
        const done = setsByKeyOf([row('supino', 1), row('remada', 1), row('rosca', 1), row('rosca', 2)])

        expect(findNextUnresolvedPosition(snapshot, done, position(3, 1))).toEqual(position(0, 0))
    })
})

describe('drop set dentro do bi-set', () => {
    it('as quedas continuam no passo da série e o grupo segue depois delas', () => {
        const snapshot = dropSetBiSetSnapshot()
        const dropSetPosition = position(1, 1)

        expect(walkOrder(snapshot)).toEqual([
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
        ])
        expect(nextStepWithinSet(snapshot, mainStepOf(dropSetPosition))).toEqual({
            position: dropSetPosition,
            dropPosition: 0,
        })
        expect(nextStepWithinSet(snapshot, { position: dropSetPosition, dropPosition: 1 })).toBeNull()
    })

    it('voltar do membro seguinte cai na última queda da série concluída', () => {
        const firstSetWithDrops = {
            ...repsSnapshotSet(1, 10, 12, 30),
            quedas: [
                { drop_index: 1, alvo_min: 8, alvo_max: 10, carga_sugerida: 22.5 },
                { drop_index: 2, alvo_min: 6, alvo_max: 10, carga_sugerida: 15 },
            ],
        }
        const snapshot = snapshotOf([
            exercise('triceps', [firstSetWithDrops], { grupo: 'A' }),
            exercise('supino', sets(1), { grupo: 'A' }),
        ])
        const done = setsByKeyOf([row('triceps', 1)])

        expect(retreatStep(snapshot, done, mainStepOf(position(1, 0)))).toEqual({
            position: position(0, 0),
            dropPosition: 1,
        })
    })
})

describe('descanso no grupo', () => {
    it('não descansa entre membros da rodada e descansa ao fechar a rodada', () => {
        const snapshot = biSetSnapshot()

        expect(restAfterSet(snapshot, position(1, 0))).toBeNull()
        expect(restAfterSet(snapshot, position(2, 0))).toEqual({ min: 60, max: 90 })
        expect(restAfterSet(snapshot, position(1, 2))).toBeNull()
        expect(restAfterSet(snapshot, position(2, 2))).toEqual({ min: 60, max: 90 })
    })

    it('fora do grupo o descanso continua depois de toda série', () => {
        const snapshot = biSetSnapshot()

        expect(restAfterSet(snapshot, position(0, 0))).toEqual({ min: 60, max: 90 })
        expect(restAfterSet(snapshot, position(3, 0))).toEqual({ min: 60, max: 90 })
    })

    it('usa o descanso próprio da série que fecha a rodada', () => {
        const heavyLastSet = { ...repsSnapshotSet(2, 6, 8, 40), descanso_segundos_min: 120, descanso_segundos_max: 150 }
        const snapshot = snapshotOf([
            exercise('supino', sets(2), { grupo: 'A' }),
            exercise('remada', [repsSnapshotSet(1, 8, 12, 20), heavyLastSet], { grupo: 'A' }),
        ])

        expect(restAfterSet(snapshot, position(1, 0))).toEqual({ min: 60, max: 90 })
        expect(restAfterSet(snapshot, position(1, 1))).toEqual({ min: 120, max: 150 })
    })

    it('no tri-set desigual, fecha a rodada o último membro que ainda tem aquela série', () => {
        const snapshot = snapshotOf([
            exercise('supino', sets(3), { grupo: 'T' }),
            exercise('remada', sets(2), { grupo: 'T' }),
            exercise('elevacao', sets(1), { grupo: 'T' }),
        ])

        expect(closesGroupRound(snapshot, position(2, 0))).toBe(true)
        expect(closesGroupRound(snapshot, position(0, 1))).toBe(false)
        expect(closesGroupRound(snapshot, position(1, 1))).toBe(true)
        expect(closesGroupRound(snapshot, position(0, 2))).toBe(true)
    })

    it('no drop set que fecha a rodada, o descanso é o da série depois das quedas', () => {
        const snapshot = dropSetBiSetSnapshot()

        expect(restAfterSet(snapshot, position(0, 1))).toBeNull()
        expect(restAfterSet(snapshot, position(1, 1))).toEqual({ min: 60, max: 90 })
    })

    it('membro seguinte já resolvido na rodada deixa a série atual fechar a rodada', () => {
        const snapshot = biSetSnapshot()
        const remadaSkipped = setsByKeyOf([row('remada', 2, 'skipped')])

        expect(restAfterSet(snapshot, position(1, 1), remadaSkipped)).toEqual({ min: 60, max: 90 })
        expect(restAfterSet(snapshot, position(1, 2), remadaSkipped)).toBeNull()
    })
})

describe('groupContextOf', () => {
    it('devolve null para exercício avulso', () => {
        expect(groupContextOf(biSetSnapshot(), position(0, 0))).toBeNull()
        expect(groupContextOf(biSetSnapshot(), position(3, 1))).toBeNull()
    })

    it('descreve o bi-set com a próxima série da rodada', () => {
        const snapshot = biSetSnapshot()
        const context = groupContextOf(snapshot, position(1, 1))

        expect(context).toEqual({
            grupo: 'A',
            label: 'Bi-set',
            members: [
                { exerciseIndex: 1, exerciseKey: 'supino', nome: 'supino', totalSets: 3 },
                { exerciseIndex: 2, exerciseKey: 'remada', nome: 'remada', totalSets: 3 },
            ],
            memberIndex: 0,
            round: 2,
            totalRounds: 3,
            nextInRound: {
                position: position(2, 1),
                exerciseKey: 'remada',
                nome: 'remada',
                serie: snapshot.exercicios[2].series[1],
            },
            closesRound: false,
        })
    })

    it('no último membro da rodada não há próximo e a série fecha a rodada', () => {
        const context = groupContextOf(biSetSnapshot(), position(2, 1))

        expect(context).toMatchObject({ memberIndex: 1, round: 2, nextInRound: null, closesRound: true })
    })

    it('nomeia tri-set e circuito e conta as rodadas pelo membro com mais séries', () => {
        const triSet = groupContextOf(unevenTriSetSnapshot(), position(0, 2))
        const circuit = groupContextOf(
            snapshotOf(['a', 'b', 'c', 'd'].map((key) => exercise(key, sets(2), { grupo: 'C' }))),
            position(3, 0),
        )

        expect(triSet).toMatchObject({ label: 'Tri-set', round: 3, totalRounds: 4, closesRound: false })
        expect(triSet?.nextInRound?.position).toEqual(position(2, 2))
        expect(circuit).toMatchObject({ label: 'Circuito', memberIndex: 3, closesRound: true })
    })

    it('com as séries da sessão, pula o membro já resolvido na rodada', () => {
        const snapshot = unevenTriSetSnapshot()
        const context = groupContextOf(snapshot, position(0, 0), setsByKeyOf([row('remada', 1, 'skipped')]))

        expect(context?.nextInRound?.position).toEqual(position(2, 0))
    })
})
