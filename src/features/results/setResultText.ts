// Texto de uma série já registrada, como o detalhe do dia mostra. O número
// guardado em `load_kg` muda de significado com a forma de carga (assistência
// desconta do peso do corpo, lastro soma a ele), então o texto diz qual é.

import { formatDecimal } from '@/features/workout/setPresentation'
import type { LoadConvention, SetMetric } from '@/lib/workoutPlanSchema'

export type SetResultValues = {
    loadKg: number | null
    reps: number | null
    durationSeconds: number | null
    distanceM: number | null
}

const UNKNOWN_VALUE = '?'

function metricValueText(metric: SetMetric, values: SetResultValues, porLado: boolean): string {
    const sideSuffix = porLado ? ' por lado' : ''
    switch (metric) {
        case 'repeticoes':
            return values.reps === null ? UNKNOWN_VALUE : `${formatDecimal(values.reps)} reps${sideSuffix}`
        case 'tempo':
            return values.durationSeconds === null
                ? UNKNOWN_VALUE
                : `${formatDecimal(values.durationSeconds)} s${sideSuffix}`
        case 'distancia':
            return values.distanceM === null ? UNKNOWN_VALUE : `${formatDecimal(values.distanceM)} m${sideSuffix}`
    }
}

// Null quando não há carga a mostrar: peso corporal sem lastro fica com 0 no
// banco e "0 kg" pareceria uma carga lançada.
export function formatLoadText(formaCarga: LoadConvention, loadKg: number | null): string | null {
    if (formaCarga === 'peso_corporal') {
        return loadKg === null || loadKg === 0 ? null : `+${formatDecimal(loadKg)} kg`
    }
    if (loadKg === null) {
        return UNKNOWN_VALUE
    }
    const kgText = `${formatDecimal(loadKg)} kg`
    switch (formaCarga) {
        case 'assistencia':
            return `assist. ${kgText}`
        case 'por_halter':
            return `${kgText} por halter`
        case 'por_lado':
            return `${kgText} por lado`
        case 'total':
            return kgText
    }
}

export function formatSetResult(
    formaCarga: LoadConvention,
    metric: SetMetric,
    values: SetResultValues,
    porLado: boolean,
): string {
    const load = formatLoadText(formaCarga, values.loadKg)
    const metricText = metricValueText(metric, values, porLado)

    return load === null ? metricText : `${load} × ${metricText}`
}

function isEmptyResult(values: SetResultValues): boolean {
    return (
        values.loadKg === null &&
        values.reps === null &&
        values.durationSeconds === null &&
        values.distanceM === null
    )
}

// Queda do meio que ficou toda nula existe só para manter o índice das
// seguintes; o texto avisa em vez de sumir com a linha.
export function formatDropResult(
    formaCarga: LoadConvention,
    metric: SetMetric,
    values: SetResultValues,
    porLado: boolean,
): string {
    if (isEmptyResult(values)) {
        return '↳ sem registro'
    }

    return `↳ ${formatSetResult(formaCarga, metric, values, porLado)}`
}
