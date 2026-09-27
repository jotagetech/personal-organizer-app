import type {
    Database,
    WorkoutSnapshot,
    WorkoutSnapshotExercise,
    WorkoutSnapshotExerciseSet,
} from '@/lib/databaseTypes'

export type WorkoutPlanRow = Database['public']['Tables']['workout_plans']['Row']
export type WorkoutSessionRow = Database['public']['Tables']['workout_sessions']['Row']
export type WorkoutSetRow = Database['public']['Tables']['workout_sets']['Row']

export type { WorkoutSnapshot, WorkoutSnapshotExercise, WorkoutSnapshotExerciseSet }

export function setKey(exerciseKey: string, setIndex: number): string {
    const key = `${exerciseKey}:${setIndex}`

    return key
}
