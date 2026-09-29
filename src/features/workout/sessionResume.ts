// Passo em que o assistente do treino estava, guardado por data: sair da aba
// Treino desmonta a tela inteira, e sem isso a volta cairia sempre na
// primeira série pendente em vez do exercício que o usuário tinha escolhido
// na navegação livre. Tudo aqui é puro; a leitura e a escrita no aparelho
// ficam em timerStorage.ts.

import {
    mainStepOf,
    setStatusOf,
    stepStartOf,
    type StepPosition,
    type WizardStep,
} from '@/features/workout/sessionProgress'
import { setKey, type WorkoutSetRow, type WorkoutSnapshot } from '@/features/workout/types'
import { parseJsonObject } from '@/features/workout/workoutTimers'

export type SavedWorkoutStep = {
    workoutKey: string
    exerciseIndex: number
    setIndexInExercise: number
    dropPosition: number | null
}

export type SavedWorkoutSteps = Record<string, SavedWorkoutStep>

// Só as datas mais recentes interessam: um treino de semanas atrás que nunca
// foi finalizado não precisa ocupar espaço no aparelho para sempre.
export const MAX_REMEMBERED_DATES = 7

function isNonNegativeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function parseSavedWorkoutStep(value: unknown): SavedWorkoutStep | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null
    }
    const data = value as Record<string, unknown>
    const hasValidDropPosition = data.dropPosition === null || isNonNegativeInteger(data.dropPosition)
    if (
        typeof data.workoutKey !== 'string' ||
        !isNonNegativeInteger(data.exerciseIndex) ||
        !isNonNegativeInteger(data.setIndexInExercise) ||
        !hasValidDropPosition
    ) {
        return null
    }
    const savedStep: SavedWorkoutStep = {
        workoutKey: data.workoutKey,
        exerciseIndex: data.exerciseIndex,
        setIndexInExercise: data.setIndexInExercise,
        dropPosition: data.dropPosition as number | null,
    }

    return savedStep
}

// Dado lido do aparelho é externo: uma entrada corrompida é descartada sozinha,
// sem levar junto as datas que continuam válidas.
export function parseSavedWorkoutSteps(raw: string | null): SavedWorkoutSteps {
    const data = parseJsonObject(raw)
    const savedSteps: SavedWorkoutSteps = {}
    if (!data) {
        return savedSteps
    }

    for (const [sessionDate, value] of Object.entries(data)) {
        const savedStep = parseSavedWorkoutStep(value)
        if (savedStep) {
            savedSteps[sessionDate] = savedStep
        }
    }

    return savedSteps
}

export function rememberWorkoutStep(
    savedSteps: SavedWorkoutSteps,
    sessionDate: string,
    savedStep: SavedWorkoutStep,
): SavedWorkoutSteps {
    const recentDates = Object.keys({ ...savedSteps, [sessionDate]: savedStep })
        .sort()
        .slice(-MAX_REMEMBERED_DATES)
    const nextSavedSteps: SavedWorkoutSteps = {}
    for (const date of recentDates) {
        nextSavedSteps[date] = date === sessionDate ? savedStep : savedSteps[date]
    }

    return nextSavedSteps
}

export function forgetWorkoutStep(savedSteps: SavedWorkoutSteps, sessionDate: string): SavedWorkoutSteps {
    const remainingSteps = { ...savedSteps }
    delete remainingSteps[sessionDate]

    return remainingSteps
}

export function buildSavedWorkoutStep(snapshot: WorkoutSnapshot, step: WizardStep): SavedWorkoutStep {
    const savedStep: SavedWorkoutStep = {
        workoutKey: snapshot.workout_key,
        exerciseIndex: step.position.exerciseIndex,
        setIndexInExercise: step.position.setIndexInExercise,
        dropPosition: step.dropPosition,
    }

    return savedStep
}

function positionExists(snapshot: WorkoutSnapshot, position: StepPosition): boolean {
    const exercicio = snapshot.exercicios[position.exerciseIndex]
    const positionIsInRange = exercicio !== undefined && position.setIndexInExercise < exercicio.series.length

    return positionIsInRange
}

// A queda só volta se ainda existe no plano e a série dela continua concluída
// (quedas não existem numa série pendente ou pulada); caso contrário o passo
// volta para a própria série, na mesma posição.
function restoreDropPosition(
    snapshot: WorkoutSnapshot,
    setsByKey: Map<string, WorkoutSetRow>,
    position: StepPosition,
    dropPosition: number | null,
): number | null {
    if (dropPosition === null) {
        return null
    }
    const exercicio = snapshot.exercicios[position.exerciseIndex]
    const serie = exercicio.series[position.setIndexInExercise]
    const dropExists = dropPosition < serie.quedas.length
    const isSetCompleted = setStatusOf(setsByKey.get(setKey(exercicio.exercise_key, serie.set_index))) === 'completed'
    const restoredDropPosition = dropExists && isSetCompleted ? dropPosition : null

    return restoredDropPosition
}

// Devolve o passo guardado quando ele ainda faz sentido para o treino que está
// na tela; null (treino diferente, plano mudou e o índice sumiu) deixa quem
// chama cair na retomada padrão pela primeira série pendente. Uma série já
// resolvida volta mesmo assim: o objetivo é reabrir a mesma tela.
export function restoreWorkoutStep(
    snapshot: WorkoutSnapshot,
    setsByKey: Map<string, WorkoutSetRow>,
    savedStep: SavedWorkoutStep | null,
): WizardStep | null {
    if (!savedStep || savedStep.workoutKey !== snapshot.workout_key) {
        return null
    }
    const savedPosition: StepPosition = {
        exerciseIndex: savedStep.exerciseIndex,
        setIndexInExercise: savedStep.setIndexInExercise,
    }
    if (!positionExists(snapshot, savedPosition)) {
        return null
    }

    const position = stepStartOf(snapshot, savedPosition)
    const dropPosition = restoreDropPosition(snapshot, setsByKey, position, savedStep.dropPosition)
    const restoredStep: WizardStep = dropPosition === null ? mainStepOf(position) : { position, dropPosition }

    return restoredStep
}
