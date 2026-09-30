import { setStatusOf, type SetStatus } from '@/features/workout/sessionProgress'
import { groupDropsBySetKey } from '@/features/workout/setDrops'
import { exerciseBlocksOf, supersetLabelOf, type SupersetLabel } from '@/features/workout/supersets'
import {
    setKey,
    type WorkoutSetDropRow,
    type WorkoutSetRow,
    type WorkoutSnapshot,
    type WorkoutSnapshotInterval,
} from '@/features/workout/types'
import type { OutboxDropValues } from '@/lib/outbox/outboxQueue'
import type { LoadConvention, SetMetric } from '@/lib/workoutPlanSchema'

export type WorkoutSetSummary = {
    setIndex: number
    loadKg: number | null
    reps: number | null
    durationSeconds: number | null
    distanceM: number | null
    metric: SetMetric
    drops: OutboxDropValues[]
    rir: number | null
    rpe: number | null
    note: string | null
    isCompleted: boolean
    status: SetStatus
}

export type WorkoutExerciseSummary = {
    exerciseKey: string
    exerciseName: string
    loadConvention: LoadConvention
    perSide: boolean
    // Prescrição do intervalado; nula em exercício de séries. Nele, cada
    // item de `sets` é uma rodada.
    interval: WorkoutSnapshotInterval | null
    // Grupo de que o exercício faz parte de fato (bi-set, tri-set, circuito),
    // já descontado o rótulo solto que não forma grupo; nulo se avulso.
    grupo: string | null
    groupLabel: SupersetLabel | null
    sets: WorkoutSetSummary[]
}

// Exercícios consecutivos do mesmo grupo, na ordem do treino; um exercício
// avulso é um bloco de um só, com `grupo` nulo.
export type WorkoutExerciseBlock = {
    grupo: string | null
    groupLabel: SupersetLabel | null
    exercises: WorkoutExerciseSummary[]
}

export function groupExerciseSummaries(exercises: WorkoutExerciseSummary[]): WorkoutExerciseBlock[] {
    const blocks: WorkoutExerciseBlock[] = []

    for (const exercise of exercises) {
        const previousBlock = blocks[blocks.length - 1]
        if (exercise.grupo !== null && previousBlock?.grupo === exercise.grupo) {
            previousBlock.exercises.push(exercise)
            continue
        }
        blocks.push({ grupo: exercise.grupo, groupLabel: exercise.groupLabel, exercises: [exercise] })
    }

    return blocks
}

export type WorkoutSummary = {
    exercises: WorkoutExerciseSummary[]
    orphanSets: WorkoutSetRow[]
}

// Séries órfãs acontecem quando o plano foi trocado depois de séries já
// registradas (o exercise_key delas não existe mais no snapshot atual);
// separá-las evita perder o registro histórico ao mesmo tempo que evita
// tratá-las como parte do treino de hoje.
export function summarizeWorkoutSets(
    snapshot: WorkoutSnapshot,
    sets: WorkoutSetRow[],
    dropRows: WorkoutSetDropRow[] = [],
): WorkoutSummary {
    const dropsBySetKey = groupDropsBySetKey(sets, dropRows)

    return summarizeWorkoutSetsWithDrops(snapshot, sets, dropsBySetKey)
}

// Variante para quem já tem as quedas agrupadas por série (a sessão em
// andamento as mantém assim, com a fila local já aplicada).
export function summarizeWorkoutSetsWithDrops(
    snapshot: WorkoutSnapshot,
    sets: WorkoutSetRow[],
    dropsBySetKey: Map<string, OutboxDropValues[]>,
): WorkoutSummary {
    const setsByKey = new Map(sets.map((set) => [setKey(set.exercise_key, set.set_index), set]))
    const knownKeys = new Set<string>()
    const blockByExerciseIndex = new Map(
        exerciseBlocksOf(snapshot).flatMap((block) =>
            block.exerciseIndexes.map((exerciseIndex) => [exerciseIndex, block] as const),
        ),
    )

    const exercises: WorkoutExerciseSummary[] = snapshot.exercicios.map((exercicio, exerciseIndex) => {
        const exerciseSets: WorkoutSetSummary[] = exercicio.series.map((serie) => {
            const key = setKey(exercicio.exercise_key, serie.set_index)
            knownKeys.add(key)
            const matchingSet = setsByKey.get(key)
            const status = setStatusOf(matchingSet)

            const setSummary: WorkoutSetSummary = {
                setIndex: serie.set_index,
                loadKg: matchingSet?.load_kg ?? null,
                reps: matchingSet?.reps ?? null,
                durationSeconds: matchingSet?.duration_seconds ?? null,
                distanceM: matchingSet?.distance_m ?? null,
                // Série gravada antes da coluna existir não tem métrica e é de repetições.
                metric: matchingSet?.metric ?? serie.metrica,
                drops: dropsBySetKey.get(key) ?? [],
                rir: matchingSet?.rir ?? null,
                rpe: matchingSet?.rpe ?? null,
                note: matchingSet?.note ?? null,
                isCompleted: status === 'completed',
                status,
            }
            return setSummary
        })

        const block = blockByExerciseIndex.get(exerciseIndex)
        const grupo = block?.grupo ?? null
        const exerciseSummary: WorkoutExerciseSummary = {
            exerciseKey: exercicio.exercise_key,
            exerciseName: exercicio.nome,
            loadConvention: exercicio.forma_carga,
            perSide: exercicio.por_lado,
            interval: exercicio.tipo === 'intervalado' ? exercicio.intervalado : null,
            grupo,
            groupLabel: block && grupo !== null ? supersetLabelOf(block.exerciseIndexes.length) : null,
            sets: exerciseSets,
        }
        return exerciseSummary
    })

    const orphanSets = sets.filter((set) => !knownKeys.has(setKey(set.exercise_key, set.set_index)))

    return { exercises, orphanSets }
}
