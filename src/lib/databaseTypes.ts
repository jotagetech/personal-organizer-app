import type {
    ExerciseAliasRow,
    ExerciseGenericNameRow,
    ExerciseRow,
    UnlinkedExerciseNameRow,
} from '@/features/exerciseCatalog/types'
import type { SetMetric } from '@/lib/workoutPlanSchema'
import type { StoredWorkoutSnapshot } from '@/lib/workoutSnapshotSchema'

export type {
    WorkoutSnapshot,
    WorkoutSnapshotDrop,
    WorkoutSnapshotExercise,
    WorkoutSnapshotExerciseSet,
    WorkoutSnapshotInterval,
} from '@/lib/workoutSnapshotSchema'

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
    routine_sound_enabled: boolean
    routine_onboarded_at: string | null
    full_name: string | null
    nickname: string | null
}

type PlanActivationRow = {
    id: string
    user_id: string
    plan_id: string
    activated_at: string
    source: 'app' | 'backfill'
}

type WorkoutSessionRow = {
    id: string
    user_id: string
    session_date: string
    plan_id: string
    workout_key: string
    // Pode vir no formato antigo; a camada de API normaliza antes de entregar
    // a sessão para o resto do app.
    workout_snapshot: StoredWorkoutSnapshot
    // Início do treino. Opcional no tipo porque a coluna só existe depois da
    // migração que a cria; ausente ou null, a duração sai das séries.
    started_at?: string | null
    // Pausa em andamento (paused_at) e total das pausas encerradas. Opcionais
    // pelo mesmo motivo de started_at: ausentes, o treino conta sem pausa.
    paused_at?: string | null
    paused_seconds?: number
    finished_at: string | null
    feeling_scale: number | null
    feeling_note: string | null
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
    rir: number | null
    note: string | null
    completed_at: string | null
    skipped_at: string | null
    // Null é tratado como repetições, que é o que séries gravadas antes
    // dessas colunas existirem sempre foram.
    metric: SetMetric | null
    duration_seconds: number | null
    distance_m: number | null
    // Esforço percebido (1 a 10) de uma rodada de intervalado. Opcional no
    // tipo porque a coluna só existe depois da migração que a cria.
    rpe?: number | null
    // Vínculo com o catálogo, preenchido pelo banco a partir do snapshot.
    // Opcional no tipo porque a coluna só existe depois da migração.
    exercise_id?: string | null
    updated_at: string
}

type WorkoutSetDropRow = {
    id: string
    set_id: string
    drop_index: number
    load_kg: number | null
    reps: number | null
    duration_seconds: number | null
    distance_m: number | null
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
    food_item_id: string | null
    kcal: number | null
    protein_g: number | null
    carbs_g: number | null
    fat_g: number | null
    created_at: string
    updated_at: string
}

type FoodItemRow = {
    id: string
    user_id: string
    name: string
    reference_quantity: number | null
    reference_unit: string | null
    kcal: number | null
    protein_g: number | null
    carbs_g: number | null
    fat_g: number | null
    is_seed: boolean
    created_at: string
    updated_at: string
}

type WorkoutCycleRow = {
    id: string
    user_id: string
    start_date: string
    created_at: string
}

type CardioActivityTypeRow = {
    id: string
    user_id: string
    name: string
    created_at: string
}

type CardioEntryRow = {
    id: string
    user_id: string
    entry_date: string
    activity_type_id: string
    duration_minutes: number
    distance_km: number | null
    feeling_scale: number
    feeling_note: string | null
    note: string | null
    created_at: string
    updated_at: string
}

type BodyWeightEntryRow = {
    id: string
    user_id: string
    entry_date: string
    weight_kg: number
    created_at: string
}

type SleepEntryRow = {
    id: string
    user_id: string
    entry_date: string
    hours: number
    created_at: string
}

type RoutineCategoryRow = {
    id: string
    user_id: string
    name: string
    color: string
    sort_order: number
    created_at: string
    updated_at: string
}

type RoutineItemRow = {
    id: string
    user_id: string
    title: string
    link_kind: string | null
    category_id: string | null
    is_important: boolean
    repeat_kind: 'weekdays' | 'interval'
    weekdays: string[] | null
    interval_days: number | null
    interval_anchor: string | null
    active_from: string
    archived_on: string | null
    sort_order: number
    created_at: string
    updated_at: string
}

type RoutineItemScheduleRow = {
    id: string
    user_id: string
    routine_item_id: string
    effective_from: string
    repeat_kind: 'weekdays' | 'interval'
    weekdays: string[] | null
    interval_days: number | null
    interval_anchor: string | null
    created_at: string
}

type RoutineDayEntryRow = {
    id: string
    user_id: string
    routine_item_id: string
    entry_date: string
    completed_at: string
    created_at: string
}

type RoutineTaskRow = {
    id: string
    user_id: string
    title: string
    scheduled_on: string | null
    carried_from_on: string | null
    category_id: string | null
    is_important: boolean
    completed_on: string | null
    completed_at: string | null
    sort_order: number
    created_at: string
    updated_at: string
}

type PushSubscriptionRow = {
    id: string
    user_id: string
    endpoint: string
    p256dh: string
    auth: string
    user_agent: string | null
    created_at: string
    updated_at: string
}

type ScheduledPushRow = {
    user_id: string
    kind: 'descanso'
    fire_at: string
    title: string
    body: string
    sent_at: string | null
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
                {
                    routine_sound_enabled?: boolean
                    routine_onboarded_at?: string | null
                    full_name?: string | null
                    nickname?: string | null
                },
                Record<never, never>
            >
            plan_activations: TableDefinition<
                PlanActivationRow,
                { id?: string; activated_at?: string },
                Record<never, never>
            >
            workout_sessions: TableDefinition<
                WorkoutSessionRow,
                {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    started_at?: string | null
                    paused_at?: string | null
                    paused_seconds?: number
                    finished_at?: string | null
                    feeling_scale?: number | null
                    feeling_note?: string | null
                },
                Record<never, never>
            >
            workout_sets: TableDefinition<
                WorkoutSetRow,
                {
                    id?: string
                    updated_at?: string
                    rir?: number | null
                    note?: string | null
                    skipped_at?: string | null
                    metric?: SetMetric | null
                    duration_seconds?: number | null
                    distance_m?: number | null
                    rpe?: number | null
                },
                Record<never, never>
            >
            workout_set_drops: TableDefinition<
                WorkoutSetDropRow,
                {
                    id?: string
                    updated_at?: string
                    load_kg?: number | null
                    reps?: number | null
                    duration_seconds?: number | null
                    distance_m?: number | null
                },
                Record<never, never>
            >
            food_entries: TableDefinition<
                FoodEntryRow,
                {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    food_item_id?: string | null
                    kcal?: number | null
                    protein_g?: number | null
                    carbs_g?: number | null
                    fat_g?: number | null
                },
                Record<never, never>
            >
            food_items: TableDefinition<
                FoodItemRow,
                {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    reference_quantity?: number | null
                    reference_unit?: string | null
                    kcal?: number | null
                    protein_g?: number | null
                    carbs_g?: number | null
                    fat_g?: number | null
                    is_seed?: boolean
                },
                Record<never, never>
            >
            cardio_activity_types: TableDefinition<
                CardioActivityTypeRow,
                { id?: string; created_at?: string },
                Record<never, never>
            >
            cardio_entries: TableDefinition<
                CardioEntryRow,
                { id?: string; created_at?: string; updated_at?: string },
                Record<never, never>
            >
            workout_cycles: TableDefinition<
                WorkoutCycleRow,
                { id?: string; created_at?: string },
                Record<never, never>
            >
            body_weight_entries: TableDefinition<
                BodyWeightEntryRow,
                { id?: string; created_at?: string },
                Record<never, never>
            >
            sleep_entries: TableDefinition<
                SleepEntryRow,
                { id?: string; created_at?: string },
                Record<never, never>
            >
            routine_categories: TableDefinition<
                RoutineCategoryRow,
                { id?: string; created_at?: string; updated_at?: string; sort_order?: number },
                Record<never, never>
            >
            routine_items: TableDefinition<
                RoutineItemRow,
                {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    link_kind?: string | null
                    category_id?: string | null
                    is_important?: boolean
                    weekdays?: string[] | null
                    interval_days?: number | null
                    interval_anchor?: string | null
                    archived_on?: string | null
                    sort_order?: number
                },
                Record<never, never>
            >
            routine_item_schedules: TableDefinition<
                RoutineItemScheduleRow,
                { id?: string; created_at?: string },
                Record<never, never>
            >
            routine_day_entries: TableDefinition<
                RoutineDayEntryRow,
                { id?: string; completed_at?: string; created_at?: string },
                Record<never, never>
            >
            routine_tasks: TableDefinition<
                RoutineTaskRow,
                {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    scheduled_on?: string | null
                    carried_from_on?: string | null
                    category_id?: string | null
                    is_important?: boolean
                    completed_on?: string | null
                    completed_at?: string | null
                    sort_order?: number
                },
                Record<never, never>
            >
            push_subscriptions: TableDefinition<
                PushSubscriptionRow,
                { id?: string; created_at?: string; updated_at?: string; user_agent?: string | null },
                Record<never, never>
            >
            exercises: TableDefinition<
                ExerciseRow,
                {
                    id?: string
                    slug?: string
                    name_norm?: never
                    family?: string | null
                    primary_muscle?: string | null
                    secondary_muscles?: string[]
                    padrao_movimento?: string | null
                    description_pt?: string | null
                    source?: string
                    source_ref?: string | null
                    license?: string | null
                    attribution?: string | null
                    merged_into_id?: never
                    created_at?: string
                },
                { name_norm?: never; merged_into_id?: never }
            >
            exercise_aliases: TableDefinition<
                ExerciseAliasRow,
                { id?: string; alias_norm?: never; created_at?: string },
                { alias_norm?: never }
            >
            exercise_generic_names: TableDefinition<
                ExerciseGenericNameRow,
                Record<never, never>,
                Record<never, never>
            >
            scheduled_pushes: TableDefinition<
                ScheduledPushRow,
                { created_at?: string; updated_at?: string; body?: string; sent_at?: string | null },
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
            replace_session_workout: {
                Args: {
                    p_session_id: string
                    p_plan_id: string
                    p_snapshot: unknown
                }
                Returns: WorkoutSessionRow[]
            }
            replace_workout_set_drops: {
                Args: {
                    p_set_id: string
                    p_drops: unknown
                }
                Returns: WorkoutSetDropRow[]
            }
            unlinked_exercise_names: {
                Args: Record<never, never>
                Returns: UnlinkedExerciseNameRow[]
            }
            link_exercise_name: {
                Args: { p_name: string; p_exercise_id: string }
                Returns: undefined
            }
            register_push_subscription: {
                Args: {
                    p_endpoint: string
                    p_p256dh: string
                    p_auth: string
                    p_user_agent: string
                }
                Returns: undefined
            }
        }
    }
}
