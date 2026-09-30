import { describe, expect, it } from 'vitest'

import {
    FINISH_WORKOUT_LABEL,
    groupChipsOf,
    groupConfirmLabel,
    groupHandoffOf,
    groupHintOf,
    groupRoundText,
    handoffAnnouncement,
} from '@/features/workout/groupPresentation'
import { groupContextOf } from '@/features/workout/supersets'
import type { WorkoutSnapshot, WorkoutSnapshotExercise } from '@/features/workout/types'
import { repsSnapshotSet, SNAPSHOT_EXERCISE_DEFAULTS } from './workoutFixtures'

function exercise(
    exerciseKey: string,
    nome: string,
    setCount: number,
    extraFields: Partial<WorkoutSnapshotExercise> = {},
): WorkoutSnapshotExercise {
    return {
        ...SNAPSHOT_EXERCISE_DEFAULTS,
        exercise_key: exerciseKey,
        nome,
        forma_carga: 'total',
        series: Array.from({ length: setCount }, (_, index) => repsSnapshotSet(index + 1, 8, 12, 30)),
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

const BI_SET = snapshotOf([
    exercise('supino', 'Supino', 4, { grupo: 'A' }),
    exercise('remada', 'Remada', 4, { grupo: 'A', por_lado: true }),
    exercise('rosca', 'Rosca', 3),
])

function contextAt(exerciseIndex: number, setIndexInExercise: number, snapshot = BI_SET) {
    return groupContextOf(snapshot, { exerciseIndex, setIndexInExercise })
}

describe('groupChipsOf e groupRoundText', () => {
    it('marca o atual, os feitos antes dele na rodada e os que faltam', () => {
        const second = contextAt(1, 1)!

        expect(groupChipsOf(second)).toEqual([
            { exerciseKey: 'supino', nome: 'Supino', state: 'done' },
            { exerciseKey: 'remada', nome: 'Remada', state: 'current' },
        ])
        expect(groupRoundText(second)).toBe('Rodada 2 de 4')
    })

    it('deixa o outro membro como faltando no primeiro da rodada', () => {
        const states = groupChipsOf(contextAt(0, 0)!).map((chip) => chip.state)

        expect(states).toEqual(['current', 'pending'])
    })

    it('tira da rodada o membro que já não tem série nela', () => {
        const snapshot = snapshotOf([
            exercise('a', 'A', 3, { grupo: 'G' }),
            exercise('b', 'B', 2, { grupo: 'G' }),
        ])

        expect(groupChipsOf(contextAt(0, 2, snapshot)!).map((chip) => chip.exerciseKey)).toEqual(['a'])
    })
})

describe('groupConfirmLabel', () => {
    it('manda ir para o próximo membro quando há um na rodada', () => {
        expect(groupConfirmLabel(contextAt(0, 0), 'Confirmar')).toBe('Confirmar e ir pra Remada')
    })

    it('mantém o rótulo base no último membro da rodada e fora de grupo', () => {
        expect(groupConfirmLabel(contextAt(1, 0), 'Confirmar')).toBe('Confirmar')
        expect(groupConfirmLabel(null, 'Confirmar')).toBe('Confirmar')
    })

    it('nunca troca o rótulo de finalizar o treino', () => {
        expect(groupConfirmLabel(contextAt(0, 0), FINISH_WORKOUT_LABEL)).toBe(FINISH_WORKOUT_LABEL)
    })
})

describe('groupHintOf', () => {
    it('avisa a troca sem descanso com o alvo do próximo, por lado quando é o caso', () => {
        expect(groupHintOf(BI_SET, contextAt(0, 0), true)).toBe(
            'Sem descanso. Remada: 8 a 12 reps por lado, sugestão 30 kg',
        )
    })

    it('omite a sugestão quando o plano não traz carga', () => {
        const snapshot = snapshotOf([
            exercise('a', 'A', 1, { grupo: 'G' }),
            exercise('b', 'B', 1, {
                grupo: 'G',
                series: [{ ...repsSnapshotSet(1, 10, 10, 0), carga_sugerida: null }],
            }),
        ])

        expect(groupHintOf(snapshot, contextAt(0, 0, snapshot), true)).toBe('Sem descanso. B: 10 reps')
    })

    it('avisa o descanso ao fechar a rodada só quando ele vai começar', () => {
        expect(groupHintOf(BI_SET, contextAt(1, 0), true)).toBe('Fim da rodada: descanso depois de confirmar')
        expect(groupHintOf(BI_SET, contextAt(1, 0), false)).toBeNull()
    })

    it('não diz nada fora de grupo', () => {
        expect(groupHintOf(BI_SET, null, true)).toBeNull()
    })
})

describe('groupHandoffOf', () => {
    it('descreve o próximo membro e o anúncio para leitor de tela', () => {
        const handoff = groupHandoffOf(BI_SET, contextAt(0, 2))!

        expect(handoff).toMatchObject({ label: 'Bi-set', nome: 'Remada', exerciseKey: 'remada', setIndexInExercise: 2 })
        expect(handoffAnnouncement(handoff)).toBe('Bi-set, sem descanso. Vai pra Remada')
    })

    it('não existe entre rodadas nem fora de grupo', () => {
        expect(groupHandoffOf(BI_SET, contextAt(1, 2))).toBeNull()
        expect(groupHandoffOf(BI_SET, contextAt(2, 0))).toBeNull()
    })
})

describe('última vez na dica do próximo membro', () => {
    it('acrescenta a última vez do próximo membro quando o histórico chegou', () => {
        const lastTimeByKey = new Map([
            [
                'remada',
                {
                    sessionDate: '2026-09-28',
                    sets: [
                        { setIndex: 1, loadKg: 40, reps: 10, durationSeconds: null, distanceM: null, metric: null },
                    ],
                },
            ],
        ])

        expect(groupHintOf(BI_SET, contextAt(0, 0), true, lastTimeByKey)).toContain(
            '. Última vez (28/09): 40 kg × 10 reps',
        )
    })
})
