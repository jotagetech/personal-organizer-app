import type { WorkoutSnapshotExerciseSet } from '@/features/workout/types'

// Campos do snapshot atual que os testes de progresso, relatório e exportação
// não exercitam: ficam com o mesmo valor que um snapshot antigo normalizado.
export const SNAPSHOT_EXERCISE_DEFAULTS = {
    tipo: 'series',
    intervalado: null,
    equipamento: null,
    por_lado: false,
    descanso_segundos_min: null,
    descanso_segundos_max: null,
    rir_alvo_min: null,
    rir_alvo_max: null,
    observacoes: null,
} as const

export const EMPTY_SET_METRIC_COLUMNS = {
    metric: null,
    duration_seconds: null,
    distance_m: null,
} as const

// Série sem descanso próprio: vale o do exercício, como num snapshot antigo.
export const NO_SET_REST = {
    descanso_segundos_min: null,
    descanso_segundos_max: null,
} as const

export function repsSnapshotSet(
    setIndex: number,
    repsMin: number,
    repsMax: number,
    suggestedLoadKg: number | null,
): WorkoutSnapshotExerciseSet {
    return {
        set_index: setIndex,
        metrica: 'repeticoes',
        alvo_min: repsMin,
        alvo_max: repsMax,
        carga_sugerida: suggestedLoadKg,
        ...NO_SET_REST,
        quedas: [],
    }
}
