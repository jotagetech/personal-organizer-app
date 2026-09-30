// Correção de uma série de treino já finalizado: o que os campos mostram ao
// abrir, a validação do que foi digitado e o que vai para o banco. A conversão
// de texto em número é a mesma do registro normal (setEntry), para uma série
// corrigida ficar igual a uma lançada certo da primeira vez.

import type { WorkoutSetSummary } from '@/features/results/daySummary'
import {
    canConfirmEntry,
    isValidNonNegativeInteger,
    isValidNonNegativeNumber,
    loadTextOf,
    parseMeasuredValues,
    resultTextOf,
    withBodyweightDefault,
} from '@/features/workout/setEntry'
import type { WorkoutSetRow } from '@/features/workout/types'
import type { OutboxOperation } from '@/lib/outbox/outboxQueue'
import { MAX_RIR, type LoadConvention, type SetMetric } from '@/lib/workoutPlanSchema'

export const UNSENT_OPERATIONS_MESSAGE = 'Há registros deste treino ainda não enviados; tente de novo quando eles subirem'

// Linha montada no aparelho antes de o servidor devolver o id de verdade.
const LOCAL_SET_ID_PREFIX = 'pending:'

export type SetCorrectionFields = {
    loadText: string
    resultText: string
    rirText: string
    noteText: string
}

// Quais campos a correção abre. A carga entra em toda métrica, como no
// registro da série (tempo e distância também podem ter carga, como numa
// caminhada com halteres). O comentário só aparece se a série já tinha um.
export type SetCorrectionShape = {
    metric: SetMetric
    loadConvention: LoadConvention
    hasLoadField: boolean
    hasNoteField: boolean
}

export type SetCorrectionPatch = Partial<
    Pick<WorkoutSetRow, 'load_kg' | 'reps' | 'duration_seconds' | 'distance_m' | 'note'>
> &
    Pick<WorkoutSetRow, 'rir'>

export type SetCorrectionValidation =
    | { isValid: true; patch: SetCorrectionPatch }
    | { isValid: false; errorMessage: string }

const RESULT_ERROR_MESSAGE: Record<SetMetric, string> = {
    repeticoes: 'Informe as repetições como número inteiro.',
    tempo: 'Informe o tempo em segundos inteiros.',
    distancia: 'Informe a distância em metros.',
}

const LOAD_ERROR_MESSAGE = 'Informe a carga em kg.'
const RIR_ERROR_MESSAGE = `O RIR vai de 0 a ${MAX_RIR}.`

export function correctionShapeOf(set: WorkoutSetSummary, loadConvention: LoadConvention): SetCorrectionShape {
    const shape: SetCorrectionShape = {
        metric: set.metric,
        loadConvention,
        hasLoadField: true,
        hasNoteField: set.note !== null,
    }

    return shape
}

export function initialCorrectionFields(set: WorkoutSetSummary): SetCorrectionFields {
    const columns = {
        load_kg: set.loadKg,
        reps: set.reps,
        duration_seconds: set.durationSeconds,
        distance_m: set.distanceM,
    }
    const fields: SetCorrectionFields = {
        loadText: loadTextOf(columns),
        resultText: resultTextOf(set.metric, columns),
        rirText: set.rir !== null ? String(set.rir) : '',
        noteText: set.note ?? '',
    }

    return fields
}

function isValidResultText(metric: SetMetric, resultText: string): boolean {
    return metric === 'distancia' ? isValidNonNegativeNumber(resultText) : isValidNonNegativeInteger(resultText)
}

function isValidRirText(rirText: string): boolean {
    if (rirText.trim() === '') {
        return true
    }

    return isValidNonNegativeInteger(rirText) && Number(rirText.trim()) <= MAX_RIR
}

function parseRirText(rirText: string): number | null {
    const normalizedText = rirText.trim()

    return normalizedText === '' ? null : Number(normalizedText)
}

function normalizeNoteText(noteText: string): string | null {
    const normalizedText = noteText.trim()

    return normalizedText === '' ? null : normalizedText
}

function findFieldError(shape: SetCorrectionShape, fields: SetCorrectionFields): string | null {
    if (!isValidResultText(shape.metric, fields.resultText)) {
        return RESULT_ERROR_MESSAGE[shape.metric]
    }
    if (shape.hasLoadField && !canConfirmEntry(shape.metric, shape.loadConvention, fields.loadText, fields.resultText)) {
        return LOAD_ERROR_MESSAGE
    }
    if (!isValidRirText(fields.rirText)) {
        return RIR_ERROR_MESSAGE
    }

    return null
}

// A série corrigida continua concluída, então vale a mesma regra da
// confirmação: peso corporal sem lastro grava carga 0.
function measuredPatchOf(shape: SetCorrectionShape, fields: SetCorrectionFields): SetCorrectionPatch {
    const loadText = shape.hasLoadField ? fields.loadText : ''
    const measuredValues = withBodyweightDefault(
        parseMeasuredValues(shape.metric, loadText, fields.resultText),
        shape.loadConvention,
    )
    const rir = parseRirText(fields.rirText)
    const patchByMetric: Record<SetMetric, SetCorrectionPatch> = {
        repeticoes: { load_kg: measuredValues.loadKg, reps: measuredValues.reps, rir },
        tempo: { load_kg: measuredValues.loadKg, duration_seconds: measuredValues.durationSeconds, rir },
        distancia: { load_kg: measuredValues.loadKg, distance_m: measuredValues.distanceM, rir },
    }

    return patchByMetric[shape.metric]
}

export function validateCorrection(shape: SetCorrectionShape, fields: SetCorrectionFields): SetCorrectionValidation {
    const errorMessage = findFieldError(shape, fields)
    if (errorMessage !== null) {
        return { isValid: false, errorMessage }
    }

    const measuredPatch = measuredPatchOf(shape, fields)
    const patch = shape.hasNoteField ? { ...measuredPatch, note: normalizeNoteText(fields.noteText) } : measuredPatch
    const validation: SetCorrectionValidation = { isValid: true, patch }

    return validation
}

// Qualquer operação da data na fila, pendente ou com falha, pode reescrever a
// série depois da correção quando finalmente subir. Uma linha com id local
// ainda não existe no servidor com esse id, então também não dá para
// corrigir por ele.
export function isCorrectionBlocked(sessionOperations: OutboxOperation[], setId: string | null): boolean {
    const hasServerId = setId !== null && !setId.startsWith(LOCAL_SET_ID_PREFIX)
    const isBlocked = sessionOperations.length > 0 || !hasServerId

    return isBlocked
}

// Na tela do treino, as séries confirmadas no aparelho ficam com id local
// até a tela ser recarregada, mesmo depois de subirem. Sem o id do servidor
// não há o que corrigir, então a correção só é oferecida sem id local.
export function hasLocalOnlySets(sets: readonly WorkoutSetRow[]): boolean {
    const hasLocalId = sets.some((set) => set.id.startsWith(LOCAL_SET_ID_PREFIX))

    return hasLocalId
}

// Troca a linha corrigida na lista de séries, mantendo a ordem.
export function replaceSetRow(sets: WorkoutSetRow[], correctedRow: WorkoutSetRow): WorkoutSetRow[] {
    const nextSets = sets.map((set) => (set.id === correctedRow.id ? correctedRow : set))

    return nextSets
}
