import type { AttachmentType, EquipmentType, GripType, GripWidth, LoadConvention } from '@/lib/workoutPlanSchema'

export type ExerciseRow = {
    id: string
    slug: string
    owner_user_id: string | null
    name_pt: string
    name_norm: string
    family: string | null
    primary_muscle: string | null
    secondary_muscles: string[]
    equipment: EquipmentType | null
    pegada: GripType | null
    largura_pegada: GripWidth | null
    acessorio: AttachmentType | null
    padrao_movimento: string | null
    default_load_form: LoadConvention
    description_pt: string | null
    source: string
    source_ref: string | null
    license: string | null
    attribution: string | null
    merged_into_id: string | null
    created_at: string
}

export type ExerciseAliasRow = {
    id: string
    exercise_id: string
    owner_user_id: string | null
    alias: string
    alias_norm: string
    created_at: string
}

export type ExerciseGenericNameRow = {
    name_norm: string
    name: string
    families: string[]
}

export type UnlinkedExerciseNameRow = {
    match_key: string
    example_name: string
    set_count: number
    last_session_date: string
}

export type ExerciseCatalogData = {
    exercises: ExerciseRow[]
    aliases: ExerciseAliasRow[]
    genericNames: ExerciseGenericNameRow[]
}
