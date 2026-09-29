import type {
    Database,
    WorkoutSnapshot,
    WorkoutSnapshotDrop,
    WorkoutSnapshotExercise,
    WorkoutSnapshotExerciseSet,
    WorkoutSnapshotInterval,
} from '@/lib/databaseTypes'

export type WorkoutPlanRow = Database['public']['Tables']['workout_plans']['Row']
export type StoredWorkoutSessionRow = Database['public']['Tables']['workout_sessions']['Row']
export type WorkoutSetRow = Database['public']['Tables']['workout_sets']['Row']
export type WorkoutSetDropRow = Database['public']['Tables']['workout_set_drops']['Row']

// Sessão como o app enxerga: snapshot já normalizado para o formato atual,
// independente de quando a sessão foi gravada.
export type WorkoutSessionRow = Omit<StoredWorkoutSessionRow, 'workout_snapshot'> & {
    workout_snapshot: WorkoutSnapshot
}

export type {
    WorkoutSnapshot,
    WorkoutSnapshotDrop,
    WorkoutSnapshotExercise,
    WorkoutSnapshotExerciseSet,
    WorkoutSnapshotInterval,
}

export function setKey(exerciseKey: string, setIndex: number): string {
    const key = `${exerciseKey}:${setIndex}`

    return key
}
