import {
    ATTACHMENT_TYPES,
    EQUIPMENT_TYPES,
    GRIP_TYPES,
    GRIP_WIDTHS,
    LOAD_CONVENTIONS,
} from '@/lib/workoutPlanSchema'

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

// Padrão de movimento por ação articular principal: permite ver equilíbrio
// do plano (empurrar contra puxar, joelho contra quadril) além do volume
// por músculo. Exercício de isolamento entra pela articulação que move.
export const MOVEMENT_PATTERNS = [
    'empurrar_horizontal',
    'empurrar_vertical',
    'puxar_horizontal',
    'puxar_vertical',
    'elevacao_ombro',
    'rotacao_ombro',
    'elevacao_escapula',
    'agachar',
    'afundo',
    'dobradica_quadril',
    'extensao_quadril',
    'extensao_joelho',
    'flexao_joelho',
    'abducao_quadril',
    'aducao_quadril',
    'flexao_plantar',
    'dorsiflexao',
    'flexao_cotovelo',
    'extensao_cotovelo',
    'pegada',
    'flexao_tronco',
    'antiextensao',
    'antirrotacao',
    'rotacao',
    'carregamento',
    'corpo_inteiro',
] as const

export const OWN_SOURCE = 'proprio'

// O banco dá esse prefixo a todo exercício criado por uma conta, para um
// global novo nunca tomar o slug que um plano usa para um privado.
export const PRIVATE_SLUG_PREFIX = 'meu_'

const SLUG_PATTERN = /^[a-z0-9]+(_[a-z0-9]+)*$/

export type SeedExercise = {
    slug: string
    name_pt: string
    family: string
    primary_muscle: string
    secondary_muscles: string[]
    equipment: string
    pegada: string | null
    largura_pegada: string | null
    acessorio: string | null
    padrao_movimento: string
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

// Nome usado para mais de uma variação ("pull down" serve para várias
// puxadas): a busca mostra os exercícios das famílias e a pessoa escolhe.
export type SeedGenericName = {
    name: string
    name_norm: string
    families: string[]
}

export type ExerciseSeed = {
    exercises: SeedExercise[]
    aliases: SeedAlias[]
    genericNames: SeedGenericName[]
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
    const variationErrors = findSameVariation(seed.exercises)
    const nameErrors = validateNames(seed)
    const errors = [...exerciseErrors, ...slugErrors, ...variationErrors, ...nameErrors]

    return errors
}

function validateExercise(exercise: SeedExercise): string[] {
    const where = `exercício ${exercise.slug}`
    const errors: string[] = []

    if (!SLUG_PATTERN.test(exercise.slug)) {
        errors.push(`${where}: slug fora do formato (minúsculas, sem acento, "_" como separador)`)
    }
    if (exercise.slug.startsWith(PRIVATE_SLUG_PREFIX)) {
        errors.push(`${where}: o prefixo "${PRIVATE_SLUG_PREFIX}" é reservado a exercício privado`)
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
    if (!isOneOf(exercise.padrao_movimento, MOVEMENT_PATTERNS)) {
        errors.push(`${where}: padrao_movimento "${exercise.padrao_movimento}" fora do vocabulário`)
    }
    if (!isOneOf(exercise.default_load_form, LOAD_CONVENTIONS)) {
        errors.push(`${where}: default_load_form "${exercise.default_load_form}" fora do contrato`)
    }
    errors.push(...validateGrip(exercise, where))
    errors.push(...validateMuscles(exercise, where))
    errors.push(...validateLicense(exercise, where))

    return errors
}

function validateGrip(exercise: SeedExercise, where: string): string[] {
    const checks: [string, string | null, readonly string[]][] = [
        ['pegada', exercise.pegada, GRIP_TYPES],
        ['largura_pegada', exercise.largura_pegada, GRIP_WIDTHS],
        ['acessorio', exercise.acessorio, ATTACHMENT_TYPES],
    ]
    const errors = checks
        .filter(([, value, allowed]) => value !== null && !allowed.includes(value))
        .map(([field, value]) => `${where}: ${field} "${value}" fora do contrato`)

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

// Na mesma família e equipamento, pegada, largura e acessório são o que
// separa uma variação da outra; dois exercícios iguais nos três são o mesmo
// exercício cadastrado duas vezes. Sem nenhum dos três informado, a
// diferença está em outro lugar (altura da polia, banco) e não dá para checar.
function findSameVariation(exercises: SeedExercise[]): string[] {
    const slugByVariation = new Map<string, string>()
    const errors: string[] = []

    for (const exercise of exercises) {
        const hasGrip = exercise.pegada !== null || exercise.largura_pegada !== null || exercise.acessorio !== null
        if (!hasGrip) {
            continue
        }
        const variationKey = [
            exercise.family,
            exercise.equipment,
            exercise.pegada,
            exercise.largura_pegada,
            exercise.acessorio,
        ].join('|')
        const existingSlug = slugByVariation.get(variationKey)
        if (existingSlug) {
            errors.push(`${exercise.slug} e ${existingSlug}: mesma família, equipamento, pegada, largura e acessório`)
        }
        slugByVariation.set(variationKey, existingSlug ?? exercise.slug)
    }

    return errors
}

// Um nome normalizado tem um dono só, seja o nome oficial, um apelido ou um
// nome genérico; senão a busca não sabe o que mostrar.
function validateNames(seed: ExerciseSeed): string[] {
    const ownerByNorm = new Map(
        seed.exercises.map((exercise) => [normalizeAlias(exercise.name_pt), exercise.slug]),
    )
    const aliasErrors = seed.aliases.flatMap((alias) => validateAlias(alias, seed, ownerByNorm))
    const genericErrors = seed.genericNames.flatMap((generic) => validateGenericName(generic, seed, ownerByNorm))
    const errors = [...aliasErrors, ...genericErrors]

    return errors
}

function validateAlias(alias: SeedAlias, seed: ExerciseSeed, ownerByNorm: Map<string, string>): string[] {
    const where = `apelido "${alias.alias}"`
    const expectedNorm = normalizeAlias(alias.alias)
    const currentOwner = ownerByNorm.get(alias.alias_norm)
    const slugExists = seed.exercises.some((exercise) => exercise.slug === alias.slug)
    const errors: string[] = []

    if (!slugExists) {
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

    return errors
}

function validateGenericName(
    generic: SeedGenericName,
    seed: ExerciseSeed,
    ownerByNorm: Map<string, string>,
): string[] {
    const where = `nome genérico "${generic.name}"`
    const expectedNorm = normalizeAlias(generic.name)
    const knownFamilies = new Set(seed.exercises.map((exercise) => exercise.family))
    const unknownFamilies = generic.families.filter((family) => !knownFamilies.has(family))
    const currentOwner = ownerByNorm.get(generic.name_norm)
    const errors: string[] = []

    if (generic.families.length === 0 || unknownFamilies.length > 0) {
        errors.push(`${where}: famílias inexistentes ou vazias (${unknownFamilies.join(', ')})`)
    }
    if (generic.name_norm !== expectedNorm) {
        errors.push(`${where}: name_norm deveria ser "${expectedNorm}"`)
    }
    if (currentOwner) {
        errors.push(`${where}: "${generic.name_norm}" já pertence a ${currentOwner}`)
    }
    ownerByNorm.set(generic.name_norm, currentOwner ?? `genérico ${generic.name}`)

    return errors
}

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
    const isAllowed = (allowed as readonly string[]).includes(value)

    return isAllowed
}
