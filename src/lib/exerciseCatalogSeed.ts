import { EQUIPMENT_TYPES, LOAD_CONVENTIONS } from '@/lib/workoutPlanSchema'

// Grupos pensados para somar volume semanal: cada exercício conta uma série
// para o primário e é listado nos secundários só para consulta.
export const MUSCLE_GROUPS = [
    'peito',
    'costas',
    'trapezio',
    'lombar',
    'ombro_anterior',
    'ombro_lateral',
    'ombro_posterior',
    'biceps',
    'triceps',
    'antebraco',
    'abdomen',
    'gluteos',
    'quadriceps',
    'posterior_coxa',
    'adutores',
    'abdutores',
    'panturrilha',
    'tibial',
] as const

export const OWN_SOURCE = 'proprio'

const SLUG_PATTERN = /^[a-z0-9]+(_[a-z0-9]+)*$/

export type SeedExercise = {
    slug: string
    name_pt: string
    family: string
    primary_muscle: string
    secondary_muscles: string[]
    equipment: string
    default_load_form: string
    description_pt: string
    source: string
    source_ref: string | null
    license: string | null
    attribution: string | null
}

export type SeedAlias = {
    alias: string
    alias_norm: string
    slug: string
}

export type ExerciseSeed = {
    exercises: SeedExercise[]
    aliases: SeedAlias[]
}

// Forma usada para comparar nomes digitados: "Leg press 45°" e
// "leg-press 45" precisam cair na mesma chave.
export function normalizeAlias(text: string): string {
    const withoutAccents = text
        .toLowerCase()
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
    const normalized = withoutAccents.replace(/[^a-z0-9]+/g, ' ').trim()

    return normalized
}

export function validateExerciseSeed(seed: ExerciseSeed): string[] {
    const exerciseErrors = seed.exercises.flatMap(validateExercise)
    const slugErrors = findDuplicateSlugs(seed.exercises)
    const aliasErrors = validateAliases(seed)
    const errors = [...exerciseErrors, ...slugErrors, ...aliasErrors]

    return errors
}

function validateExercise(exercise: SeedExercise): string[] {
    const where = `exercício ${exercise.slug}`
    const errors: string[] = []

    if (!SLUG_PATTERN.test(exercise.slug)) {
        errors.push(`${where}: slug fora do formato (minúsculas, sem acento, "_" como separador)`)
    }
    if (!SLUG_PATTERN.test(exercise.family)) {
        errors.push(`${where}: family fora do formato de slug`)
    }
    if (!exercise.name_pt.trim() || !exercise.description_pt.trim()) {
        errors.push(`${where}: name_pt e description_pt são obrigatórios`)
    }
    if (!isOneOf(exercise.equipment, EQUIPMENT_TYPES)) {
        errors.push(`${where}: equipment "${exercise.equipment}" fora do vocabulário`)
    }
    if (!isOneOf(exercise.default_load_form, LOAD_CONVENTIONS)) {
        errors.push(`${where}: default_load_form "${exercise.default_load_form}" fora do contrato`)
    }
    errors.push(...validateMuscles(exercise, where))
    errors.push(...validateLicense(exercise, where))

    return errors
}

function validateMuscles(exercise: SeedExercise, where: string): string[] {
    const errors: string[] = []
    const unknownMuscles = [exercise.primary_muscle, ...exercise.secondary_muscles]
        .filter((muscle) => !isOneOf(muscle, MUSCLE_GROUPS))
    const hasRepeatedSecondary = new Set(exercise.secondary_muscles).size !== exercise.secondary_muscles.length

    if (unknownMuscles.length > 0) {
        errors.push(`${where}: músculo fora do vocabulário (${unknownMuscles.join(', ')})`)
    }
    if (exercise.secondary_muscles.includes(exercise.primary_muscle)) {
        errors.push(`${where}: o músculo primário não pode repetir nos secundários`)
    }
    if (hasRepeatedSecondary) {
        errors.push(`${where}: músculo secundário repetido`)
    }

    return errors
}

// Conteúdo próprio dispensa atribuição; qualquer outra fonte precisa dizer de
// onde veio, sob que licença e a quem creditar.
function validateLicense(exercise: SeedExercise, where: string): string[] {
    const isOwnContent = exercise.source === OWN_SOURCE
    const hasLicenseData = Boolean(exercise.source_ref && exercise.license && exercise.attribution)
    const errors = isOwnContent || hasLicenseData
        ? []
        : [`${where}: fonte externa "${exercise.source}" exige source_ref, license e attribution`]

    return errors
}

function findDuplicateSlugs(exercises: SeedExercise[]): string[] {
    const seenSlugs = new Set<string>()
    const errors: string[] = []

    for (const exercise of exercises) {
        if (seenSlugs.has(exercise.slug)) {
            errors.push(`slug repetido: ${exercise.slug}`)
        }
        seenSlugs.add(exercise.slug)
    }

    return errors
}

// Um nome normalizado aponta para um exercício só, venha ele do nome oficial
// ou de um apelido; senão a busca não sabe qual dos dois mostrar.
function validateAliases(seed: ExerciseSeed): string[] {
    const ownerByNorm = new Map(
        seed.exercises.map((exercise) => [normalizeAlias(exercise.name_pt), exercise.slug]),
    )
    const knownSlugs = new Set(seed.exercises.map((exercise) => exercise.slug))
    const errors: string[] = []

    for (const alias of seed.aliases) {
        const where = `apelido "${alias.alias}"`
        const expectedNorm = normalizeAlias(alias.alias)
        const currentOwner = ownerByNorm.get(alias.alias_norm)

        if (!knownSlugs.has(alias.slug)) {
            errors.push(`${where}: aponta para slug inexistente ${alias.slug}`)
        }
        if (alias.alias_norm !== expectedNorm) {
            errors.push(`${where}: alias_norm deveria ser "${expectedNorm}"`)
        }
        if (currentOwner === alias.slug) {
            errors.push(`${where}: repete o nome ou outro apelido de ${alias.slug}`)
        } else if (currentOwner) {
            errors.push(`${where}: "${alias.alias_norm}" já pertence a ${currentOwner}`)
        }
        ownerByNorm.set(alias.alias_norm, currentOwner ?? alias.slug)
    }

    return errors
}

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
    const isAllowed = (allowed as readonly string[]).includes(value)

    return isAllowed
}
