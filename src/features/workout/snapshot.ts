import type { Exercise, Workout, WorkoutSet } from '@/lib/workoutPlanSchema'
import { CURRENT_SNAPSHOT_VERSION } from '@/lib/workoutSnapshotSchema'
import {
    applyWeekToExercise,
    applyWeekToWorkout,
    findWeekVariation,
    type PlanWeek,
} from '@/features/workout/planWeek'
import {
    resolveEffectiveRest,
    restFieldsOf,
    restRangeOf,
    sameRest,
    type RestLayers,
    type RestRange,
} from '@/features/workout/restPrescription'
import type { WorkoutSnapshot, WorkoutSnapshotExercise, WorkoutSnapshotExerciseSet } from '@/features/workout/types'

type SnapshotExerciseInput = {
    planned: Exercise
    forWeek: Exercise
    semana: number | null
    defaultRest: RestRange | null
}

function exerciseRestLayers(input: SnapshotExerciseInput): RestLayers {
    const variation = findWeekVariation(input.planned, input.semana)
    const layers = {
        tipo: input.planned.tipo,
        serie: null,
        variacaoSemana: restRangeOf(variation),
        exercicio: restRangeOf(input.planned),
        padraoPlano: input.defaultRest,
    }

    return layers
}

// A série só leva descanso próprio quando ele difere do exercício: assim o
// snapshot de uma ficha sem descanso por série fica igual ao de antes.
function snapshotSetOf(
    set: WorkoutSet,
    seriesIndex: number,
    layers: RestLayers,
    exerciseRest: RestRange | null,
): WorkoutSnapshotExerciseSet {
    const setRest = resolveEffectiveRest({ ...layers, serie: restRangeOf(set) })
    const ownRest = sameRest(setRest, exerciseRest) ? null : setRest
    const snapshotSet = {
        set_index: seriesIndex + 1,
        metrica: set.metrica,
        alvo_min: set.alvo_min,
        alvo_max: set.alvo_max,
        carga_sugerida: set.carga_sugerida,
        ...restFieldsOf(ownRest),
        quedas: set.quedas.map((drop, dropPosition) => ({
            drop_index: dropPosition + 1,
            alvo_min: drop.alvo_min,
            alvo_max: drop.alvo_max,
            carga_sugerida: drop.carga_sugerida,
        })),
    }

    return snapshotSet
}

// O descanso do exercício no snapshot já é o resolvido para o dia (variação
// da semana, exercício ou padrão do plano), então o histórico não muda
// quando a ficha muda depois. O grupo só entra quando existe, para o snapshot
// de uma ficha sem grupos continuar igual ao de antes.
function snapshotExerciseOf(input: SnapshotExerciseInput): WorkoutSnapshotExercise {
    const exercicio = input.forWeek
    const layers = exerciseRestLayers(input)
    const exerciseRest = resolveEffectiveRest(layers)
    const snapshotExercise = {
        exercise_key: exercicio.id,
        nome: exercicio.nome,
        tipo: exercicio.tipo,
        intervalado: exercicio.intervalado ? { ...exercicio.intervalado } : null,
        equipamento: exercicio.equipamento,
        forma_carga: exercicio.forma_carga,
        por_lado: exercicio.por_lado,
        ...restFieldsOf(exerciseRest),
        rir_alvo_min: exercicio.rir_alvo_min,
        rir_alvo_max: exercicio.rir_alvo_max,
        observacoes: exercicio.observacoes,
        series: exercicio.series.map((set, seriesIndex) => snapshotSetOf(set, seriesIndex, layers, exerciseRest)),
        ...(exercicio.grupo === null ? {} : { grupo: exercicio.grupo }),
    }

    return snapshotExercise
}

// Um exercício do plano fora do treino do dia (acrescentado como extra) sai
// com a mesma resolução de semana e descanso que teria dentro do treino dele.
export function buildSnapshotExercise(
    planned: Exercise,
    planWeek: PlanWeek | null,
    defaultRest: RestRange | null,
): WorkoutSnapshotExercise {
    const semana = planWeek?.semana ?? null
    const forWeek = semana === null ? planned : applyWeekToExercise(planned, semana)
    const snapshotExercise = snapshotExerciseOf({ planned, forWeek, semana, defaultRest })

    return snapshotExercise
}

export function buildWorkoutSnapshot(
    workout: Workout,
    planWeek: PlanWeek | null = null,
    defaultRest: RestRange | null = null,
): WorkoutSnapshot {
    const semana = planWeek?.semana ?? null
    const workoutForWeek = applyWeekToWorkout(workout, semana)
    const exercicios = workout.exercicios.map((planned, index) =>
        snapshotExerciseOf({ planned, forWeek: workoutForWeek.exercicios[index], semana, defaultRest }),
    )

    const snapshot: WorkoutSnapshot = {
        versao: CURRENT_SNAPSHOT_VERSION,
        workout_key: workout.id,
        nome: workout.nome,
        semana_bloco: semana,
        bloco_semanas: planWeek?.totalSemanas ?? null,
        descricao_semana: planWeek?.descricao ?? null,
        exercicios,
    }

    return snapshot
}
