import type {
    ExerciseAliasRow,
    ExerciseCatalogData,
    ExerciseRow,
    UnlinkedExerciseNameRow,
} from '@/features/exerciseCatalog/types'
import { supabase } from '@/lib/supabaseClient'
import type { AttachmentType, EquipmentType, GripType, GripWidth, LoadConvention } from '@/lib/workoutPlanSchema'

// O catálogo inteiro (globais, privados da conta e apelidos visíveis) tem
// algumas centenas de linhas: carregar tudo de uma vez deixa a busca local e
// instantânea, inclusive com rede ruim depois do primeiro carregamento.
const CATALOG_PAGE_SIZE = 1000

export type PrivateExerciseInput = {
    name: string
    equipment: EquipmentType | null
    pegada: GripType | null
    largura_pegada: GripWidth | null
    acessorio: AttachmentType | null
    defaultLoadForm: LoadConvention
}

function throwOnError(error: { message: string } | null) {
    if (error) {
        throw new Error(error.message)
    }
}

export async function loadExerciseCatalog(): Promise<ExerciseCatalogData> {
    const [exercises, aliases, genericNames] = await Promise.all([
        supabase.from('exercises').select('*').order('name_pt').range(0, CATALOG_PAGE_SIZE - 1),
        supabase.from('exercise_aliases').select('*').range(0, CATALOG_PAGE_SIZE - 1),
        supabase.from('exercise_generic_names').select('*'),
    ])
    throwOnError(exercises.error)
    throwOnError(aliases.error)
    throwOnError(genericNames.error)

    const catalog = {
        exercises: exercises.data ?? [],
        aliases: aliases.data ?? [],
        genericNames: genericNames.data ?? [],
    }

    return catalog
}

async function currentUserId(): Promise<string> {
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) {
        throw new Error('Usuário não autenticado')
    }

    return userId
}

export async function addOwnAlias(exerciseId: string, alias: string): Promise<ExerciseAliasRow> {
    const ownerUserId = await currentUserId()
    const trimmedAlias = alias.trim()
    const { data, error } = await supabase
        .from('exercise_aliases')
        .insert({ exercise_id: exerciseId, owner_user_id: ownerUserId, alias: trimmedAlias })
        .select('*')
        .single()
    throwOnError(error)

    return data as ExerciseAliasRow
}

// O banco gera o slug (sempre com o prefixo meu_) a partir do nome.
export async function createPrivateExercise(input: PrivateExerciseInput): Promise<ExerciseRow> {
    const ownerUserId = await currentUserId()
    const trimmedName = input.name.trim()
    const { data, error } = await supabase
        .from('exercises')
        .insert({
            owner_user_id: ownerUserId,
            name_pt: trimmedName,
            equipment: input.equipment,
            pegada: input.pegada,
            largura_pegada: input.largura_pegada,
            acessorio: input.acessorio,
            default_load_form: input.defaultLoadForm,
        })
        .select('*')
        .single()
    throwOnError(error)

    return data as ExerciseRow
}

export async function listUnlinkedExerciseNames(): Promise<UnlinkedExerciseNameRow[]> {
    const { data, error } = await supabase.rpc('unlinked_exercise_names')
    throwOnError(error)

    return data ?? []
}

// Liga um nome do histórico ao exercício só para a conta; o banco religa as
// séries antigas daquele nome.
export async function linkHistoryName(name: string, exerciseId: string): Promise<void> {
    const { error } = await supabase.rpc('link_exercise_name', { p_name: name, p_exercise_id: exerciseId })
    throwOnError(error)
}
