import { createUid } from '@/features/workout/builder/builderIds'
import type {
    BuilderDrop,
    BuilderExercise,
    BuilderPlan,
    BuilderPrescription,
    BuilderRange,
    BuilderSet,
    BuilderVariation,
    BuilderWorkout,
    EquipmentChoice,
} from '@/features/workout/builder/builderTypes'
import {
    MAX_BLOCK_WEEKS,
    type AttachmentType,
    type GripType,
    type GripWidth,
    type LoadConvention,
    type SetMetric,
} from '@/lib/workoutPlanSchema'

const WORKOUT_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const DEFAULT_BLOCK_WEEKS_TEXT = '4'

export const EQUIPMENT_CHOICES: { value: EquipmentChoice; label: string }[] = [
    { value: 'barra', label: 'Barra' },
    { value: 'halteres', label: 'Halteres' },
    { value: 'maquina', label: 'Máquina' },
    { value: 'maquina_assistida', label: 'Máquina assistida' },
    { value: 'cabo', label: 'Cabo' },
    { value: 'kettlebell', label: 'Kettlebell' },
    { value: 'elastico', label: 'Elástico' },
    { value: 'peso_corporal', label: 'Peso corporal' },
    { value: 'outro', label: 'Outro' },
]

export const GRIP_CHOICES: { value: GripType; label: string }[] = [
    { value: 'pronada', label: 'Pronada' },
    { value: 'supinada', label: 'Supinada' },
    { value: 'neutra', label: 'Neutra' },
]

export const GRIP_WIDTH_CHOICES: { value: GripWidth; label: string }[] = [
    { value: 'fechada', label: 'Fechada' },
    { value: 'media', label: 'Média' },
    { value: 'aberta', label: 'Aberta' },
]

export const ATTACHMENT_CHOICES: { value: AttachmentType; label: string }[] = [
    { value: 'barra_reta', label: 'Barra reta' },
    { value: 'barra_w', label: 'Barra W' },
    { value: 'barra_neutra', label: 'Barra neutra (paralela)' },
    { value: 'triangulo', label: 'Triângulo' },
    { value: 'corda', label: 'Corda' },
    { value: 'alca', label: 'Alça (pegador de uma mão)' },
]

// Escolher o equipamento já acerta a forma de carga mais comum dele; a
// pessoa ainda pode trocar depois. Equipamento sem sugestão não mexe nela.
const SUGGESTED_LOAD_CONVENTION: Partial<Record<EquipmentChoice, LoadConvention>> = {
    barra: 'total',
    halteres: 'por_halter',
    maquina: 'total',
    maquina_assistida: 'assistencia',
    cabo: 'total',
    peso_corporal: 'peso_corporal',
}

export const LOAD_CONVENTION_OPTIONS: { value: LoadConvention; label: string; explicacao: string }[] = [
    { value: 'total', label: 'Total', explicacao: 'Carga toda, com a barra se for barra.' },
    { value: 'por_lado', label: 'Por lado da barra', explicacao: 'Só o que está em cada lado da barra.' },
    { value: 'por_halter', label: 'Por halter', explicacao: 'Peso de um halter só.' },
    { value: 'peso_corporal', label: 'Peso corporal', explicacao: 'Só o lastro extra; vazio é sem lastro.' },
    { value: 'assistencia', label: 'Assistência', explicacao: 'Peso que ajuda o movimento; menos é progresso.' },
]

export const SET_METRIC_OPTIONS: { value: SetMetric; label: string; unidade: string }[] = [
    { value: 'repeticoes', label: 'Repetições', unidade: 'reps' },
    { value: 'tempo', label: 'Tempo', unidade: 's' },
    { value: 'distancia', label: 'Distância', unidade: 'm' },
]

export function suggestLoadConvention(choice: EquipmentChoice | '', current: LoadConvention): LoadConvention {
    const suggestion = choice === '' ? undefined : SUGGESTED_LOAD_CONVENTION[choice]
    const loadConvention = suggestion ?? current

    return loadConvention
}

export function emptyRange(fixo: boolean): BuilderRange {
    return { min: '', max: '', fixo }
}

export function createDrop(): BuilderDrop {
    return { uid: createUid(), alvo: emptyRange(false), carga: '' }
}

export function createSet(): BuilderSet {
    return { uid: createUid(), metrica: 'repeticoes', alvo: emptyRange(false), carga: '', descanso: null, quedas: [] }
}

function emptyPrescription(): BuilderPrescription {
    return {
        series: [createSet()],
        descanso: emptyRange(true),
        rir: emptyRange(true),
        rodadas: '',
        trabalho: emptyRange(true),
        recuperacao: emptyRange(true),
        rpe: emptyRange(true),
    }
}

export function createExercise(): BuilderExercise {
    return {
        uid: createUid(),
        idSalvo: null,
        tratarComoNovo: false,
        nome: '',
        tipo: 'series',
        catalogo: null,
        equipamento: '',
        pegada: '',
        largura_pegada: '',
        acessorio: '',
        forma_carga: 'total',
        por_lado: false,
        modalidade: '',
        observacoes: '',
        grupo: null,
        variacoes: [],
        ...emptyPrescription(),
    }
}

function workoutLetter(position: number): string {
    const letter = WORKOUT_LETTERS[position] ?? String(position + 1)

    return letter
}

export function createWorkout(existingCount: number): BuilderWorkout {
    return {
        uid: createUid(),
        idSalvo: null,
        nome: `Treino ${workoutLetter(existingCount)}`,
        dias_semana: [],
        exercicios: [],
    }
}

export function createEmptyPlan(): BuilderPlan {
    return {
        nome: '',
        usaProgressao: false,
        blocoSemanas: DEFAULT_BLOCK_WEEKS_TEXT,
        descricoesSemana: {},
        descansoPadrao: emptyRange(true),
        treinos: [createWorkout(0)],
    }
}

export function copyRange(range: BuilderRange): BuilderRange {
    return { ...range }
}

export function copySet(set: BuilderSet): BuilderSet {
    return {
        uid: createUid(),
        metrica: set.metrica,
        alvo: copyRange(set.alvo),
        carga: set.carga,
        descanso: set.descanso ? copyRange(set.descanso) : null,
        quedas: set.quedas.map((drop) => ({ uid: createUid(), alvo: copyRange(drop.alvo), carga: drop.carga })),
    }
}

export function copyPrescription(prescription: BuilderPrescription): BuilderPrescription {
    return {
        series: prescription.series.map(copySet),
        descanso: copyRange(prescription.descanso),
        rir: copyRange(prescription.rir),
        rodadas: prescription.rodadas,
        trabalho: copyRange(prescription.trabalho),
        recuperacao: copyRange(prescription.recuperacao),
        rpe: copyRange(prescription.rpe),
    }
}

function copyVariation(variation: BuilderVariation): BuilderVariation {
    return { uid: createUid(), semanas: [...variation.semanas], ...copyPrescription(variation) }
}

// A cópia é um exercício novo: sem id salvo, então não herda o histórico do
// original (dois exercícios com o mesmo id no treino seriam recusados).
export function duplicateExercise(exercise: BuilderExercise): BuilderExercise {
    return {
        ...exercise,
        ...copyPrescription(exercise),
        uid: createUid(),
        idSalvo: null,
        tratarComoNovo: false,
        nome: exercise.nome ? `${exercise.nome} (cópia)` : '',
        variacoes: exercise.variacoes.map(copyVariation),
    }
}

export function parseBlockWeeks(text: string): number | null {
    const weeks = Number(text.trim())
    const isValidWeeks = Number.isInteger(weeks) && weeks >= 1 && weeks <= MAX_BLOCK_WEEKS
    const blockWeeks = isValidWeeks ? weeks : null

    return blockWeeks
}

export function weeksUsedByOtherVariations(exercise: BuilderExercise, variationUid: string): Set<number> {
    const usedWeeks = new Set<number>()
    exercise.variacoes
        .filter((variation) => variation.uid !== variationUid)
        .forEach((variation) => variation.semanas.forEach((week) => usedWeeks.add(week)))

    return usedWeeks
}

// "Semana N diferente": começa na última semana ainda sem variação, que é o
// caso mais comum (a semana de redução de volume), com a prescrição base
// copiada para editar só o que muda.
export function createVariation(exercise: BuilderExercise, blockWeeks: number): BuilderVariation {
    const usedWeeks = weeksUsedByOtherVariations(exercise, '')
    const freeWeeks = Array.from({ length: blockWeeks }, (_, index) => blockWeeks - index).filter(
        (week) => !usedWeeks.has(week),
    )
    const semanas = freeWeeks.length > 0 ? [freeWeeks[0]] : []

    return { uid: createUid(), semanas, ...copyPrescription(exercise) }
}

export function toggleWeek(weeks: number[], week: number): number[] {
    const nextWeeks = weeks.includes(week)
        ? weeks.filter((current) => current !== week)
        : [...weeks, week].sort((weekA, weekB) => weekA - weekB)

    return nextWeeks
}

export function moveItem<T>(items: T[], index: number, offset: number): T[] {
    const targetIndex = index + offset
    if (targetIndex < 0 || targetIndex >= items.length) {
        return items
    }
    const movedItems = [...items]
    const [item] = movedItems.splice(index, 1)
    movedItems.splice(targetIndex, 0, item)

    return movedItems
}

export function insertAfter<T>(items: T[], index: number, item: T): T[] {
    const nextItems = [...items.slice(0, index + 1), item, ...items.slice(index + 1)]

    return nextItems
}

export function replaceAt<T>(items: T[], index: number, item: T): T[] {
    const nextItems = items.map((current, currentIndex) => (currentIndex === index ? item : current))

    return nextItems
}

export function removeAt<T>(items: T[], index: number): T[] {
    const nextItems = items.filter((_, currentIndex) => currentIndex !== index)

    return nextItems
}

export function setRangeValue(range: BuilderRange, side: 'min' | 'max', value: string): BuilderRange {
    if (range.fixo) {
        return { ...range, min: value, max: value }
    }
    const nextRange = { ...range, [side]: value }

    return nextRange
}

// Voltar para valor fixo usa o mínimo nos dois lados, para a faixa nunca
// ficar com um máximo escondido diferente do número mostrado.
export function setRangeFixed(range: BuilderRange, fixo: boolean): BuilderRange {
    const nextRange = fixo ? { min: range.min, max: range.min, fixo } : { ...range, fixo }

    return nextRange
}
