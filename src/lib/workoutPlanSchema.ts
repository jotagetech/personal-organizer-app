import { z } from 'zod'

export const MAX_PLAN_FILE_BYTES = 1024 * 1024

export const CURRENT_PLAN_VERSION = 2

export const WEEKDAYS = [
    'segunda',
    'terca',
    'quarta',
    'quinta',
    'sexta',
    'sabado',
    'domingo',
] as const

// "assistencia" é carga que ajuda o movimento (barra fixa assistida, por
// exemplo): número menor significa exercício mais difícil, então progresso é
// a carga cair. Continua gravada em load_kg como as demais.
export const LOAD_CONVENTIONS = [
    'total',
    'por_lado',
    'por_halter',
    'peso_corporal',
    'assistencia',
] as const

// Etiqueta informativa: o id do exercício continua sendo a chave do
// histórico, então trocar o equipamento sem trocar o id mantém a série
// histórica ligada ao mesmo exercício.
export const EQUIPMENT_TYPES = [
    'barra',
    'halteres',
    'maquina',
    'cabo',
    'kettlebell',
    'elastico',
    'peso_corporal',
    'outro',
] as const

export const SET_METRICS = ['repeticoes', 'tempo', 'distancia'] as const

export const MAX_RIR = 10
const MAX_DROPS_PER_SET = 10
const MAX_OBSERVATION_LENGTH = 2000

const SET_METRIC_DESCRIPTION =
    'Exatamente uma métrica, com os dois campos do par: repeticoes_min/repeticoes_max, segundos_min/segundos_max ou metros_min/metros_max. Valor fixo repete o número nos dois.'

const SET_METRIC_FIELDS = {
    repeticoes: { min: 'repeticoes_min', max: 'repeticoes_max' },
    tempo: { min: 'segundos_min', max: 'segundos_max' },
    distancia: { min: 'metros_min', max: 'metros_max' },
} as const

const nonEmptyText = z.string().trim().min(1)

export type Weekday = (typeof WEEKDAYS)[number]
export type LoadConvention = (typeof LOAD_CONVENTIONS)[number]
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number]
export type SetMetric = (typeof SET_METRICS)[number]

// Contrato versão 1, mantido exatamente como era para que arquivos antigos e
// planos já salvos continuem sendo aceitos sem nenhuma alteração.

const V1_LOAD_CONVENTIONS = ['total', 'por_lado', 'por_halter', 'peso_corporal'] as const

const workoutSetV1Schema = z
    .object({
        repeticoes_min: z.number().int().positive(),
        repeticoes_max: z.number().int().positive(),
        carga_sugerida: z.number().min(0).optional(),
    })
    .strict()
    .refine((set) => set.repeticoes_min <= set.repeticoes_max, {
        message: 'deve ser maior ou igual a repeticoes_min',
        path: ['repeticoes_max'],
    })

const exerciseV1Schema = z
    .object({
        id: nonEmptyText,
        nome: nonEmptyText,
        forma_carga: z.enum(V1_LOAD_CONVENTIONS),
        series: z.array(workoutSetV1Schema).min(1),
    })
    .strict()

const workoutV1Schema = z
    .object({
        id: nonEmptyText,
        nome: nonEmptyText,
        dias_semana: z.array(z.enum(WEEKDAYS)).optional(),
        exercicios: z.array(exerciseV1Schema).min(1),
    })
    .strict()
    .superRefine((workout, ctx) => refineWorkoutUniqueness(workout, ctx))

export const workoutPlanV1Schema = z
    .object({
        versao: z.literal(1),
        nome: nonEmptyText,
        unidade_carga: z.literal('kg'),
        treinos: z.array(workoutV1Schema).min(1),
    })
    .strict()
    .superRefine((plan, ctx) => refinePlanUniqueness(plan, ctx))

// Contrato versão 2. Toda faixa segue a mesma convenção da v1: um par
// campo_min/campo_max, e um valor fixo repete o mesmo número nos dois.

const setMetricShape = {
    repeticoes_min: z.number().int().positive().optional(),
    repeticoes_max: z.number().int().positive().optional(),
    segundos_min: z.number().int().positive().optional(),
    segundos_max: z.number().int().positive().optional(),
    metros_min: z.number().positive().optional(),
    metros_max: z.number().positive().optional(),
    carga_sugerida: z.number().min(0).optional(),
}

type SetMetricFields = { [field in keyof typeof setMetricShape]?: number }

function metricsPresentIn(set: SetMetricFields): SetMetric[] {
    return SET_METRICS.filter((metric) => {
        const fields = SET_METRIC_FIELDS[metric]
        return set[fields.min] !== undefined || set[fields.max] !== undefined
    })
}

function refinePairedRange(
    value: Record<string, unknown>,
    minField: string,
    maxField: string,
    ctx: z.RefinementCtx,
): void {
    const minValue = value[minField]
    const maxValue = value[maxField]

    if (minValue === undefined && maxValue !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `obrigatório junto com ${maxField}`, path: [minField] })
        return
    }
    if (maxValue === undefined && minValue !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `obrigatório junto com ${minField}`, path: [maxField] })
        return
    }
    if (typeof minValue === 'number' && typeof maxValue === 'number' && minValue > maxValue) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `deve ser maior ou igual a ${minField}`,
            path: [maxField],
        })
    }
}

function refineSingleMetric(set: SetMetricFields, ctx: z.RefinementCtx): SetMetric | null {
    const presentMetrics = metricsPresentIn(set)

    if (presentMetrics.length === 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
                'informe a métrica da série: repeticoes_min/repeticoes_max, segundos_min/segundos_max ou metros_min/metros_max',
        })
        return null
    }
    if (presentMetrics.length > 1) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'use uma única métrica por série: repetições, tempo ou distância',
        })
        return null
    }

    const [metric] = presentMetrics
    const fields = SET_METRIC_FIELDS[metric]
    refinePairedRange(set, fields.min, fields.max, ctx)

    return metric
}

const dropV2Schema = z
    .object(setMetricShape)
    .strict()
    .describe(`Queda de um drop set, feita logo após a série, com a mesma métrica dela. ${SET_METRIC_DESCRIPTION}`)
    .superRefine((drop, ctx) => {
        refineSingleMetric(drop, ctx)
    })

const workoutSetV2Schema = z
    .object({
        ...setMetricShape,
        quedas: z.array(dropV2Schema).min(1).max(MAX_DROPS_PER_SET).optional(),
    })
    .strict()
    .describe(SET_METRIC_DESCRIPTION)
    .superRefine((set, ctx) => {
        const setMetric = refineSingleMetric(set, ctx)
        if (!setMetric || !set.quedas) {
            return
        }

        set.quedas.forEach((drop, dropIndex) => {
            const [dropMetric] = metricsPresentIn(drop)
            if (dropMetric && dropMetric !== setMetric) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `a queda deve usar a mesma métrica da série (${setMetric})`,
                    path: ['quedas', dropIndex],
                })
            }
        })
    })

const exerciseV2Schema = z
    .object({
        id: nonEmptyText,
        nome: nonEmptyText,
        equipamento: z.enum(EQUIPMENT_TYPES).optional(),
        forma_carga: z
            .enum(LOAD_CONVENTIONS)
            .describe(
                'Como a carga é registrada. por_halter: peso de um halter só. assistencia: carga que ajuda o movimento, menor é progresso.',
            ),
        por_lado: z
            .boolean()
            .optional()
            .describe('Repetições, tempo ou distância prescritos para cada lado (perna, braço). Não muda a forma de registrar a carga.'),
        descanso_segundos_min: z.number().int().min(0).optional(),
        descanso_segundos_max: z.number().int().min(0).optional(),
        rir_alvo_min: z.number().int().min(0).max(MAX_RIR).optional(),
        rir_alvo_max: z.number().int().min(0).max(MAX_RIR).optional(),
        observacoes: nonEmptyText.max(MAX_OBSERVATION_LENGTH).optional(),
        series: z.array(workoutSetV2Schema).min(1),
    })
    .strict()
    .superRefine((exercise, ctx) => {
        refinePairedRange(exercise, 'descanso_segundos_min', 'descanso_segundos_max', ctx)
        refinePairedRange(exercise, 'rir_alvo_min', 'rir_alvo_max', ctx)
    })

const workoutV2Schema = z
    .object({
        id: nonEmptyText,
        nome: nonEmptyText,
        dias_semana: z.array(z.enum(WEEKDAYS)).optional(),
        exercicios: z.array(exerciseV2Schema).min(1),
    })
    .strict()
    .superRefine((workout, ctx) => refineWorkoutUniqueness(workout, ctx))

export const workoutPlanV2Schema = z
    .object({
        versao: z.literal(2),
        nome: nonEmptyText,
        unidade_carga: z.literal('kg'),
        treinos: z.array(workoutV2Schema).min(1),
    })
    .strict()
    .superRefine((plan, ctx) => refinePlanUniqueness(plan, ctx))

export type WorkoutPlanV1Document = z.infer<typeof workoutPlanV1Schema>
export type WorkoutPlanV2Document = z.infer<typeof workoutPlanV2Schema>
export type WorkoutPlanDocument = WorkoutPlanV1Document | WorkoutPlanV2Document

// Formato interno: o que o resto do app consome, sempre no formato mais novo,
// venha o plano de um arquivo v1, v2 ou do banco. Campos opcionais do contrato
// viram null (ou lista vazia) aqui, para quem lê nunca precisar distinguir
// "ausente" de "nulo". A métrica da série vira um par genérico alvo_min/
// alvo_max, cuja unidade vem de `metrica` (repetições, segundos ou metros).

export type PlannedDrop = {
    alvo_min: number
    alvo_max: number
    carga_sugerida: number | null
}

export type WorkoutSet = {
    metrica: SetMetric
    alvo_min: number
    alvo_max: number
    carga_sugerida: number | null
    quedas: PlannedDrop[]
}

export type Exercise = {
    id: string
    nome: string
    equipamento: EquipmentType | null
    forma_carga: LoadConvention
    por_lado: boolean
    descanso_segundos_min: number | null
    descanso_segundos_max: number | null
    rir_alvo_min: number | null
    rir_alvo_max: number | null
    observacoes: string | null
    series: WorkoutSet[]
}

export type Workout = {
    id: string
    nome: string
    dias_semana?: Weekday[]
    exercicios: Exercise[]
}

export type WorkoutPlan = {
    versao: typeof CURRENT_PLAN_VERSION
    nome: string
    unidade_carga: 'kg'
    treinos: Workout[]
}

export type WorkoutPlanValidationError = {
    path: string
    message: string
}

export type WorkoutPlanValidationResult =
    | { success: true; plan: WorkoutPlan; document: WorkoutPlanDocument }
    | { success: false; errors: WorkoutPlanValidationError[] }

type V1Set = WorkoutPlanV1Document['treinos'][number]['exercicios'][number]['series'][number]
type V2Exercise = WorkoutPlanV2Document['treinos'][number]['exercicios'][number]
type V2Set = V2Exercise['series'][number]
type V2Drop = NonNullable<V2Set['quedas']>[number]

function normalizeV1Set(set: V1Set): WorkoutSet {
    return {
        metrica: 'repeticoes',
        alvo_min: set.repeticoes_min,
        alvo_max: set.repeticoes_max,
        carga_sugerida: set.carga_sugerida ?? null,
        quedas: [],
    }
}

function normalizeV1Plan(document: WorkoutPlanV1Document): WorkoutPlan {
    return {
        versao: CURRENT_PLAN_VERSION,
        nome: document.nome,
        unidade_carga: document.unidade_carga,
        treinos: document.treinos.map((workout) => ({
            id: workout.id,
            nome: workout.nome,
            ...(workout.dias_semana ? { dias_semana: workout.dias_semana } : {}),
            exercicios: workout.exercicios.map((exercise) => ({
                id: exercise.id,
                nome: exercise.nome,
                equipamento: null,
                forma_carga: exercise.forma_carga,
                por_lado: false,
                descanso_segundos_min: null,
                descanso_segundos_max: null,
                rir_alvo_min: null,
                rir_alvo_max: null,
                observacoes: null,
                series: exercise.series.map(normalizeV1Set),
            })),
        })),
    }
}

// Chamado só depois da validação, que garante exatamente um par de métrica
// completo em cada série e em cada queda.
function readMetricTarget(set: SetMetricFields): { metrica: SetMetric; alvo_min: number; alvo_max: number } {
    const [metric] = metricsPresentIn(set)
    const fields = SET_METRIC_FIELDS[metric]

    return { metrica: metric, alvo_min: set[fields.min] as number, alvo_max: set[fields.max] as number }
}

function normalizeV2Drop(drop: V2Drop): PlannedDrop {
    const { alvo_min, alvo_max } = readMetricTarget(drop)

    return { alvo_min, alvo_max, carga_sugerida: drop.carga_sugerida ?? null }
}

function normalizeV2Set(set: V2Set): WorkoutSet {
    return {
        ...readMetricTarget(set),
        carga_sugerida: set.carga_sugerida ?? null,
        quedas: (set.quedas ?? []).map(normalizeV2Drop),
    }
}

function normalizeV2Exercise(exercise: V2Exercise): Exercise {
    return {
        id: exercise.id,
        nome: exercise.nome,
        equipamento: exercise.equipamento ?? null,
        forma_carga: exercise.forma_carga,
        por_lado: exercise.por_lado ?? false,
        descanso_segundos_min: exercise.descanso_segundos_min ?? null,
        descanso_segundos_max: exercise.descanso_segundos_max ?? null,
        rir_alvo_min: exercise.rir_alvo_min ?? null,
        rir_alvo_max: exercise.rir_alvo_max ?? null,
        observacoes: exercise.observacoes ?? null,
        series: exercise.series.map(normalizeV2Set),
    }
}

function normalizeV2Plan(document: WorkoutPlanV2Document): WorkoutPlan {
    return {
        versao: CURRENT_PLAN_VERSION,
        nome: document.nome,
        unidade_carga: document.unidade_carga,
        treinos: document.treinos.map((workout) => ({
            id: workout.id,
            nome: workout.nome,
            ...(workout.dias_semana ? { dias_semana: workout.dias_semana } : {}),
            exercicios: workout.exercicios.map(normalizeV2Exercise),
        })),
    }
}

export function normalizeWorkoutPlanDocument(document: WorkoutPlanDocument): WorkoutPlan {
    return document.versao === 1 ? normalizeV1Plan(document) : normalizeV2Plan(document)
}

function findFirstDuplicate(values: readonly string[]): string | undefined {
    const seen = new Set<string>()

    for (const value of values) {
        if (seen.has(value)) {
            return value
        }
        seen.add(value)
    }

    return undefined
}

function refineWorkoutUniqueness(
    workout: { exercicios: { id: string }[]; dias_semana?: string[] },
    ctx: z.RefinementCtx,
): void {
    const exerciseIds = workout.exercicios.map((exercicio) => exercicio.id)
    const duplicateExerciseId = findFirstDuplicate(exerciseIds)
    if (duplicateExerciseId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `id de exercício duplicado no treino: ${duplicateExerciseId}`,
            path: ['exercicios'],
        })
    }

    const weekdays = workout.dias_semana ?? []
    const duplicateWeekday = findFirstDuplicate(weekdays)
    if (duplicateWeekday) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `dia da semana duplicado: ${duplicateWeekday}`,
            path: ['dias_semana'],
        })
    }
}

function refinePlanUniqueness(plan: { treinos: { id: string }[] }, ctx: z.RefinementCtx): void {
    const workoutIds = plan.treinos.map((workout) => workout.id)
    const duplicateWorkoutId = findFirstDuplicate(workoutIds)
    if (duplicateWorkoutId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `id de treino duplicado no plano: ${duplicateWorkoutId}`,
            path: ['treinos'],
        })
    }
}

function formatIssuePath(issue: z.ZodIssue): string {
    const formattedPath = issue.path
        .map((segment) => (typeof segment === 'number' ? `[${segment}]` : segment))
        .join('.')
        .replace(/\.\[/g, '[')

    return formattedPath || '(raiz)'
}

function readDeclaredVersion(parsedJson: unknown): unknown {
    if (typeof parsedJson !== 'object' || parsedJson === null || !('versao' in parsedJson)) {
        return undefined
    }

    return (parsedJson as { versao: unknown }).versao
}

// A versão decide qual contrato valida o resto do arquivo; sem isso, um erro
// num plano v2 viria misturado com as reclamações do contrato v1.
export function validateWorkoutPlanDocument(parsedJson: unknown): WorkoutPlanValidationResult {
    const declaredVersion = readDeclaredVersion(parsedJson)
    if (declaredVersion !== 1 && declaredVersion !== 2) {
        return {
            success: false,
            errors: [{ path: 'versao', message: 'versão do plano não suportada: use 1 ou 2' }],
        }
    }

    const schema = declaredVersion === 1 ? workoutPlanV1Schema : workoutPlanV2Schema
    const result = schema.safeParse(parsedJson)
    if (!result.success) {
        const errors = result.error.issues.map((issue) => ({
            path: formatIssuePath(issue),
            message: issue.message,
        }))
        return { success: false, errors }
    }

    return { success: true, plan: normalizeWorkoutPlanDocument(result.data), document: result.data }
}

export function parseWorkoutPlanJson(rawText: string): WorkoutPlanValidationResult {
    const rawTextByteLength = new TextEncoder().encode(rawText).length
    if (rawTextByteLength > MAX_PLAN_FILE_BYTES) {
        return {
            success: false,
            errors: [{ path: '(arquivo)', message: 'arquivo maior que 1 MB' }],
        }
    }

    let parsedJson: unknown
    try {
        parsedJson = JSON.parse(rawText)
    } catch {
        return {
            success: false,
            errors: [{ path: '(arquivo)', message: 'conteúdo não é um JSON válido' }],
        }
    }

    return validateWorkoutPlanDocument(parsedJson)
}

// Planos salvos no banco guardam o documento como foi importado (v1 ou v2);
// toda leitura passa por aqui para chegar no formato interno atual.
export function normalizeStoredWorkoutPlan(payload: unknown): WorkoutPlan {
    const result = validateWorkoutPlanDocument(payload)
    if (!result.success) {
        const [firstError] = result.errors
        throw new Error(`Plano salvo em formato inválido (${firstError.path}: ${firstError.message})`)
    }

    return result.plan
}
