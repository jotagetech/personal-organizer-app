import { z } from 'zod'

export const MAX_PLAN_FILE_BYTES = 1024 * 1024

export const WEEKDAYS = [
    'segunda',
    'terca',
    'quarta',
    'quinta',
    'sexta',
    'sabado',
    'domingo',
] as const

export const LOAD_CONVENTIONS = [
    'total',
    'por_lado',
    'por_halter',
    'peso_corporal',
] as const

const nonEmptyText = z.string().trim().min(1)

const workoutSetSchema = z
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

const exerciseSchema = z
    .object({
        id: nonEmptyText,
        nome: nonEmptyText,
        forma_carga: z.enum(LOAD_CONVENTIONS),
        series: z.array(workoutSetSchema).min(1),
    })
    .strict()

const workoutSchema = z
    .object({
        id: nonEmptyText,
        nome: nonEmptyText,
        dias_semana: z.array(z.enum(WEEKDAYS)).optional(),
        exercicios: z.array(exerciseSchema).min(1),
    })
    .strict()
    .superRefine((workout, ctx) => {
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
    })

export const workoutPlanSchema = z
    .object({
        versao: z.literal(1),
        nome: nonEmptyText,
        unidade_carga: z.literal('kg'),
        treinos: z.array(workoutSchema).min(1),
    })
    .strict()
    .superRefine((plan, ctx) => {
        const workoutIds = plan.treinos.map((workout) => workout.id)
        const duplicateWorkoutId = findFirstDuplicate(workoutIds)
        if (duplicateWorkoutId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `id de treino duplicado no plano: ${duplicateWorkoutId}`,
                path: ['treinos'],
            })
        }
    })

export type WorkoutPlan = z.infer<typeof workoutPlanSchema>
export type Workout = z.infer<typeof workoutSchema>
export type Exercise = z.infer<typeof exerciseSchema>
export type WorkoutSet = z.infer<typeof workoutSetSchema>
export type Weekday = (typeof WEEKDAYS)[number]
export type LoadConvention = (typeof LOAD_CONVENTIONS)[number]

export type WorkoutPlanValidationError = {
    path: string
    message: string
}

export type WorkoutPlanValidationResult =
    | { success: true; plan: WorkoutPlan }
    | { success: false; errors: WorkoutPlanValidationError[] }

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

function formatIssuePath(issue: z.ZodIssue): string {
    const formattedPath = issue.path
        .map((segment) => (typeof segment === 'number' ? `[${segment}]` : segment))
        .join('.')
        .replace(/\.\[/g, '[')

    return formattedPath || '(raiz)'
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

    const result = workoutPlanSchema.safeParse(parsedJson)
    if (result.success) {
        return { success: true, plan: result.data }
    }

    const errors = result.error.issues.map((issue) => ({
        path: formatIssuePath(issue),
        message: issue.message,
    }))
    return { success: false, errors }
}
