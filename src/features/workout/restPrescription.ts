// Descanso efetivo de uma série. A ficha pode prescrever descanso em quatro
// lugares, do mais específico ao mais geral: a própria série, a variação da
// semana do bloco, o exercício e o padrão do plano. Vale o primeiro que
// existir; sem nenhum, a série não tem descanso prescrito.

import type { ExerciseKind, WorkoutPlan } from '@/lib/workoutPlanSchema'

export type RestRange = {
    min: number
    max: number
}

type RestFields = {
    descanso_segundos_min: number | null
    descanso_segundos_max: number | null
}

export type RestLayers = {
    tipo: ExerciseKind
    serie: RestRange | null
    variacaoSemana: RestRange | null
    exercicio: RestRange | null
    padraoPlano: RestRange | null
}

// A validação exige os dois lados da faixa juntos; um lado solto (dado
// antigo ou corrompido) conta como "sem descanso" em vez de virar faixa
// pela metade.
export function restRangeOf(fields: Partial<RestFields> | null | undefined): RestRange | null {
    const min = fields?.descanso_segundos_min ?? null
    const max = fields?.descanso_segundos_max ?? null
    const range = min === null || max === null ? null : { min, max }

    return range
}

export function planDefaultRest(plan: WorkoutPlan): RestRange | null {
    const range = restRangeOf({
        descanso_segundos_min: plan.descanso_padrao_segundos_min,
        descanso_segundos_max: plan.descanso_padrao_segundos_max,
    })

    return range
}

// Intervalado tem a recuperação entre rodadas como pausa própria: nenhum
// descanso da ficha se aplica a ele, nem o padrão do plano.
export function resolveEffectiveRest(layers: RestLayers): RestRange | null {
    if (layers.tipo === 'intervalado') {
        return null
    }
    const effective = layers.serie ?? layers.variacaoSemana ?? layers.exercicio ?? layers.padraoPlano

    return effective
}

export function sameRest(first: RestRange | null, second: RestRange | null): boolean {
    const isSame = first?.min === second?.min && first?.max === second?.max

    return isSame
}

export function restFieldsOf(range: RestRange | null): RestFields {
    const fields = {
        descanso_segundos_min: range?.min ?? null,
        descanso_segundos_max: range?.max ?? null,
    }

    return fields
}

// Leitura do snapshot: a série só grava descanso quando ele difere do
// exercício, então sem descanso próprio vale o do exercício. Snapshots
// antigos não têm o campo na série e continuam lendo só o do exercício.
export function snapshotSetRest(exercise: RestFields, set: Partial<RestFields>): RestRange | null {
    const effective = restRangeOf(set) ?? restRangeOf(exercise)

    return effective
}
