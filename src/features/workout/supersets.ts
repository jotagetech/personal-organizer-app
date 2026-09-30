// Bi-set, tri-set e circuito: exercícios vizinhos com o mesmo `grupo` no
// snapshot são feitos em rodadas, uma série de cada membro por vez, e o
// descanso só vem depois da série que fecha a rodada. Tudo aqui é puro e lê
// só o snapshot (e, quando informado, o que já foi resolvido na sessão).

import { snapshotSetRest, type RestRange } from '@/features/workout/restPrescription'
import { isSetResolved, type StepPosition } from '@/features/workout/sessionProgress'
import {
    setKey,
    type WorkoutSetRow,
    type WorkoutSnapshot,
    type WorkoutSnapshotExercise,
    type WorkoutSnapshotExerciseSet,
} from '@/features/workout/types'

const MIN_GROUP_MEMBERS = 2
const TRI_SET_MEMBERS = 3

// Bloco de exercícios na ordem da ficha: um exercício sozinho (grupo nulo) ou
// os membros de um grupo, sempre índices consecutivos do snapshot.
export type ExerciseBlock = { grupo: string | null; exerciseIndexes: number[] }

// Só exercício de séries do plano entra em grupo. O contrato já recusa grupo
// em intervalado e o extra nunca leva o rótulo, mas o snapshot também chega
// do banco e da fila local, então a leitura não confia nisso: um rótulo que
// sobrou sozinho ou fora dessas condições vale como exercício avulso.
function groupLabelOf(exercicio: WorkoutSnapshotExercise): string | null {
    const isGroupable = exercicio.tipo === 'series' && exercicio.extra !== true
    const grupo = isGroupable ? (exercicio.grupo ?? null) : null

    return grupo
}

export function exerciseBlocksOf(snapshot: WorkoutSnapshot): ExerciseBlock[] {
    const blocks: ExerciseBlock[] = []

    snapshot.exercicios.forEach((exercicio, exerciseIndex) => {
        const grupo = groupLabelOf(exercicio)
        const previousBlock = blocks[blocks.length - 1]
        if (grupo !== null && previousBlock?.grupo === grupo) {
            previousBlock.exerciseIndexes.push(exerciseIndex)
            return
        }
        blocks.push({ grupo, exerciseIndexes: [exerciseIndex] })
    })

    const blocksWithRealGroups = blocks.flatMap((block): ExerciseBlock[] => {
        const isRealGroup = block.grupo !== null && block.exerciseIndexes.length >= MIN_GROUP_MEMBERS
        if (isRealGroup) {
            return [block]
        }

        return block.exerciseIndexes.map((exerciseIndex) => ({ grupo: null, exerciseIndexes: [exerciseIndex] }))
    })

    return blocksWithRealGroups
}

function groupBlockOf(snapshot: WorkoutSnapshot, exerciseIndex: number): ExerciseBlock | null {
    const block = exerciseBlocksOf(snapshot).find(
        (candidate) => candidate.grupo !== null && candidate.exerciseIndexes.includes(exerciseIndex),
    )

    return block ?? null
}

// Rodada r (a partir de 0) do grupo: a série r de cada membro, na ordem da
// ficha. Um membro com menos séries simplesmente sai das rodadas finais.
export function groupRoundPositions(snapshot: WorkoutSnapshot, block: ExerciseBlock, round: number): StepPosition[] {
    const positions = block.exerciseIndexes
        .filter((exerciseIndex) => round < snapshot.exercicios[exerciseIndex].series.length)
        .map((exerciseIndex) => ({ exerciseIndex, setIndexInExercise: round }))

    return positions
}

export function groupRoundCount(snapshot: WorkoutSnapshot, block: ExerciseBlock): number {
    const setCounts = block.exerciseIndexes.map((exerciseIndex) => snapshot.exercicios[exerciseIndex].series.length)

    return Math.max(...setCounts)
}

function isResolvedIn(
    snapshot: WorkoutSnapshot,
    setsByKey: Map<string, WorkoutSetRow>,
    position: StepPosition,
): boolean {
    const exercicio = snapshot.exercicios[position.exerciseIndex]
    const serie = exercicio.series[position.setIndexInExercise]

    return isSetResolved(setsByKey.get(setKey(exercicio.exercise_key, serie.set_index)))
}

// Membros que ainda vêm depois da posição na mesma rodada. Um membro cuja
// série desta rodada já foi resolvida (pulada, por exemplo) não conta mais:
// sem isso, pular um exercício do grupo deixaria as rodadas seguintes sem
// descanso nenhum.
function laterPendingInRound(
    snapshot: WorkoutSnapshot,
    block: ExerciseBlock,
    position: StepPosition,
    setsByKey: Map<string, WorkoutSetRow>,
): StepPosition[] {
    const roundPositions = groupRoundPositions(snapshot, block, position.setIndexInExercise)
    const currentIndex = roundPositions.findIndex(
        (candidate) => candidate.exerciseIndex === position.exerciseIndex,
    )
    const laterPositions = roundPositions.slice(currentIndex + 1)

    return laterPositions.filter((candidate) => !isResolvedIn(snapshot, setsByKey, candidate))
}

// Exercício avulso fecha a "rodada" a cada série, que é o comportamento de
// sempre: descanso depois de toda série.
export function closesGroupRound(
    snapshot: WorkoutSnapshot,
    position: StepPosition,
    setsByKey: Map<string, WorkoutSetRow> = new Map(),
): boolean {
    const block = groupBlockOf(snapshot, position.exerciseIndex)
    if (!block) {
        return true
    }

    return laterPendingInRound(snapshot, block, position, setsByKey).length === 0
}

// Descanso depois da série na posição: o da própria série (ou do exercício),
// mas só quando ela fecha a rodada do grupo. Entre membros da mesma rodada a
// troca de exercício é feita sem pausa, então não há descanso nem push.
export function restAfterSet(
    snapshot: WorkoutSnapshot,
    position: StepPosition,
    setsByKey: Map<string, WorkoutSetRow> = new Map(),
): RestRange | null {
    if (!closesGroupRound(snapshot, position, setsByKey)) {
        return null
    }
    const exercicio = snapshot.exercicios[position.exerciseIndex]
    const serie = exercicio.series[position.setIndexInExercise]

    return snapshotSetRest(exercicio, serie)
}

export type SupersetLabel = 'Bi-set' | 'Tri-set' | 'Circuito'

export function supersetLabelOf(memberCount: number): SupersetLabel {
    if (memberCount <= MIN_GROUP_MEMBERS) {
        return 'Bi-set'
    }

    return memberCount === TRI_SET_MEMBERS ? 'Tri-set' : 'Circuito'
}

export type SupersetMember = { exerciseIndex: number; exerciseKey: string; nome: string; totalSets: number }

// `serie` traz o alvo e a carga sugerida da próxima série da rodada; o
// histórico de cargas fica com quem mostra, pela `exerciseKey`.
export type SupersetNextStep = {
    position: StepPosition
    exerciseKey: string
    nome: string
    serie: WorkoutSnapshotExerciseSet
}

// `memberIndex` é a posição do exercício atual em `members` (a partir de 0);
// `round` e `totalRounds` contam a partir de 1, como aparecem na tela.
export type SupersetContext = {
    grupo: string
    label: SupersetLabel
    members: SupersetMember[]
    memberIndex: number
    round: number
    totalRounds: number
    nextInRound: SupersetNextStep | null
    closesRound: boolean
}

// Contexto do grupo para a tela da série, ou null quando o exercício é
// avulso. Com `setsByKey`, o próximo membro e o fechamento da rodada ignoram
// séries já resolvidas, do mesmo jeito que o descanso faz.
export function groupContextOf(
    snapshot: WorkoutSnapshot,
    position: StepPosition,
    setsByKey: Map<string, WorkoutSetRow> = new Map(),
): SupersetContext | null {
    const block = groupBlockOf(snapshot, position.exerciseIndex)
    if (!block || block.grupo === null) {
        return null
    }

    const members = block.exerciseIndexes.map((exerciseIndex) => {
        const exercicio = snapshot.exercicios[exerciseIndex]
        return {
            exerciseIndex,
            exerciseKey: exercicio.exercise_key,
            nome: exercicio.nome,
            totalSets: exercicio.series.length,
        }
    })
    const [nextPosition] = laterPendingInRound(snapshot, block, position, setsByKey)
    const nextExercicio = nextPosition ? snapshot.exercicios[nextPosition.exerciseIndex] : null
    const nextInRound =
        nextPosition && nextExercicio
            ? {
                  position: nextPosition,
                  exerciseKey: nextExercicio.exercise_key,
                  nome: nextExercicio.nome,
                  serie: nextExercicio.series[nextPosition.setIndexInExercise],
              }
            : null

    return {
        grupo: block.grupo,
        label: supersetLabelOf(members.length),
        members,
        memberIndex: block.exerciseIndexes.indexOf(position.exerciseIndex),
        round: position.setIndexInExercise + 1,
        totalRounds: groupRoundCount(snapshot, block),
        nextInRound,
        closesRound: nextPosition === undefined,
    }
}
