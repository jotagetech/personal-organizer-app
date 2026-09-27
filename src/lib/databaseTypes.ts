import type { LoadConvention } from '@/lib/workoutPlanSchema'

export type WorkoutSnapshotExerciseSet = {
    set_index: number
    repeticoes_min: number
    repeticoes_max: number
    carga_sugerida: number | null
}

export type WorkoutSnapshotExercise = {
    exercise_key: string
    nome: string
    forma_carga: LoadConvention
    series: WorkoutSnapshotExerciseSet[]
}

export type WorkoutSnapshot = {
    workout_key: string
    nome: string
    exercicios: WorkoutSnapshotExercise[]
}

type WorkoutPlanRow = {
    id: string
    user_id: string
    name: string
    schema_version: number
    payload: unknown
    content_hash: string
    created_at: string
}

type UserSettingsRow = {
    user_id: string
    active_plan_id: string | null
    timezone: string
}

type WorkoutSessionRow = {
    id: string
    user_id: string
    session_date: string
    plan_id: string
    workout_key: string
    workout_snapshot: WorkoutSnapshot
    created_at: string
    updated_at: string
}

type WorkoutSetRow = {
    id: string
    session_id: string
    exercise_key: string
    set_index: number
    load_kg: number | null
    reps: number | null
    completed_at: string | null
    updated_at: string
}

type FoodEntryRow = {
    id: string
    user_id: string
    entry_date: string
    food_name: string
    quantity: number
    unit: string
    meal_category: string
    created_at: string
    updated_at: string
}

type TableDefinition<Row, InsertOverrides extends object, UpdateOverrides extends object> = {
    Row: Row
    Insert: Omit<Row, keyof InsertOverrides> & InsertOverrides
    Update: Partial<Omit<Row, keyof UpdateOverrides> & UpdateOverrides>
    Relationships: []
}

export type Database = {
    public: {
        Tables: {
            workout_plans: TableDefinition<
                WorkoutPlanRow,
                { id?: string; created_at?: string },
                Record<never, never>
            >
            user_settings: TableDefinition<
                UserSettingsRow,
                Record<never, never>,
                Record<never, never>
            >
            workout_sessions: TableDefinition<
                WorkoutSessionRow,
                { id?: string; created_at?: string; updated_at?: string },
                Record<never, never>
            >
            workout_sets: TableDefinition<
                WorkoutSetRow,
                { id?: string; updated_at?: string },
                Record<never, never>
            >
            food_entries: TableDefinition<
                FoodEntryRow,
                { id?: string; created_at?: string; updated_at?: string },
                Record<never, never>
            >
        }
        Views: Record<string, never>
        Functions: {
            import_workout_plan: {
                Args: {
                    p_name: string
                    p_schema_version: number
                    p_payload: unknown
                    p_content_hash: string
                }
                Returns: { plan_id: string; already_imported: boolean }[]
            }
        }
    }
}
