// Textos da tela de lançamento de série. Ficam fora dos componentes porque é
// aqui que mora a ambiguidade que mais gera registro errado (o que digitar no
// campo de carga), e isso precisa de teste sem montar a tela.

import type { EquipmentType, LoadConvention, SetMetric } from '@/lib/workoutPlanSchema'

const METRIC_UNIT: Record<SetMetric, string> = {
    repeticoes: 'reps',
    tempo: 's',
    distancia: 'm',
}

const RESULT_FIELD_LABEL: Record<SetMetric, string> = {
    repeticoes: 'Realizadas',
    tempo: 'Tempo (s)',
    distancia: 'Distância (m)',
}

const RESULT_FIELD_PLACEHOLDER: Record<SetMetric, string> = {
    repeticoes: 'ex: 10',
    tempo: 'ex: 30',
    distancia: 'ex: 30',
}

// "outro" não vira etiqueta: não diz nada que ajude a achar o aparelho.
const EQUIPMENT_LABEL: Record<EquipmentType, string | null> = {
    barra: 'Barra',
    halteres: 'Halteres',
    maquina: 'Máquina',
    cabo: 'Cabo',
    kettlebell: 'Kettlebell',
    elastico: 'Elástico',
    peso_corporal: 'Peso corporal',
    outro: null,
}

export function formatDecimal(value: number): string {
    const formatted = String(value).replace('.', ',')

    return formatted
}

function formatRange(min: number, max: number): string {
    if (min === max) {
        return formatDecimal(min)
    }
    const range = `${formatDecimal(min)} a ${formatDecimal(max)}`

    return range
}

export type TargetText = { value: string; unit: string }

// `porLado` é execução unilateral (cada perna, cada braço): o alvo vale para
// cada lado, então a unidade diz isso junto do número.
export function formatSetTarget(metric: SetMetric, min: number, max: number, porLado: boolean): TargetText {
    const sideSuffix = porLado ? ' por lado' : ''

    return { value: formatRange(min, max), unit: `${METRIC_UNIT[metric]}${sideSuffix}` }
}

export function formatSetTargetText(metric: SetMetric, min: number, max: number, porLado: boolean): string {
    const target = formatSetTarget(metric, min, max, porLado)

    return `${target.value} ${target.unit}`
}

export function resultFieldLabel(metric: SetMetric): string {
    return RESULT_FIELD_LABEL[metric]
}

export function resultFieldPlaceholder(metric: SetMetric): string {
    return RESULT_FIELD_PLACEHOLDER[metric]
}

export function loadFieldLabel(formaCarga: LoadConvention, equipamento: EquipmentType | null): string {
    switch (formaCarga) {
        case 'total':
            return equipamento === 'barra' ? 'Carga total (com a barra)' : 'Carga total'
        case 'por_lado':
            return 'Carga por lado'
        case 'por_halter':
            return 'Carga por halter'
        case 'peso_corporal':
            return 'Lastro opcional'
        case 'assistencia':
            return 'Assistência'
    }
}

// A sugestão do plano vira o exemplo do campo: é o número mais provável e
// mostra de relance a escala esperada (um halter, cada lado, total).
export function loadFieldPlaceholder(formaCarga: LoadConvention, suggestedLoadKg: number | null): string {
    if (suggestedLoadKg !== null) {
        return `ex: ${formatDecimal(suggestedLoadKg)}`
    }

    return formaCarga === 'peso_corporal' ? 'sem lastro' : 'ex: 60'
}

function parseLoadText(loadText: string): number | null {
    const normalizedText = loadText.trim().replace(',', '.')
    if (normalizedText === '') {
        return null
    }
    const parsedValue = Number(normalizedText)

    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null
}

// Dica curta abaixo do campo de carga. Com dois halteres (exercício bilateral)
// a conta "2 × carga" confirma que o número digitado é de um halter só; num
// exercício unilateral não dá para saber se foram um ou dois halteres, então
// a dica fica só na regra.
export function loadFieldHint(formaCarga: LoadConvention, porLado: boolean, loadText: string): string | null {
    switch (formaCarga) {
        case 'por_halter': {
            const loadKg = parseLoadText(loadText)
            if (loadKg !== null && !porLado) {
                return `2 × ${formatDecimal(loadKg)} kg`
            }
            return 'peso de um halter'
        }
        case 'por_lado':
            return 'em cada lado da barra'
        case 'assistencia':
            return 'menos é melhor'
        case 'peso_corporal':
            return 'só a carga extra, vazio é sem lastro'
        case 'total':
            return null
    }
}

export function formatRirTarget(min: number | null, max: number | null): string | null {
    if (min === null || max === null) {
        return null
    }
    const target = `RIR alvo ${formatRange(min, max)}`

    return target
}

export function formatRestPrescription(min: number | null, max: number | null): string | null {
    if (min === null || max === null) {
        return null
    }
    const rest = `Descanso ${formatRange(min, max)} s`

    return rest
}

export function exerciseTags(equipamento: EquipmentType | null, porLado: boolean): string[] {
    const tags: string[] = []
    const equipmentLabel = equipamento === null ? null : EQUIPMENT_LABEL[equipamento]
    if (equipmentLabel) {
        tags.push(equipmentLabel)
    }
    if (porLado) {
        tags.push('Unilateral, cada lado')
    }

    return tags
}
