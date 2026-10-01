// Textos da consulta a um plano guardado. A prescrição de cada série reaproveita
// o mesmo vocabulário da tela de lançamento e do resumo do dia; aqui fica só o
// que é próprio de ler a ficha inteira: agrupar os membros de um bi-set, somar
// o descanso herdado e dizer em que semanas o exercício varia.

import { formatLoadText } from '@/features/results/setResultText'
import { formatIntervalPrescription, formatRpeRange } from '@/features/workout/intervalPresentation'
import {
    planDefaultRest,
    resolveEffectiveRest,
    restRangeOf,
    type RestRange,
} from '@/features/workout/restPrescription'
import { exerciseTags, formatRestPrescription, formatRirTarget, formatSetTargetText } from '@/features/workout/setPresentation'
import { closesRoundByCounts, supersetLabelOf, type SupersetLabel } from '@/features/workout/supersets'
import { WEEKDAY_LABELS } from '@/lib/weekdayLabels'
import type { Exercise, Weekday, WorkoutPlan, WorkoutSet } from '@/lib/workoutPlanSchema'

const MIN_GROUP_MEMBERS = 2

export function formatBlockWeeks(blockWeeks: number | null): string | null {
    if (blockWeeks === null) {
        return null
    }

    return blockWeeks === 1 ? 'Bloco de 1 semana' : `Bloco de ${blockWeeks} semanas`
}

export function formatWorkoutWeekdays(weekdays: Weekday[] | undefined): string | null {
    if (!weekdays || weekdays.length === 0) {
        return null
    }
    const labels = weekdays.map((weekday) => WEEKDAY_LABELS[weekday]).join(', ')

    return labels
}

export type PlanSetLine = {
    label: string
    value: string
    drops: string[]
    details: string[]
}

function dropLine(set: WorkoutSet, drop: WorkoutSet['quedas'][number], exercise: Exercise): string {
    const target = formatSetTargetText(set.metrica, drop.alvo_min, drop.alvo_max, exercise.por_lado)
    const load = drop.carga_sugerida === null ? null : formatLoadText(exercise.forma_carga, drop.carga_sugerida)
    const text = load === null ? `↳ queda: ${target}` : `↳ queda: ${load} × ${target}`

    return text
}

function setValueText(set: WorkoutSet, exercise: Exercise): string {
    const target = formatSetTargetText(set.metrica, set.alvo_min, set.alvo_max, exercise.por_lado)
    const load = set.carga_sugerida === null ? null : formatLoadText(exercise.forma_carga, set.carga_sugerida)

    return load === null ? target : `${load} × ${target}`
}

// Posição do exercício num grupo: as quantidades de séries de todos os
// membros (na ordem da ficha) e o índice deste membro.
export type GroupPosition = { setCounts: number[]; memberIndex: number }

const NO_REST_TEXT = 'sem descanso'

function setDetails(
    set: WorkoutSet,
    exercise: Exercise,
    planRest: RestRange | null,
    restText: string | null,
): string[] {
    const rest = resolveEffectiveRest({
        tipo: exercise.tipo,
        serie: restRangeOf(set),
        variacaoSemana: null,
        exercicio: restRangeOf(exercise),
        padraoPlano: planRest,
    })
    const details = [
        formatRirTarget(exercise.rir_alvo_min, exercise.rir_alvo_max),
        restText ?? formatRestPrescription(rest?.min ?? null, rest?.max ?? null),
    ].filter((detail): detail is string => detail !== null)

    return details
}

function restTextOf(group: GroupPosition | null, setIndex: number): string | null {
    if (group === null || closesRoundByCounts(group.setCounts, group.memberIndex, setIndex)) {
        return null
    }

    return NO_REST_TEXT
}

function intervalLine(interval: NonNullable<Exercise['intervalado']>): PlanSetLine[] {
    const rpe = formatRpeRange(interval.rpe_alvo_min, interval.rpe_alvo_max)
    const line = {
        label: 'Rodadas',
        value: formatIntervalPrescription(interval),
        drops: [],
        details: rpe === null ? [] : [rpe],
    }

    return [line]
}

// O intervalado vira uma linha só (rodadas × trabalho / recuperação); o
// descanso da ficha não se aplica a ele.
// Em bi-set, tri-set e circuito só a série que fecha a rodada tem descanso;
// a troca entre membros é feita sem pausa.
export function planExerciseLines(
    exercise: Exercise,
    plan: WorkoutPlan,
    group: GroupPosition | null = null,
): PlanSetLine[] {
    if (exercise.tipo === 'intervalado' && exercise.intervalado) {
        return intervalLine(exercise.intervalado)
    }
    const planRest = planDefaultRest(plan)
    const lines = exercise.series.map((set, setIndex) => ({
        label: `Série ${setIndex + 1}`,
        value: setValueText(set, exercise),
        drops: set.quedas.map((drop) => dropLine(set, drop, exercise)),
        details: setDetails(set, exercise, planRest, restTextOf(group, setIndex)),
    }))

    return lines
}

export function exerciseTagsText(exercise: Exercise): string[] {
    const tags = exerciseTags(exercise)

    return tags
}

// Semanas do bloco em que o exercício muda a prescrição: a lista de séries
// mostrada é a base, e sem este aviso a variação passaria despercebida.
export function weekVariationNote(exercise: Exercise): string | null {
    const weeks = exercise.variacoes_semana.flatMap((variation) => variation.semanas)
    const uniqueWeeks = [...new Set(weeks)].sort((first, second) => first - second)
    if (uniqueWeeks.length === 0) {
        return null
    }
    const where = uniqueWeeks.length === 1 ? 'na semana' : 'nas semanas'

    return `Prescrição diferente ${where} ${uniqueWeeks.join(', ')}`
}

export type PlanExerciseBlock = { groupLabel: SupersetLabel | null; exercises: Exercise[] }

function groupOf(exercise: Exercise): string | null {
    const grupo = exercise.tipo === 'series' ? exercise.grupo : null

    return grupo
}

// Vizinhos com o mesmo `grupo` formam um bi-set, tri-set ou circuito; um
// rótulo que sobrou sozinho vale como exercício avulso.
export function groupWorkoutExercises(exercises: Exercise[]): PlanExerciseBlock[] {
    const runs: { grupo: string | null; exercises: Exercise[] }[] = []
    for (const exercise of exercises) {
        const grupo = groupOf(exercise)
        const previousRun = runs[runs.length - 1]
        if (grupo !== null && previousRun?.grupo === grupo) {
            previousRun.exercises.push(exercise)
            continue
        }
        runs.push({ grupo, exercises: [exercise] })
    }

    const blocks = runs.flatMap((run): PlanExerciseBlock[] => {
        if (run.grupo !== null && run.exercises.length >= MIN_GROUP_MEMBERS) {
            return [{ groupLabel: supersetLabelOf(run.exercises.length), exercises: run.exercises }]
        }

        return run.exercises.map((exercise) => ({ groupLabel: null, exercises: [exercise] }))
    })

    return blocks
}

export function groupPositionOf(block: PlanExerciseBlock, memberIndex: number): GroupPosition | null {
    if (block.groupLabel === null) {
        return null
    }
    const setCounts = block.exercises.map((exercise) => exercise.series.length)

    return { setCounts, memberIndex }
}
