// Textos da seção Exercícios. Ficam fora do componente para o formato dos
// recordes e da linha feito contra planejado terem teste sem montar a tela.

import type {
    DoneSet,
    ExerciseRecords,
    MainRecord,
    PlannedSet,
    RecordEntry,
    RecordKind,
} from '@/features/evolution/metrics/exerciseStats'
import { formatDayMonth } from '@/features/evolution/sections/daysWindow'
import { formatDropResult, formatLoadText, formatSetResult } from '@/features/results/setResultText'
import { formatDecimal, formatSetTargetText } from '@/features/workout/setPresentation'
import type { IsoDate } from '@/lib/dateUtils'
import type { LoadConvention } from '@/lib/workoutPlanSchema'

const RECORD_LABEL: Record<RecordKind, string> = {
    maxLoad: 'Maior carga',
    maxReps: 'Mais repetições numa série',
    maxBallast: 'Maior lastro',
    minAssistance: 'Menor assistência',
    bestOneRepMax: 'Melhor 1RM estimado',
    bestVolume: 'Maior volume numa sessão',
    maxDuration: 'Maior tempo',
    maxDistance: 'Maior distância',
}

const LOAD_CONVENTION_LABEL: Record<LoadConvention, string> = {
    total: 'carga total',
    por_lado: 'carga por lado',
    por_halter: 'carga por halter',
    peso_corporal: 'peso corporal',
    assistencia: 'assistência',
}

// Ordem em que os recordes aparecem no detalhe.
const RECORD_ORDER: readonly RecordKind[] = [
    'maxLoad',
    'maxReps',
    'maxBallast',
    'minAssistance',
    'bestOneRepMax',
    'bestVolume',
    'maxDuration',
    'maxDistance',
]

// Estimativa e volume saem de uma conta; uma casa decimal basta e evita
// "53,333333" na tela.
function roundToOneDecimal(value: number): number {
    const rounded = Math.round(value * 10) / 10

    return rounded
}

function loadValueText(formaCarga: LoadConvention, value: number): string {
    const text = formatLoadText(formaCarga, roundToOneDecimal(value)) ?? '?'

    return text
}

function formatRecordValue(kind: RecordKind, formaCarga: LoadConvention, value: number): string {
    const rounded = roundToOneDecimal(value)
    switch (kind) {
        case 'maxReps':
            return `${formatDecimal(rounded)} reps`
        case 'maxBallast':
            return loadValueText('peso_corporal', value)
        case 'minAssistance':
            return value === 0 ? 'sem assistência' : loadValueText('assistencia', value)
        case 'bestVolume':
            return formaCarga === 'peso_corporal' ? `${formatDecimal(rounded)} reps` : loadValueText(formaCarga, value)
        case 'maxLoad':
        case 'bestOneRepMax':
            return loadValueText(formaCarga, value)
        case 'maxDuration':
            return `${formatDecimal(rounded)} s`
        case 'maxDistance':
            return `${formatDecimal(rounded)} m`
    }
}

export function formatSessionsLine(sessionCount: number, lastDate: IsoDate): string {
    const countLabel = sessionCount === 1 ? '1 sessão' : `${sessionCount} sessões`
    const line = `${countLabel} · última ${formatDayMonth(lastDate)}`

    return line
}

export function formatMainRecord(mainRecord: MainRecord | null): string | null {
    if (mainRecord === null) {
        return null
    }
    const valueText = formatRecordValue(mainRecord.kind, mainRecord.formaCarga, mainRecord.value)
    const text = `${RECORD_LABEL[mainRecord.kind]}: ${valueText}`

    return text
}

function formatRecordLine(kind: RecordKind, formaCarga: LoadConvention, entry: RecordEntry): string {
    const valueText = formatRecordValue(kind, formaCarga, entry.value)
    const line = `${RECORD_LABEL[kind]}: ${valueText} (${formatDayMonth(entry.date)})`

    return line
}

export function formatRecordLines(records: ExerciseRecords | null): string[] {
    if (records === null) {
        return []
    }
    const lines: string[] = []
    RECORD_ORDER.forEach((kind) => {
        const entry = records[kind]
        if (entry !== null) {
            lines.push(formatRecordLine(kind, records.formaCarga, entry))
        }
    })

    return lines
}

// Só aparece quando o exercício já foi registrado em outra forma de carga:
// os números acima não misturam as duas.
export function formatRecordsScopeNotice(records: ExerciseRecords | null): string | null {
    if (records === null || !records.hasOtherLoadForm) {
        return null
    }
    const notice = `Recordes só das sessões em ${LOAD_CONVENTION_LABEL[records.formaCarga]}`

    return notice
}

export function formatAlsoRecordedAs(previousNames: readonly string[]): string | null {
    if (previousNames.length === 0) {
        return null
    }
    const notice = `Também registrado como: ${previousNames.join(', ')}`

    return notice
}

export function formatUnreadableSessions(unreadableCount: number): string | null {
    if (unreadableCount <= 0) {
        return null
    }
    const notice =
        unreadableCount === 1
            ? '1 sessão não pôde ser lida'
            : `${unreadableCount} sessões não puderam ser lidas`

    return notice
}

export function formatDoneText(done: DoneSet, formaCarga: LoadConvention, porLado: boolean): string {
    const text = formatSetResult(formaCarga, done.metric, done, porLado)

    return text
}

export function formatDropText(done: DoneSet, formaCarga: LoadConvention, porLado: boolean): string {
    const text = formatDropResult(formaCarga, done.metric, done, porLado)

    return text
}

// O planejado acompanha o feito entre parênteses; a sugestão some quando o
// plano não tinha carga sugerida, e o texto todo some sem série planejada.
export function formatPlanText(planned: PlannedSet | null, formaCarga: LoadConvention, porLado: boolean): string | null {
    if (planned === null) {
        return null
    }
    const parts = [`meta ${formatSetTargetText(planned.metric, planned.targetMin, planned.targetMax, porLado)}`]
    const suggestedText = planned.suggestedLoadKg === null ? null : formatLoadText(formaCarga, planned.suggestedLoadKg)
    if (suggestedText !== null) {
        parts.push(`sugestão ${suggestedText}`)
    }
    const text = `(${parts.join(', ')})`

    return text
}
