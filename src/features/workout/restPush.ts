// Regra pura do push de fim de descanso: quando agendar, remarcar ou cancelar.
// Com a tela bloqueada o iPhone congela a página, então o aviso sai do
// servidor no horário gravado aqui; a tela só decide o que mandar para lá.

import { restTotalSeconds, type RestTimer } from '@/features/workout/workoutTimers'

const MS_PER_SECOND = 1000

export const REST_PUSH_TITLE = 'Descanso concluído'

export type RestPushPlan = {
    fireAtMs: number
    title: string
    body: string
}

export type RestPushAction =
    | { kind: 'schedule'; plan: RestPushPlan }
    | { kind: 'cancel' }
    | { kind: 'none' }

export function restEndsAtMs(timer: RestTimer): number {
    return timer.startedAtMs + restTotalSeconds(timer) * MS_PER_SECOND
}

export function restPushBody(nextExerciseName: string | null): string {
    const trimmedName = nextExerciseName?.trim() ?? ''

    return trimmedName ? `Próxima série: ${trimmedName}` : 'Hora da próxima série'
}

// Com o treino pausado não há push: a pessoa saiu do treino, e o descanso
// volta a ser agendado ao retomar, se ainda não tiver acabado.
export function planRestPush(
    timer: RestTimer | null,
    isPaused: boolean,
    nextExerciseName: string | null,
): RestPushPlan | null {
    if (!timer || isPaused) {
        return null
    }

    return { fireAtMs: restEndsAtMs(timer), title: REST_PUSH_TITLE, body: restPushBody(nextExerciseName) }
}

// previous é o último plano que esta tela mandou para o servidor, ou
// undefined quando ela ainda não mandou nada. Nesse caso, a falta de descanso
// não apaga nada, porque a tela pode ter aberto em outra data com um descanso
// de hoje ainda agendado. Só o horário conta como mudança: trocar o exercício
// exibido não remarca, e um horário que já passou não é agendado, porque um
// aviso atrasado não serve para nada.
export function decideRestPushAction(
    previous: RestPushPlan | null | undefined,
    next: RestPushPlan | null,
    nowMs: number,
): RestPushAction {
    if (next === null) {
        return previous ? { kind: 'cancel' } : { kind: 'none' }
    }
    if (previous && previous.fireAtMs === next.fireAtMs) {
        return { kind: 'none' }
    }
    if (next.fireAtMs <= nowMs) {
        return { kind: 'none' }
    }

    return { kind: 'schedule', plan: next }
}
