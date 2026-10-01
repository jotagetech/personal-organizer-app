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

// Pegada, largura e acessório mudam a carga possível (puxada aberta pronada
// e puxada com triângulo não se comparam), então são o que separa variações
// do mesmo movimento. Como o equipamento, são etiquetas: o id do exercício
// continua sendo a chave do histórico.
export const GRIP_TYPES = ['pronada', 'supinada', 'neutra'] as const

export const GRIP_WIDTHS = ['fechada', 'media', 'aberta'] as const

export const ATTACHMENT_TYPES = [
    'barra_reta',
    'barra_w',
    'barra_neutra',
    'triangulo',
    'corda',
    'alca',
] as const

export const SET_METRICS = ['repeticoes', 'tempo', 'distancia'] as const

// Slug do exercício no catálogo compartilhado: minúsculas, sem acento, "_"
// como separador. O de um exercício criado pela conta começa com "meu_".
export const CATALOG_SLUG_PATTERN = /^[a-z0-9]+(_[a-z0-9]+)*$/
export const MAX_CATALOG_SLUG_LENGTH = 80

// Ausente no arquivo, o exercício é de séries, como sempre foi.
export const EXERCISE_KINDS = ['series', 'intervalado'] as const

export const MAX_RIR = 10
export const MAX_BLOCK_WEEKS = 12
const MAX_DROPS_PER_SET = 10
const MAX_OBSERVATION_LENGTH = 2000
const MAX_WEEK_DESCRIPTION_LENGTH = 120
export const MAX_INTERVAL_ROUNDS = 50
const MAX_MODALITY_LENGTH = 60
export const MAX_GROUP_LABEL_LENGTH = 40
export const MIN_GROUP_MEMBERS = 2
export const MIN_RPE = 1
export const MAX_RPE = 10

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
export type GripType = (typeof GRIP_TYPES)[number]
export type GripWidth = (typeof GRIP_WIDTHS)[number]
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number]
export type SetMetric = (typeof SET_METRICS)[number]
export type ExerciseKind = (typeof EXERCISE_KINDS)[number]

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

const restRangeShape = {
    descanso_segundos_min: z.number().int().min(0).optional(),
    descanso_segundos_max: z.number().int().min(0).optional(),
}

const REST_FIELDS = { min: 'descanso_segundos_min', max: 'descanso_segundos_max' } as const

// Descanso depois desta série, quando ela foge do descanso do exercício (a
// última série mais pesada, por exemplo). Não existe na queda: a queda é
// feita sem pausa e o descanso só começa quando a série termina inteira.
const workoutSetV2Schema = z
    .object({
        ...setMetricShape,
        ...restRangeShape,
        quedas: z.array(dropV2Schema).min(1).max(MAX_DROPS_PER_SET).optional(),
    })
    .strict()
    .describe(
        `${SET_METRIC_DESCRIPTION} descanso_segundos_min/descanso_segundos_max opcionais valem só para esta série e vencem o descanso do exercício.`,
    )
    .superRefine((set, ctx) => {
        refinePairedRange(set, REST_FIELDS.min, REST_FIELDS.max, ctx)
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

const restAndRirShape = {
    ...restRangeShape,
    rir_alvo_min: z.number().int().min(0).max(MAX_RIR).optional(),
    rir_alvo_max: z.number().int().min(0).max(MAX_RIR).optional(),
}

function refineRestAndRirPairs(value: Record<string, unknown>, ctx: z.RefinementCtx): void {
    refinePairedRange(value, REST_FIELDS.min, REST_FIELDS.max, ctx)
    refinePairedRange(value, 'rir_alvo_min', 'rir_alvo_max', ctx)
}

// Uma variação troca só o que muda nas semanas indicadas; o que ela não
// informa continua vindo do exercício. `series` substitui a lista inteira,
// o que cobre tanto mudar o alvo quanto tirar ou acrescentar séries.
const variationWeeksSchema = z
    .array(z.number().int().positive())
    .min(1)
    .describe('Semanas do bloco (a partir de 1) em que a variação vale.')

const weekVariationV2Schema = z
    .object({
        semanas: variationWeeksSchema,
        series: z.array(workoutSetV2Schema).min(1).optional(),
        ...restAndRirShape,
    })
    .strict()
    .describe('Substitui, nas semanas indicadas, as séries e/ou o descanso e o RIR alvo do exercício.')
    .superRefine((variation, ctx) => {
        const restAndRirFields = Object.keys(restAndRirShape) as (keyof typeof restAndRirShape)[]
        const overridesSomething =
            variation.series !== undefined || restAndRirFields.some((field) => variation[field] !== undefined)
        if (!overridesSomething) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                    'informe o que muda na semana: series, descanso_segundos_min/descanso_segundos_max ou rir_alvo_min/rir_alvo_max',
            })
        }
        refineRestAndRirPairs(variation, ctx)
    })

const weekDescriptionV2Schema = z
    .object({
        semana: z.number().int().positive(),
        descricao: nonEmptyText.max(MAX_WEEK_DESCRIPTION_LENGTH),
    })
    .strict()

const seriesExerciseV2Schema = z
    .object({
        tipo: z.literal('series').optional().describe('Ausente vale como series.'),
        id: nonEmptyText,
        nome: nonEmptyText,
        catalogo: z
            .string()
            .max(MAX_CATALOG_SLUG_LENGTH)
            .regex(CATALOG_SLUG_PATTERN, 'use o slug do catálogo: minúsculas, sem acento, "_" como separador')
            .optional()
            .describe('Slug do exercício no catálogo do app (ex: supino_reto_barra). Liga o histórico entre planos; o id continua sendo a chave da sessão.'),
        equipamento: z.enum(EQUIPMENT_TYPES).optional(),
        pegada: z
            .enum(GRIP_TYPES)
            .optional()
            .describe('Orientação das mãos. Junto com largura_pegada e acessorio diferencia variações como puxada aberta pronada e puxada supinada.'),
        largura_pegada: z.enum(GRIP_WIDTHS).optional(),
        acessorio: z
            .enum(ATTACHMENT_TYPES)
            .optional()
            .describe('Pegador preso ao cabo ou barra usada: triângulo, corda, barra W.'),
        forma_carga: z
            .enum(LOAD_CONVENTIONS)
            .describe(
                'Como a carga é registrada. por_halter: peso de um halter só. assistencia: carga que ajuda o movimento, menor é progresso.',
            ),
        por_lado: z
            .boolean()
            .optional()
            .describe('Repetições, tempo ou distância prescritos para cada lado (perna, braço). Não muda a forma de registrar a carga.'),
        ...restAndRirShape,
        observacoes: nonEmptyText.max(MAX_OBSERVATION_LENGTH).optional(),
        grupo: nonEmptyText
            .max(MAX_GROUP_LABEL_LENGTH)
            .optional()
            .describe(
                'Bi-set, tri-set ou circuito: exercícios em sequência no treino com o mesmo grupo são feitos alternando uma série de cada, e o descanso vem só depois da rodada.',
            ),
        series: z.array(workoutSetV2Schema).min(1),
        variacoes_semana: z
            .array(weekVariationV2Schema)
            .min(1)
            .optional()
            .describe('Progressão por semana do bloco. Exige bloco_semanas no plano; semana sem variação usa as séries base.'),
    })
    .strict()

// Cardio intervalado: rodadas de trabalho alternadas com recuperação. Não tem
// carga nem séries; cada rodada feita é registrada com o tempo de trabalho.
const INTERVAL_FIELDS_HINT = 'use rodadas, trabalho_segundos_min/max e recuperacao_segundos_min/max'

function notApplicableToInterval(hint?: string) {
    const message = hint
        ? `não se aplica a exercício intervalado: ${hint}`
        : 'não se aplica a exercício intervalado'

    return z.never({ message }).optional()
}

const intervalTargetShape = {
    rodadas: z.number().int().min(1).max(MAX_INTERVAL_ROUNDS).describe('Quantidade de rodadas de trabalho.'),
    trabalho_segundos_min: z.number().int().positive(),
    trabalho_segundos_max: z
        .number()
        .int()
        .positive()
        .describe('Com faixa (min menor que max), quem treina encerra a fase de trabalho dentro dela.'),
    recuperacao_segundos_min: z.number().int().min(0),
    recuperacao_segundos_max: z.number().int().min(0),
}

const rpeTargetShape = {
    rpe_alvo_min: z.number().int().min(MIN_RPE).max(MAX_RPE).optional(),
    rpe_alvo_max: z.number().int().min(MIN_RPE).max(MAX_RPE).optional(),
}

const intervalOverrideShape = {
    rodadas: intervalTargetShape.rodadas.optional(),
    trabalho_segundos_min: intervalTargetShape.trabalho_segundos_min.optional(),
    trabalho_segundos_max: intervalTargetShape.trabalho_segundos_max.optional(),
    recuperacao_segundos_min: intervalTargetShape.recuperacao_segundos_min.optional(),
    recuperacao_segundos_max: intervalTargetShape.recuperacao_segundos_max.optional(),
    ...rpeTargetShape,
}

function refineIntervalPairs(value: Record<string, unknown>, ctx: z.RefinementCtx): void {
    refinePairedRange(value, 'trabalho_segundos_min', 'trabalho_segundos_max', ctx)
    refinePairedRange(value, 'recuperacao_segundos_min', 'recuperacao_segundos_max', ctx)
    refinePairedRange(value, 'rpe_alvo_min', 'rpe_alvo_max', ctx)
}

const intervalWeekVariationV2Schema = z
    .object({
        semanas: variationWeeksSchema,
        ...intervalOverrideShape,
        series: notApplicableToInterval(INTERVAL_FIELDS_HINT),
        descanso_segundos_min: notApplicableToInterval('a pausa entre rodadas é recuperacao_segundos_min/max'),
        descanso_segundos_max: notApplicableToInterval('a pausa entre rodadas é recuperacao_segundos_min/max'),
        rir_alvo_min: notApplicableToInterval('use rpe_alvo_min/rpe_alvo_max'),
        rir_alvo_max: notApplicableToInterval('use rpe_alvo_min/rpe_alvo_max'),
    })
    .strict()
    .describe('Substitui, nas semanas indicadas, as rodadas, o trabalho, a recuperação e/ou o RPE alvo.')
    .superRefine((variation, ctx) => {
        const overrideFields = Object.keys(intervalOverrideShape) as (keyof typeof intervalOverrideShape)[]
        if (!overrideFields.some((field) => variation[field] !== undefined)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                    'informe o que muda na semana: rodadas, trabalho_segundos_min/max, recuperacao_segundos_min/max ou rpe_alvo_min/max',
            })
        }
        refineIntervalPairs(variation, ctx)
    })

const intervalExerciseV2Schema = z
    .object({
        tipo: z.literal('intervalado'),
        id: nonEmptyText,
        nome: nonEmptyText,
        modalidade: nonEmptyText
            .max(MAX_MODALITY_LENGTH)
            .describe('Texto livre: bike, esteira, remo, corrida, o que for usado.'),
        ...intervalTargetShape,
        ...rpeTargetShape,
        observacoes: nonEmptyText.max(MAX_OBSERVATION_LENGTH).optional(),
        variacoes_semana: z
            .array(intervalWeekVariationV2Schema)
            .min(1)
            .optional()
            .describe('Progressão por semana do bloco. Exige bloco_semanas no plano; semana sem variação usa os valores base.'),
        series: notApplicableToInterval(INTERVAL_FIELDS_HINT),
        forma_carga: notApplicableToInterval('exercício intervalado não registra carga'),
        equipamento: notApplicableToInterval('use modalidade'),
        catalogo: notApplicableToInterval('cardio intervalado não entra no catálogo de exercícios'),
        pegada: notApplicableToInterval(),
        largura_pegada: notApplicableToInterval(),
        acessorio: notApplicableToInterval(),
        por_lado: notApplicableToInterval(),
        descanso_segundos_min: notApplicableToInterval('a pausa entre rodadas é recuperacao_segundos_min/max'),
        descanso_segundos_max: notApplicableToInterval('a pausa entre rodadas é recuperacao_segundos_min/max'),
        rir_alvo_min: notApplicableToInterval('use rpe_alvo_min/rpe_alvo_max'),
        rir_alvo_max: notApplicableToInterval('use rpe_alvo_min/rpe_alvo_max'),
        grupo: notApplicableToInterval('bi-set, tri-set e circuito são só entre exercícios de séries'),
    })
    .strict()
    .describe('Cardio intervalado: rodadas de trabalho em segundos alternadas com recuperação.')

const exerciseV2Schema = z
    .discriminatedUnion('tipo', [seriesExerciseV2Schema, intervalExerciseV2Schema], {
        errorMap: (issue, ctx) =>
            issue.code === z.ZodIssueCode.invalid_union_discriminator
                ? { message: 'tipo de exercício inválido: use "series" ou "intervalado" (ausente vale como series)' }
                : { message: ctx.defaultError },
    })
    .superRefine((exercise, ctx) => {
        if (exercise.tipo === 'intervalado') {
            refineIntervalPairs(exercise, ctx)
        } else {
            refineRestAndRirPairs(exercise, ctx)
        }
        refineUniqueVariationWeeks(exercise.variacoes_semana ?? [], ctx)
    })

const workoutV2Schema = z
    .object({
        id: nonEmptyText,
        nome: nonEmptyText,
        dias_semana: z.array(z.enum(WEEKDAYS)).optional(),
        exercicios: z.array(exerciseV2Schema).min(1),
    })
    .strict()
    .superRefine((workout, ctx) => {
        refineWorkoutUniqueness(workout, ctx)
        refineSupersetGroups(workout.exercicios, ctx)
    })

export const workoutPlanV2Schema = z
    .object({
        versao: z.literal(2),
        nome: nonEmptyText,
        unidade_carga: z.literal('kg'),
        bloco_semanas: z
            .number()
            .int()
            .min(1)
            .max(MAX_BLOCK_WEEKS)
            .optional()
            .describe('Duração do bloco em semanas, contadas a partir do início do ciclo. Ao terminar, o bloco recomeça na semana 1.'),
        semanas: z
            .array(weekDescriptionV2Schema)
            .min(1)
            .optional()
            .describe('Descrição curta de cada semana do bloco, mostrada na aba Treino.'),
        descanso_padrao_segundos_min: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe('Descanso usado por todo exercício de séries sem descanso próprio. Não vale para intervalado.'),
        descanso_padrao_segundos_max: z.number().int().min(0).optional(),
        treinos: z.array(workoutV2Schema).min(1),
    })
    .strict()
    .superRefine((plan, ctx) => {
        refinePairedRange(plan, 'descanso_padrao_segundos_min', 'descanso_padrao_segundos_max', ctx)
        refinePlanUniqueness(plan, ctx)
        refineWeeksWithinBlock(plan, ctx)
    })

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

// Descanso nulo na série é "igual ao exercício".
export type WorkoutSet = {
    metrica: SetMetric
    alvo_min: number
    alvo_max: number
    carga_sugerida: number | null
    descanso_segundos_min: number | null
    descanso_segundos_max: number | null
    quedas: PlannedDrop[]
}

// Prescrição do intervalado. Um valor fixo repete o número nos dois campos
// da faixa, como no resto do contrato; RPE alvo é opcional.
export type IntervalPrescription = {
    modalidade: string
    rodadas: number
    trabalho_segundos_min: number
    trabalho_segundos_max: number
    recuperacao_segundos_min: number
    recuperacao_segundos_max: number
    rpe_alvo_min: number | null
    rpe_alvo_max: number | null
}

// Campos nulos numa variação significam "igual ao exercício"; `series` nula
// mantém as séries base. Os campos de intervalado só aparecem preenchidos em
// variação de exercício intervalado, e os de série só na de séries.
export type ExerciseWeekVariation = {
    semanas: number[]
    series: WorkoutSet[] | null
    descanso_segundos_min: number | null
    descanso_segundos_max: number | null
    rir_alvo_min: number | null
    rir_alvo_max: number | null
    rodadas: number | null
    trabalho_segundos_min: number | null
    trabalho_segundos_max: number | null
    recuperacao_segundos_min: number | null
    recuperacao_segundos_max: number | null
    rpe_alvo_min: number | null
    rpe_alvo_max: number | null
}

export type PlanWeekDescription = {
    semana: number
    descricao: string
}

// Num exercício intervalado, `series` tem uma entrada de tempo por rodada
// (alvo = trabalho) e os campos de carga ficam neutros (peso corporal, sem
// equipamento, descanso ou RIR). Assim quem só conhece séries continua
// funcionando: cada rodada é contada, retomada e registrada como uma série.
export type Exercise = {
    id: string
    nome: string
    tipo: ExerciseKind
    intervalado: IntervalPrescription | null
    catalogo: string | null
    equipamento: EquipmentType | null
    pegada: GripType | null
    largura_pegada: GripWidth | null
    acessorio: AttachmentType | null
    forma_carga: LoadConvention
    por_lado: boolean
    descanso_segundos_min: number | null
    descanso_segundos_max: number | null
    rir_alvo_min: number | null
    rir_alvo_max: number | null
    observacoes: string | null
    grupo: string | null
    series: WorkoutSet[]
    variacoes_semana: ExerciseWeekVariation[]
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
    bloco_semanas: number | null
    semanas: PlanWeekDescription[]
    descanso_padrao_segundos_min: number | null
    descanso_padrao_segundos_max: number | null
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
type V2SeriesExercise = Exclude<V2Exercise, { tipo: 'intervalado' }>
type V2IntervalExercise = Extract<V2Exercise, { tipo: 'intervalado' }>
type V2Set = V2SeriesExercise['series'][number]
type V2WeekVariation = NonNullable<V2SeriesExercise['variacoes_semana']>[number]
type V2IntervalWeekVariation = NonNullable<V2IntervalExercise['variacoes_semana']>[number]
type V2Drop = NonNullable<V2Set['quedas']>[number]

function normalizeV1Set(set: V1Set): WorkoutSet {
    return {
        metrica: 'repeticoes',
        alvo_min: set.repeticoes_min,
        alvo_max: set.repeticoes_max,
        carga_sugerida: set.carga_sugerida ?? null,
        descanso_segundos_min: null,
        descanso_segundos_max: null,
        quedas: [],
    }
}

function normalizeV1Plan(document: WorkoutPlanV1Document): WorkoutPlan {
    return {
        versao: CURRENT_PLAN_VERSION,
        nome: document.nome,
        unidade_carga: document.unidade_carga,
        bloco_semanas: null,
        semanas: [],
        descanso_padrao_segundos_min: null,
        descanso_padrao_segundos_max: null,
        treinos: document.treinos.map((workout) => ({
            id: workout.id,
            nome: workout.nome,
            ...(workout.dias_semana ? { dias_semana: workout.dias_semana } : {}),
            exercicios: workout.exercicios.map((exercise) => ({
                id: exercise.id,
                nome: exercise.nome,
                tipo: 'series' as const,
                intervalado: null,
                catalogo: null,
                equipamento: null,
                pegada: null,
                largura_pegada: null,
                acessorio: null,
                forma_carga: exercise.forma_carga,
                por_lado: false,
                descanso_segundos_min: null,
                descanso_segundos_max: null,
                rir_alvo_min: null,
                rir_alvo_max: null,
                observacoes: null,
                grupo: null,
                series: exercise.series.map(normalizeV1Set),
                variacoes_semana: [],
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
        descanso_segundos_min: set.descanso_segundos_min ?? null,
        descanso_segundos_max: set.descanso_segundos_max ?? null,
        quedas: (set.quedas ?? []).map(normalizeV2Drop),
    }
}

const EMPTY_INTERVAL_OVERRIDE = {
    rodadas: null,
    trabalho_segundos_min: null,
    trabalho_segundos_max: null,
    recuperacao_segundos_min: null,
    recuperacao_segundos_max: null,
    rpe_alvo_min: null,
    rpe_alvo_max: null,
} as const

function normalizeV2WeekVariation(variation: V2WeekVariation): ExerciseWeekVariation {
    return {
        semanas: variation.semanas,
        series: variation.series ? variation.series.map(normalizeV2Set) : null,
        descanso_segundos_min: variation.descanso_segundos_min ?? null,
        descanso_segundos_max: variation.descanso_segundos_max ?? null,
        rir_alvo_min: variation.rir_alvo_min ?? null,
        rir_alvo_max: variation.rir_alvo_max ?? null,
        ...EMPTY_INTERVAL_OVERRIDE,
    }
}

function normalizeV2IntervalWeekVariation(variation: V2IntervalWeekVariation): ExerciseWeekVariation {
    return {
        semanas: variation.semanas,
        series: null,
        descanso_segundos_min: null,
        descanso_segundos_max: null,
        rir_alvo_min: null,
        rir_alvo_max: null,
        rodadas: variation.rodadas ?? null,
        trabalho_segundos_min: variation.trabalho_segundos_min ?? null,
        trabalho_segundos_max: variation.trabalho_segundos_max ?? null,
        recuperacao_segundos_min: variation.recuperacao_segundos_min ?? null,
        recuperacao_segundos_max: variation.recuperacao_segundos_max ?? null,
        rpe_alvo_min: variation.rpe_alvo_min ?? null,
        rpe_alvo_max: variation.rpe_alvo_max ?? null,
    }
}

export function intervalRoundSets(prescription: IntervalPrescription): WorkoutSet[] {
    return Array.from({ length: prescription.rodadas }, () => ({
        metrica: 'tempo' as const,
        alvo_min: prescription.trabalho_segundos_min,
        alvo_max: prescription.trabalho_segundos_max,
        carga_sugerida: null,
        descanso_segundos_min: null,
        descanso_segundos_max: null,
        quedas: [],
    }))
}

// Campos de carga neutros para quem lê o exercício como se fosse de séries:
// peso corporal não pede carga para concluir uma rodada.
export function buildIntervalExercise(
    base: { id: string; nome: string; observacoes: string | null; variacoes_semana: ExerciseWeekVariation[] },
    prescription: IntervalPrescription,
): Exercise {
    return {
        id: base.id,
        nome: base.nome,
        tipo: 'intervalado',
        intervalado: prescription,
        catalogo: null,
        equipamento: null,
        pegada: null,
        largura_pegada: null,
        acessorio: null,
        forma_carga: 'peso_corporal',
        por_lado: false,
        descanso_segundos_min: null,
        descanso_segundos_max: null,
        rir_alvo_min: null,
        rir_alvo_max: null,
        observacoes: base.observacoes,
        grupo: null,
        series: intervalRoundSets(prescription),
        variacoes_semana: base.variacoes_semana,
    }
}

function normalizeV2IntervalExercise(exercise: V2IntervalExercise): Exercise {
    const prescription: IntervalPrescription = {
        modalidade: exercise.modalidade,
        rodadas: exercise.rodadas,
        trabalho_segundos_min: exercise.trabalho_segundos_min,
        trabalho_segundos_max: exercise.trabalho_segundos_max,
        recuperacao_segundos_min: exercise.recuperacao_segundos_min,
        recuperacao_segundos_max: exercise.recuperacao_segundos_max,
        rpe_alvo_min: exercise.rpe_alvo_min ?? null,
        rpe_alvo_max: exercise.rpe_alvo_max ?? null,
    }
    const base = {
        id: exercise.id,
        nome: exercise.nome,
        observacoes: exercise.observacoes ?? null,
        variacoes_semana: (exercise.variacoes_semana ?? []).map(normalizeV2IntervalWeekVariation),
    }

    return buildIntervalExercise(base, prescription)
}

function normalizeV2Exercise(exercise: V2Exercise): Exercise {
    if (exercise.tipo === 'intervalado') {
        return normalizeV2IntervalExercise(exercise)
    }

    return {
        id: exercise.id,
        nome: exercise.nome,
        tipo: 'series',
        intervalado: null,
        catalogo: exercise.catalogo ?? null,
        equipamento: exercise.equipamento ?? null,
        pegada: exercise.pegada ?? null,
        largura_pegada: exercise.largura_pegada ?? null,
        acessorio: exercise.acessorio ?? null,
        forma_carga: exercise.forma_carga,
        por_lado: exercise.por_lado ?? false,
        descanso_segundos_min: exercise.descanso_segundos_min ?? null,
        descanso_segundos_max: exercise.descanso_segundos_max ?? null,
        rir_alvo_min: exercise.rir_alvo_min ?? null,
        rir_alvo_max: exercise.rir_alvo_max ?? null,
        observacoes: exercise.observacoes ?? null,
        grupo: exercise.grupo ?? null,
        series: exercise.series.map(normalizeV2Set),
        variacoes_semana: (exercise.variacoes_semana ?? []).map(normalizeV2WeekVariation),
    }
}

function normalizeV2Plan(document: WorkoutPlanV2Document): WorkoutPlan {
    return {
        versao: CURRENT_PLAN_VERSION,
        nome: document.nome,
        unidade_carga: document.unidade_carga,
        bloco_semanas: document.bloco_semanas ?? null,
        semanas: document.semanas ?? [],
        descanso_padrao_segundos_min: document.descanso_padrao_segundos_min ?? null,
        descanso_padrao_segundos_max: document.descanso_padrao_segundos_max ?? null,
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

// O grupo é alternado rodada a rodada, então os membros precisam estar lado a
// lado na ficha: um exercício de fora no meio quebraria a alternância. Um
// grupo de um exercício só não alterna com nada e é quase sempre erro de
// digitação no rótulo.
function refineSupersetGroups(exercises: { grupo?: string }[], ctx: z.RefinementCtx): void {
    const indexesByGroup = new Map<string, number[]>()
    exercises.forEach((exercise, exerciseIndex) => {
        if (exercise.grupo === undefined) {
            return
        }
        const indexes = indexesByGroup.get(exercise.grupo) ?? []
        indexes.push(exerciseIndex)
        indexesByGroup.set(exercise.grupo, indexes)
    })

    indexesByGroup.forEach((indexes, grupo) => {
        const breakIndex = indexes.findIndex(
            (exerciseIndex, position) => position > 0 && exerciseIndex !== indexes[position - 1] + 1,
        )
        if (breakIndex !== -1) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `os exercícios do grupo "${grupo}" devem ficar em sequência no treino`,
                path: ['exercicios', indexes[breakIndex], 'grupo'],
            })
            return
        }
        if (indexes.length < MIN_GROUP_MEMBERS) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `o grupo "${grupo}" precisa de pelo menos ${MIN_GROUP_MEMBERS} exercícios`,
                path: ['exercicios', indexes[0], 'grupo'],
            })
        }
    })
}

// Uma semana só pode ter uma variação por exercício; senão não haveria como
// saber qual delas vale.
function refineUniqueVariationWeeks(variations: { semanas: number[] }[], ctx: z.RefinementCtx): void {
    const seenWeeks = new Set<number>()

    variations.forEach((variation, variationIndex) => {
        variation.semanas.forEach((week, weekPosition) => {
            if (seenWeeks.has(week)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `a semana ${week} já tem variação neste exercício`,
                    path: ['variacoes_semana', variationIndex, 'semanas', weekPosition],
                })
            }
            seenWeeks.add(week)
        })
    })
}

type BlockWeeksPlan = {
    bloco_semanas?: number
    semanas?: { semana: number }[]
    treinos: { exercicios: { variacoes_semana?: { semanas: number[] }[] }[] }[]
}

function weekOutsideBlockMessage(week: number, blockWeeks: number): string {
    return `semana ${week} fora do bloco de ${blockWeeks} semana${blockWeeks === 1 ? '' : 's'} (bloco_semanas)`
}

function refineWeekDescriptions(descriptions: { semana: number }[], blockWeeks: number, ctx: z.RefinementCtx): void {
    const describedWeeks = new Set<number>()

    descriptions.forEach((description, descriptionIndex) => {
        const path = ['semanas', descriptionIndex, 'semana']
        if (description.semana > blockWeeks) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: weekOutsideBlockMessage(description.semana, blockWeeks),
                path,
            })
        }
        if (describedWeeks.has(description.semana)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `semana duplicada: ${description.semana}`, path })
        }
        describedWeeks.add(description.semana)
    })
}

function refineVariationWeeksWithinBlock(plan: BlockWeeksPlan, blockWeeks: number, ctx: z.RefinementCtx): void {
    plan.treinos.forEach((workout, workoutIndex) => {
        workout.exercicios.forEach((exercise, exerciseIndex) => {
            const variations = exercise.variacoes_semana ?? []
            variations.forEach((variation, variationIndex) => {
                variation.semanas.forEach((week, weekPosition) => {
                    if (week <= blockWeeks) {
                        return
                    }
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: weekOutsideBlockMessage(week, blockWeeks),
                        path: [
                            'treinos',
                            workoutIndex,
                            'exercicios',
                            exerciseIndex,
                            'variacoes_semana',
                            variationIndex,
                            'semanas',
                            weekPosition,
                        ],
                    })
                })
            })
        })
    })
}

// A semana de cada variação e de cada descrição só faz sentido dentro de um
// bloco com duração declarada.
function refineWeeksWithinBlock(plan: BlockWeeksPlan, ctx: z.RefinementCtx): void {
    const weekDescriptions = plan.semanas ?? []
    const usesVariations = plan.treinos.some((workout) =>
        workout.exercicios.some((exercise) => exercise.variacoes_semana !== undefined),
    )

    if (plan.bloco_semanas === undefined) {
        if (usesVariations || weekDescriptions.length > 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'obrigatório quando o plano usa variacoes_semana ou semanas',
                path: ['bloco_semanas'],
            })
        }
        return
    }

    refineWeekDescriptions(weekDescriptions, plan.bloco_semanas, ctx)
    refineVariationWeeksWithinBlock(plan, plan.bloco_semanas, ctx)
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
