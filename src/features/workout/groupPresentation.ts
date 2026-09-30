// Textos e estados do bi-set, tri-set e circuito na tela da série. Ficam fora
// dos componentes para o que muda conforme a rodada (rótulo do botão, dica,
// chips) ser testado sem montar a tela.

import { formatLastTimeText, type LastTime } from '@/features/evolution/metrics/lastTime'
import { formatDecimal, formatSetTarget } from '@/features/workout/setPresentation'
import type { SupersetContext, SupersetLabel } from '@/features/workout/supersets'
import type { WorkoutSnapshot } from '@/features/workout/types'

export const GROUP_CAPTION = 'alterna, descanso no fim da rodada'

export const FINISH_WORKOUT_LABEL = 'Confirmar e finalizar treino'

export type GroupChipState = 'current' | 'done' | 'pending'

export type GroupChip = { exerciseKey: string; nome: string; state: GroupChipState }

// Um membro sem série nesta rodada (tem menos séries que os outros) não faz
// parte dela e não vira chip. Os que vêm antes do atual já foram feitos ou
// resolvidos na rodada, pois a ordem é a da ficha.
export function groupChipsOf(context: SupersetContext): GroupChip[] {
    const chips = context.members.flatMap((member, memberIndex): GroupChip[] => {
        if (member.totalSets < context.round) {
            return []
        }
        const state: GroupChipState =
            memberIndex === context.memberIndex ? 'current' : memberIndex < context.memberIndex ? 'done' : 'pending'

        return [{ exerciseKey: member.exerciseKey, nome: member.nome, state }]
    })

    return chips
}

export function groupRoundText(context: SupersetContext): string {
    return `Rodada ${context.round} de ${context.totalRounds}`
}

// "Confirmar e finalizar treino" nunca é trocado: terminar o treino vale mais
// que a passagem para o próximo membro.
export function groupConfirmLabel(context: SupersetContext | null, baseLabel: string): string {
    if (baseLabel === FINISH_WORKOUT_LABEL || !context?.nextInRound) {
        return baseLabel
    }

    return `Confirmar e ir pra ${context.nextInRound.nome}`
}

export type LastTimeByExercise = Map<string, LastTime>

export type NextMemberText = {
    nome: string
    target: string
    suggestion: string | null
    lastTime: string | null
}

// Alvo, carga sugerida e resultado da última vez da próxima série da rodada,
// como a tela dela mostra. A última vez só entra quando o histórico do
// exercício já chegou e tem uma série a mostrar.
export function nextMemberTextOf(
    snapshot: WorkoutSnapshot,
    context: SupersetContext,
    lastTimeByKey: LastTimeByExercise = new Map(),
): NextMemberText | null {
    const next = context.nextInRound
    if (!next) {
        return null
    }
    const exercicio = snapshot.exercicios[next.position.exerciseIndex]
    const target = formatSetTarget(next.serie.metrica, next.serie.alvo_min, next.serie.alvo_max, exercicio.por_lado)
    const suggestion = next.serie.carga_sugerida !== null ? `${formatDecimal(next.serie.carga_sugerida)} kg` : null

    const lastTime = formatLastTimeText(
        lastTimeByKey.get(next.exerciseKey) ?? null,
        next.serie.set_index,
        exercicio.forma_carga,
        next.serie.metrica,
        exercicio.por_lado,
    )

    return { nome: next.nome, target: `${target.value} ${target.unit}`, suggestion, lastTime }
}

// Dica sob os campos: com próximo membro, a troca é sem descanso; ao fechar a
// rodada, só avisa do descanso quando ele de fato vai começar.
export function groupHintOf(
    snapshot: WorkoutSnapshot,
    context: SupersetContext | null,
    hasRestAfter: boolean,
    lastTimeByKey: LastTimeByExercise = new Map(),
): string | null {
    if (!context) {
        return null
    }
    const next = nextMemberTextOf(snapshot, context, lastTimeByKey)
    if (next) {
        const suggestionText = next.suggestion ? `, sugestão ${next.suggestion}` : ''
        const lastTimeText = next.lastTime ? `. ${next.lastTime}` : ''

        return `Sem descanso. ${next.nome}: ${next.target}${suggestionText}${lastTimeText}`
    }

    return context.closesRound && hasRestAfter ? 'Fim da rodada: descanso depois de confirmar' : null
}

export type GroupHandoff = {
    label: SupersetLabel
    nome: string
    target: string
    suggestion: string | null
    lastTime: string | null
    exerciseKey: string
    setIndexInExercise: number
}

// Passagem mostrada logo depois de confirmar uma série que tem próximo membro
// na rodada; null quando o descanso é que vem a seguir.
export function groupHandoffOf(
    snapshot: WorkoutSnapshot,
    context: SupersetContext | null,
    lastTimeByKey: LastTimeByExercise = new Map(),
): GroupHandoff | null {
    if (!context?.nextInRound) {
        return null
    }
    const next = nextMemberTextOf(snapshot, context, lastTimeByKey)
    if (!next) {
        return null
    }

    return {
        label: context.label,
        nome: next.nome,
        target: next.target,
        suggestion: next.suggestion,
        lastTime: next.lastTime,
        exerciseKey: context.nextInRound.exerciseKey,
        setIndexInExercise: context.nextInRound.position.setIndexInExercise,
    }
}

export function handoffAnnouncement(handoff: GroupHandoff): string {
    return `${handoff.label}, sem descanso. Vai pra ${handoff.nome}`
}
