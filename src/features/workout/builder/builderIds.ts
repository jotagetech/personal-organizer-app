import type { BuilderExercise, BuilderPlan, BuilderWorkout } from '@/features/workout/builder/builderTypes'

const EXERCISE_ID_FALLBACK = 'exercicio'
const WORKOUT_ID_FALLBACK = 'treino'
const MAX_SLUG_LENGTH = 60
const FIRST_SUFFIX = 2

let uidCounter = 0

// Identidade só da tela (chave de lista do React, alvo de navegação); nunca
// vai para o arquivo do plano.
export function createUid(): string {
    uidCounter += 1
    const uid = `b${Date.now().toString(36)}-${uidCounter}`

    return uid
}

export function slugify(text: string): string {
    const withoutAccents = text.normalize('NFD').replace(/[̀-ͯ]/g, '')
    const slug = withoutAccents
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, MAX_SLUG_LENGTH)
        .replace(/-+$/g, '')

    return slug
}

type IdentifiedItem = {
    nome: string
    idSalvo: string | null
    tratarComoNovo: boolean
}

function nextFreeId(base: string, takenIds: Set<string>): string {
    let candidate = base
    let suffix = FIRST_SUFFIX
    while (takenIds.has(candidate)) {
        candidate = `${base}-${suffix}`
        suffix += 1
    }

    return candidate
}

// Quem mantém o id salvo reserva ele primeiro; o id antigo de quem virou
// "exercício novo" também fica reservado, senão o nome igual geraria o
// mesmo id e o histórico continuaria ligado.
function resolveIds(items: IdentifiedItem[], fallback: string): string[] {
    const takenIds = new Set<string>()
    items.forEach((item) => {
        if (item.idSalvo) {
            takenIds.add(item.idSalvo)
        }
    })

    const resolvedIds = items.map((item) => {
        if (item.idSalvo && !item.tratarComoNovo) {
            return item.idSalvo
        }
        const base = slugify(item.nome) || fallback
        const freeId = nextFreeId(base, takenIds)
        takenIds.add(freeId)

        return freeId
    })

    return resolvedIds
}

export function resolveExerciseIds(workout: BuilderWorkout): string[] {
    const exerciseIds = resolveIds(workout.exercicios, EXERCISE_ID_FALLBACK)

    return exerciseIds
}

// Treino não tem "tratar como novo" na tela: o id dele só amarra a sessão do
// dia ao treino escolhido, e renomear mantém o id salvo.
export function resolveWorkoutIds(plan: BuilderPlan): string[] {
    const workouts = plan.treinos.map((workout) => ({ ...workout, tratarComoNovo: false }))
    const workoutIds = resolveIds(workouts, WORKOUT_ID_FALLBACK)

    return workoutIds
}

export type ExerciseIdStatus = 'novo' | 'mantido' | 'renovado'

export function exerciseIdStatus(exercise: BuilderExercise): ExerciseIdStatus {
    if (!exercise.idSalvo) {
        return 'novo'
    }
    const status = exercise.tratarComoNovo ? 'renovado' : 'mantido'

    return status
}
