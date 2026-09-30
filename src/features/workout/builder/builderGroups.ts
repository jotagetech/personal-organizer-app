// Bi-set, tri-set e circuito no montador. O `grupo` é só um rótulo que amarra
// exercícios vizinhos; a pessoa nunca o digita, a tela gera e mantém. O
// contrato exige membros em sequência, pelo menos 2 e nunca no intervalado, e
// toda mudança de lista passa por `normalizeGroups` para o estado da tela
// nunca sair dessas regras.

import type { BuilderExercise } from '@/features/workout/builder/builderTypes'
import { supersetLabelOf, type SupersetLabel } from '@/features/workout/supersets'

const GROUP_SLUG_PREFIX = 'grupo'

export type GroupRun = { grupo: string | null; start: number; end: number }

// Trechos de vizinhos com o mesmo grupo (ou sem grupo, um por exercício).
export function groupRunsOf(exercises: BuilderExercise[]): GroupRun[] {
    const runs: GroupRun[] = []
    exercises.forEach((exercise, index) => {
        const last = runs[runs.length - 1]
        const grupo = exercise.grupo ?? null
        if (grupo !== null && last && last.grupo === grupo) {
            last.end = index
            return
        }
        runs.push({ grupo, start: index, end: index })
    })

    return runs
}

export function groupLabelOfRun(run: GroupRun): SupersetLabel {
    return supersetLabelOf(run.end - run.start + 1)
}

function nextFreeSlug(takenSlugs: Set<string>): string {
    let number = 1
    while (takenSlugs.has(`${GROUP_SLUG_PREFIX}-${number}`)) {
        number += 1
    }
    const slug = `${GROUP_SLUG_PREFIX}-${number}`
    takenSlugs.add(slug)

    return slug
}

function setGroup(exercise: BuilderExercise, grupo: string | null): BuilderExercise {
    return exercise.grupo === grupo ? exercise : { ...exercise, grupo }
}

// Deixa a lista dentro das regras do contrato: intervalado perde o grupo, um
// trecho de um exercício só se dissolve, e o mesmo rótulo em dois trechos
// separados vira dois grupos (o segundo ganha um rótulo novo), em vez de o
// arquivo sair com um grupo quebrado no meio.
export function normalizeGroups(exercises: BuilderExercise[]): BuilderExercise[] {
    const series = exercises.map((exercise) => (exercise.tipo === 'intervalado' ? setGroup(exercise, null) : exercise))
    const runs = groupRunsOf(series)
    const takenSlugs = new Set<string>()
    const keptSlugs = new Set<string>()
    const slugByRunStart = new Map<number, string>()
    runs.forEach((run) => {
        if (run.grupo === null || run.end === run.start || keptSlugs.has(run.grupo)) {
            return
        }
        keptSlugs.add(run.grupo)
        takenSlugs.add(run.grupo)
        slugByRunStart.set(run.start, run.grupo)
    })

    const normalized = [...series]
    runs.forEach((run) => {
        if (run.grupo === null) {
            return
        }
        const isMultiple = run.end > run.start
        const slug = isMultiple ? (slugByRunStart.get(run.start) ?? nextFreeSlug(takenSlugs)) : null
        for (let index = run.start; index <= run.end; index += 1) {
            normalized[index] = setGroup(series[index], slug)
        }
    })

    return normalized
}

// "Agrupar com o próximo" só existe quando o próximo também é de séries e os
// dois ainda não estão no mesmo grupo.
export function canGroupWithNext(exercises: BuilderExercise[], index: number): boolean {
    const current = exercises[index]
    const next = exercises[index + 1]
    if (!current || !next || current.tipo !== 'series' || next.tipo !== 'series') {
        return false
    }
    const alreadyTogether = current.grupo != null && current.grupo === next.grupo

    return !alreadyTogether
}

// Junta o exercício com o seguinte. Se um dos dois já tem grupo, o outro entra
// nele; se os dois têm, o grupo do seguinte inteiro passa para o do atual.
export function groupWithNext(exercises: BuilderExercise[], index: number): BuilderExercise[] {
    if (!canGroupWithNext(exercises, index)) {
        return exercises
    }
    const current = exercises[index]
    const next = exercises[index + 1]
    const takenSlugs = new Set(exercises.flatMap((exercise) => (exercise.grupo ? [exercise.grupo] : [])))
    const target = current.grupo ?? next.grupo ?? nextFreeSlug(takenSlugs)
    const absorbed = current.grupo != null && next.grupo != null ? next.grupo : null
    const joined = exercises.map((exercise, exerciseIndex) => {
        const isPair = exerciseIndex === index || exerciseIndex === index + 1
        const isAbsorbed = absorbed !== null && exercise.grupo === absorbed

        return isPair || isAbsorbed ? setGroup(exercise, target) : exercise
    })

    return normalizeGroups(joined)
}

// Tira só este exercício do grupo. Se ele estava no meio, o que sobra dos dois
// lados vira grupos separados, e quem ficar sozinho deixa de ser grupo.
export function ungroupAt(exercises: BuilderExercise[], index: number): BuilderExercise[] {
    const ungrouped = exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index ? setGroup(exercise, null) : exercise,
    )

    return normalizeGroups(ungrouped)
}
