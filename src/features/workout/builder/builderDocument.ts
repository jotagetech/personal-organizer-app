// Conversão entre o estado do montador e o JSON do contrato v2. O montador
// não interpreta o plano: ele só compõe o mesmo documento que um arquivo
// importado traria, e a validação continua sendo a do contrato.

import { createUid, resolveExerciseIds, resolveWorkoutIds } from '@/features/workout/builder/builderIds'
import { copyPrescription, createSet, DEFAULT_BLOCK_WEEKS_TEXT, emptyRange } from '@/features/workout/builder/builderState'
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
import { formatDecimal } from '@/features/workout/setPresentation'
import {
    CURRENT_PLAN_VERSION,
    WEEKDAYS,
    type EquipmentType,
    type Exercise,
    type ExerciseWeekVariation,
    type PlannedDrop,
    type SetMetric,
    type Workout,
    type WorkoutPlan,
    type WorkoutSet,
} from '@/lib/workoutPlanSchema'

type JsonObject = Record<string, unknown>

const METRIC_FIELDS: Record<SetMetric, { min: string; max: string }> = {
    repeticoes: { min: 'repeticoes_min', max: 'repeticoes_max' },
    tempo: { min: 'segundos_min', max: 'segundos_max' },
    distancia: { min: 'metros_min', max: 'metros_max' },
}

// Texto que não é número vira NaN de propósito: o contrato recusa e a tela
// aponta o campo, em vez de o valor sumir calado do arquivo.
export function parseBuilderNumber(text: string): number | undefined {
    const trimmed = text.trim()
    if (trimmed === '') {
        return undefined
    }
    const parsed = Number(trimmed.replace(',', '.'))

    return parsed
}

function definedFields(fields: JsonObject): JsonObject {
    const entries = Object.entries(fields).filter(([, value]) => value !== undefined)
    const presentFields = Object.fromEntries(entries)

    return presentFields
}

function rangeFields(range: BuilderRange, minKey: string, maxKey: string): JsonObject {
    const fields = definedFields({ [minKey]: parseBuilderNumber(range.min), [maxKey]: parseBuilderNumber(range.max) })

    return fields
}

function optionalText(text: string): string | undefined {
    const trimmed = text.trim()
    const value = trimmed === '' ? undefined : trimmed

    return value
}

function dropToJson(drop: BuilderDrop, metric: SetMetric): JsonObject {
    const fields = METRIC_FIELDS[metric]
    const dropJson = {
        ...rangeFields(drop.alvo, fields.min, fields.max),
        ...definedFields({ carga_sugerida: parseBuilderNumber(drop.carga) }),
    }

    return dropJson
}

function restFields(range: BuilderRange | null): JsonObject {
    const fields = range ? rangeFields(range, 'descanso_segundos_min', 'descanso_segundos_max') : {}

    return fields
}

function setToJson(set: BuilderSet): JsonObject {
    const fields = METRIC_FIELDS[set.metrica]
    const quedas = set.quedas.map((drop) => dropToJson(drop, set.metrica))
    const setJson = {
        ...rangeFields(set.alvo, fields.min, fields.max),
        ...definedFields({ carga_sugerida: parseBuilderNumber(set.carga) }),
        ...restFields(set.descanso),
        ...(quedas.length > 0 ? { quedas } : {}),
    }

    return setJson
}

function seriesPrescriptionFields(prescription: BuilderPrescription): Record<string, JsonObject> {
    return {
        series: { series: prescription.series.map(setToJson) },
        descanso: restFields(prescription.descanso),
        rir: rangeFields(prescription.rir, 'rir_alvo_min', 'rir_alvo_max'),
    }
}

function intervalPrescriptionFields(prescription: BuilderPrescription): Record<string, JsonObject> {
    return {
        rodadas: definedFields({ rodadas: parseBuilderNumber(prescription.rodadas) }),
        trabalho: rangeFields(prescription.trabalho, 'trabalho_segundos_min', 'trabalho_segundos_max'),
        recuperacao: rangeFields(prescription.recuperacao, 'recuperacao_segundos_min', 'recuperacao_segundos_max'),
        rpe: rangeFields(prescription.rpe, 'rpe_alvo_min', 'rpe_alvo_max'),
    }
}

// A variação leva só o que muda em relação à base, como um arquivo escrito à
// mão. Sem nenhuma diferença, leva o primeiro grupo (as séries ou as rodadas)
// igual à base: vale o mesmo e evita recusar a semana por não trocar nada.
function variationToJson(variation: BuilderVariation, exercise: BuilderExercise): JsonObject {
    const readFields = exercise.tipo === 'intervalado' ? intervalPrescriptionFields : seriesPrescriptionFields
    const baseGroups = readFields(exercise)
    const variationGroups = readFields(variation)
    const groupNames = Object.keys(variationGroups)
    const changedGroups = groupNames.filter(
        (name) => JSON.stringify(variationGroups[name]) !== JSON.stringify(baseGroups[name]),
    )
    const emittedGroups = changedGroups.length > 0 ? changedGroups : groupNames.slice(0, 1)
    const overrides = Object.assign({}, ...emittedGroups.map((name) => variationGroups[name])) as JsonObject
    const variationJson = { semanas: [...variation.semanas], ...overrides }

    return variationJson
}

function variationsFields(exercise: BuilderExercise, includeVariations: boolean): JsonObject {
    if (!includeVariations || exercise.variacoes.length === 0) {
        return {}
    }
    const variations = exercise.variacoes.map((variation) => variationToJson(variation, exercise))

    return { variacoes_semana: variations }
}

function equipmentToJson(choice: EquipmentChoice | ''): EquipmentType | undefined {
    if (choice === '') {
        return undefined
    }
    const equipment = choice === 'maquina_assistida' ? 'maquina' : choice

    return equipment
}

function optionalChoice<T extends string>(choice: T | ''): T | undefined {
    const value = choice === '' ? undefined : choice

    return value
}

function seriesExerciseToJson(exercise: BuilderExercise, id: string, includeVariations: boolean): JsonObject {
    const prescription = seriesPrescriptionFields(exercise)
    const exerciseJson = {
        id,
        nome: exercise.nome.trim(),
        ...definedFields({ catalogo: exercise.catalogo ?? undefined }),
        ...definedFields({ equipamento: equipmentToJson(exercise.equipamento) }),
        ...definedFields({
            pegada: optionalChoice(exercise.pegada),
            largura_pegada: optionalChoice(exercise.largura_pegada),
            acessorio: optionalChoice(exercise.acessorio),
        }),
        forma_carga: exercise.forma_carga,
        ...(exercise.por_lado ? { por_lado: true } : {}),
        ...prescription.descanso,
        ...prescription.rir,
        ...definedFields({ observacoes: optionalText(exercise.observacoes) }),
        ...definedFields({ grupo: exercise.grupo ?? undefined }),
        ...prescription.series,
        ...variationsFields(exercise, includeVariations),
    }

    return exerciseJson
}

function intervalExerciseToJson(exercise: BuilderExercise, id: string, includeVariations: boolean): JsonObject {
    const prescription = intervalPrescriptionFields(exercise)
    const exerciseJson = {
        tipo: 'intervalado',
        id,
        nome: exercise.nome.trim(),
        modalidade: exercise.modalidade.trim(),
        ...prescription.rodadas,
        ...prescription.trabalho,
        ...prescription.recuperacao,
        ...prescription.rpe,
        ...definedFields({ observacoes: optionalText(exercise.observacoes) }),
        ...variationsFields(exercise, includeVariations),
    }

    return exerciseJson
}

function workoutToJson(workout: BuilderWorkout, id: string, includeVariations: boolean): JsonObject {
    const exerciseIds = resolveExerciseIds(workout)
    const weekdays = WEEKDAYS.filter((weekday) => workout.dias_semana.includes(weekday))
    const exercises = workout.exercicios.map((exercise, index) => {
        const toJson = exercise.tipo === 'intervalado' ? intervalExerciseToJson : seriesExerciseToJson

        return toJson(exercise, exerciseIds[index], includeVariations)
    })
    const workoutJson = {
        id,
        nome: workout.nome.trim(),
        ...(weekdays.length > 0 ? { dias_semana: weekdays } : {}),
        exercicios: exercises,
    }

    return workoutJson
}

// Só as semanas dentro do bloco: diminuir o bloco esconde as descrições das
// semanas que saíram, e elas não vão para o arquivo.
function weekDescriptionsToJson(plan: BuilderPlan, blockWeeks: number | undefined): JsonObject[] {
    if (blockWeeks === undefined || !Number.isInteger(blockWeeks)) {
        return []
    }
    const descriptions = Array.from({ length: blockWeeks }, (_, index) => index + 1)
        .map((week) => ({ semana: week, descricao: (plan.descricoesSemana[String(week)] ?? '').trim() }))
        .filter((description) => description.descricao !== '')

    return descriptions
}

// Sem "usar progressão", nada de bloco vai para o arquivo: o contrato recusa
// variações e descrições de semana sem `bloco_semanas`.
function progressionFields(plan: BuilderPlan): JsonObject {
    if (!plan.usaProgressao) {
        return {}
    }
    const blockWeeks = parseBuilderNumber(plan.blocoSemanas)
    const descriptions = weekDescriptionsToJson(plan, blockWeeks)
    const fields = {
        ...definedFields({ bloco_semanas: blockWeeks }),
        ...(descriptions.length > 0 ? { semanas: descriptions } : {}),
    }

    return fields
}

export function builderPlanToDocument(plan: BuilderPlan): JsonObject {
    const workoutIds = resolveWorkoutIds(plan)
    const document = {
        versao: CURRENT_PLAN_VERSION,
        nome: plan.nome.trim(),
        unidade_carga: 'kg',
        ...progressionFields(plan),
        ...rangeFields(plan.descansoPadrao, 'descanso_padrao_segundos_min', 'descanso_padrao_segundos_max'),
        treinos: plan.treinos.map((workout, index) => workoutToJson(workout, workoutIds[index], plan.usaProgressao)),
    }

    return document
}

// Caminho inverso: o plano ativo, já normalizado, vira estado editável.

function numberText(value: number | null): string {
    const text = value === null ? '' : formatDecimal(value)

    return text
}

function rangeFromValues(min: number | null, max: number | null, fixoWhenEmpty: boolean): BuilderRange {
    if (min === null && max === null) {
        return emptyRange(fixoWhenEmpty)
    }
    const range = { min: numberText(min), max: numberText(max), fixo: min === max }

    return range
}

function optionalRangeFromValues(min: number | null, max: number | null): BuilderRange | null {
    const range = min === null && max === null ? null : rangeFromValues(min, max, true)

    return range
}

function dropFromPlan(drop: PlannedDrop): BuilderDrop {
    return {
        uid: createUid(),
        alvo: rangeFromValues(drop.alvo_min, drop.alvo_max, false),
        carga: numberText(drop.carga_sugerida),
    }
}

function setFromPlan(set: WorkoutSet): BuilderSet {
    return {
        uid: createUid(),
        metrica: set.metrica,
        alvo: rangeFromValues(set.alvo_min, set.alvo_max, false),
        carga: numberText(set.carga_sugerida),
        descanso: optionalRangeFromValues(set.descanso_segundos_min, set.descanso_segundos_max),
        quedas: set.quedas.map(dropFromPlan),
    }
}

function prescriptionFromExercise(exercise: Exercise): BuilderPrescription {
    const interval = exercise.intervalado
    const series = exercise.tipo === 'intervalado' ? [createSet()] : exercise.series.map(setFromPlan)

    return {
        series,
        descanso: rangeFromValues(exercise.descanso_segundos_min, exercise.descanso_segundos_max, true),
        rir: rangeFromValues(exercise.rir_alvo_min, exercise.rir_alvo_max, true),
        rodadas: numberText(interval?.rodadas ?? null),
        trabalho: rangeFromValues(interval?.trabalho_segundos_min ?? null, interval?.trabalho_segundos_max ?? null, true),
        recuperacao: rangeFromValues(
            interval?.recuperacao_segundos_min ?? null,
            interval?.recuperacao_segundos_max ?? null,
            true,
        ),
        rpe: rangeFromValues(interval?.rpe_alvo_min ?? null, interval?.rpe_alvo_max ?? null, true),
    }
}

function overrideRange(
    base: BuilderRange,
    min: number | null,
    max: number | null,
): BuilderRange {
    if (min === null && max === null) {
        return { ...base }
    }
    const range = rangeFromValues(min, max, base.fixo)

    return range
}

// Campo nulo na variação normalizada é "igual à base": a variação no
// montador começa como cópia da base com as trocas por cima.
function variationFromPlan(variation: ExerciseWeekVariation, base: BuilderPrescription): BuilderVariation {
    const copiedBase = copyPrescription(base)

    return {
        uid: createUid(),
        semanas: [...variation.semanas],
        series: variation.series ? variation.series.map(setFromPlan) : copiedBase.series,
        descanso: overrideRange(base.descanso, variation.descanso_segundos_min, variation.descanso_segundos_max),
        rir: overrideRange(base.rir, variation.rir_alvo_min, variation.rir_alvo_max),
        rodadas: variation.rodadas === null ? base.rodadas : numberText(variation.rodadas),
        trabalho: overrideRange(base.trabalho, variation.trabalho_segundos_min, variation.trabalho_segundos_max),
        recuperacao: overrideRange(
            base.recuperacao,
            variation.recuperacao_segundos_min,
            variation.recuperacao_segundos_max,
        ),
        rpe: overrideRange(base.rpe, variation.rpe_alvo_min, variation.rpe_alvo_max),
    }
}

function equipmentChoiceFrom(exercise: Exercise): EquipmentChoice | '' {
    if (exercise.equipamento === null) {
        return ''
    }
    const isAssistedMachine = exercise.equipamento === 'maquina' && exercise.forma_carga === 'assistencia'
    const choice = isAssistedMachine ? 'maquina_assistida' : exercise.equipamento

    return choice
}

function exerciseFromPlan(exercise: Exercise): BuilderExercise {
    const prescription = prescriptionFromExercise(exercise)
    const isInterval = exercise.tipo === 'intervalado'

    return {
        uid: createUid(),
        idSalvo: exercise.id,
        tratarComoNovo: false,
        nome: exercise.nome,
        tipo: exercise.tipo,
        catalogo: isInterval ? null : exercise.catalogo,
        equipamento: isInterval ? '' : equipmentChoiceFrom(exercise),
        pegada: exercise.pegada ?? '',
        largura_pegada: exercise.largura_pegada ?? '',
        acessorio: exercise.acessorio ?? '',
        forma_carga: isInterval ? 'total' : exercise.forma_carga,
        por_lado: isInterval ? false : exercise.por_lado,
        modalidade: exercise.intervalado?.modalidade ?? '',
        observacoes: exercise.observacoes ?? '',
        grupo: exercise.grupo,
        variacoes: exercise.variacoes_semana.map((variation) => variationFromPlan(variation, prescription)),
        ...prescription,
    }
}

function workoutFromPlan(workout: Workout): BuilderWorkout {
    return {
        uid: createUid(),
        idSalvo: workout.id,
        nome: workout.nome,
        dias_semana: [...(workout.dias_semana ?? [])],
        exercicios: workout.exercicios.map(exerciseFromPlan),
    }
}

export function builderPlanFromWorkoutPlan(plan: WorkoutPlan): BuilderPlan {
    const descriptions = Object.fromEntries(plan.semanas.map((week) => [String(week.semana), week.descricao]))

    return {
        nome: plan.nome,
        usaProgressao: plan.bloco_semanas !== null,
        blocoSemanas: plan.bloco_semanas === null ? DEFAULT_BLOCK_WEEKS_TEXT : String(plan.bloco_semanas),
        descricoesSemana: descriptions,
        descansoPadrao: rangeFromValues(plan.descanso_padrao_segundos_min, plan.descanso_padrao_segundos_max, true),
        treinos: plan.treinos.map(workoutFromPlan),
    }
}
