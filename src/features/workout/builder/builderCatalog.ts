import type { BuilderExercise, EquipmentChoice } from '@/features/workout/builder/builderTypes'
import type { ExerciseRow } from '@/features/exerciseCatalog/types'

// Escolher um exercício do catálogo traz a ficha dele para o montador: nome
// oficial, slug, equipamento, pegada e forma de carga sugerida. Séries,
// descanso e observações continuam como a pessoa montou.
export function applyCatalogExercise(exercise: BuilderExercise, row: ExerciseRow): BuilderExercise {
    const isAssistedMachine = row.equipment === 'maquina' && row.default_load_form === 'assistencia'
    const equipment: EquipmentChoice | '' = isAssistedMachine ? 'maquina_assistida' : row.equipment ?? ''
    const updated: BuilderExercise = {
        ...exercise,
        nome: row.name_pt,
        catalogo: row.slug,
        equipamento: equipment,
        pegada: row.pegada ?? '',
        largura_pegada: row.largura_pegada ?? '',
        acessorio: row.acessorio ?? '',
        forma_carga: row.default_load_form,
    }

    return updated
}

export function unlinkCatalogExercise(exercise: BuilderExercise): BuilderExercise {
    const updated = { ...exercise, catalogo: null }

    return updated
}
