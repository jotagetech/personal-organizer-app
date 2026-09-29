// Conversão entre o que é digitado nos campos de uma série (ou de uma queda
// de drop set) e os valores gravados. A série tem um único campo de resultado
// cujo significado vem da métrica: repetições, segundos ou metros.

import type { OutboxDropValues } from '@/lib/outbox/outboxQueue'
import type { LoadConvention, SetMetric } from '@/lib/workoutPlanSchema'

export type MeasuredValues = OutboxDropValues

export type MeasuredColumns = {
    load_kg: number | null
    reps: number | null
    duration_seconds: number | null
    distance_m: number | null
}

export type LoadRequirement = 'required' | 'optional'

// Peso corporal registra só o lastro, que pode não existir; em qualquer outra
// forma de carga o número é o que torna a série comparável com a anterior.
export function loadRequirementOf(formaCarga: LoadConvention): LoadRequirement {
    return formaCarga === 'peso_corporal' ? 'optional' : 'required'
}

function normalizeDecimalText(text: string): string {
    return text.trim().replace(',', '.')
}

function parseOptionalNumber(text: string): number | null {
    const normalizedText = normalizeDecimalText(text)

    return normalizedText === '' ? null : Number(normalizedText)
}

export function isValidNonNegativeNumber(text: string): boolean {
    const normalizedText = normalizeDecimalText(text)
    if (normalizedText === '') {
        return false
    }
    const parsedValue = Number(normalizedText)

    return Number.isFinite(parsedValue) && parsedValue >= 0
}

export function isValidNonNegativeInteger(text: string): boolean {
    const normalizedText = text.trim()
    if (normalizedText === '') {
        return false
    }
    const parsedValue = Number(normalizedText)

    return Number.isInteger(parsedValue) && parsedValue >= 0
}

function isValidResultText(metric: SetMetric, resultText: string): boolean {
    return metric === 'distancia' ? isValidNonNegativeNumber(resultText) : isValidNonNegativeInteger(resultText)
}

function isValidLoadText(formaCarga: LoadConvention, loadText: string): boolean {
    const isEmpty = loadText.trim() === ''
    if (isEmpty) {
        return loadRequirementOf(formaCarga) === 'optional'
    }

    return isValidNonNegativeNumber(loadText)
}

export function canConfirmEntry(
    metric: SetMetric,
    formaCarga: LoadConvention,
    loadText: string,
    resultText: string,
): boolean {
    return isValidResultText(metric, resultText) && isValidLoadText(formaCarga, loadText)
}

// Autosave grava o que estiver digitado, inclusive parcial; só o resultado da
// métrica da série é preenchido, os outros dois ficam nulos.
export function parseMeasuredValues(metric: SetMetric, loadText: string, resultText: string): MeasuredValues {
    const result = parseOptionalNumber(resultText)

    return {
        loadKg: parseOptionalNumber(loadText),
        reps: metric === 'repeticoes' ? result : null,
        durationSeconds: metric === 'tempo' ? result : null,
        distanceM: metric === 'distancia' ? result : null,
    }
}

// Ao confirmar sem lastro, a carga vira 0: a série fica registrada como feita
// só com o peso do corpo, em vez de "carga desconhecida".
export function withBodyweightDefault(values: MeasuredValues, formaCarga: LoadConvention): MeasuredValues {
    if (formaCarga !== 'peso_corporal' || values.loadKg !== null) {
        return values
    }

    return { ...values, loadKg: 0 }
}

function numberToText(value: number | null): string {
    return value === null ? '' : String(value)
}

export function loadTextOf(columns: Pick<MeasuredColumns, 'load_kg'> | undefined): string {
    return numberToText(columns?.load_kg ?? null)
}

export function resultTextOf(metric: SetMetric, columns: MeasuredColumns | undefined): string {
    if (!columns) {
        return ''
    }
    switch (metric) {
        case 'repeticoes':
            return numberToText(columns.reps)
        case 'tempo':
            return numberToText(columns.duration_seconds)
        case 'distancia':
            return numberToText(columns.distance_m)
    }
}

export function dropValuesToColumns(drop: MeasuredValues | undefined): MeasuredColumns | undefined {
    if (!drop) {
        return undefined
    }

    return {
        load_kg: drop.loadKg,
        reps: drop.reps,
        duration_seconds: drop.durationSeconds,
        distance_m: drop.distanceM,
    }
}
