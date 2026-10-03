import { z } from 'zod'

import { MAX_INTERVAL_DAYS, MIN_INTERVAL_DAYS } from '@/features/routine/newTaskInput'
import { ROUTINE_LINK_KINDS } from '@/features/routine/types'
import { isValidIsoDate } from '@/lib/dateUtils'
import { WEEKDAYS } from '@/lib/workoutPlanSchema'

const nonEmptyText = z.string().trim().min(1)

const commonFields = {
    title: nonEmptyText,
    linkKind: z.enum(ROUTINE_LINK_KINDS).optional(),
    categoryId: z.string().min(1).nullable(),
    isImportant: z.boolean(),
}

const weekdaysItemSchema = z
    .object({
        ...commonFields,
        repeatKind: z.literal('weekdays'),
        weekdays: z.array(z.enum(WEEKDAYS)).min(1, 'Marque pelo menos um dia da semana'),
    })
    .strict()
    .superRefine((input, ctx) => {
        const uniqueWeekdays = new Set(input.weekdays)
        if (uniqueWeekdays.size !== input.weekdays.length) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'dia da semana duplicado',
                path: ['weekdays'],
            })
        }
    })

const intervalItemSchema = z
    .object({
        ...commonFields,
        repeatKind: z.literal('interval'),
        intervalDays: z
            .number()
            .int(`Use um número inteiro de ${MIN_INTERVAL_DAYS} a ${MAX_INTERVAL_DAYS} dias`)
            .min(MIN_INTERVAL_DAYS, `Use um número de ${MIN_INTERVAL_DAYS} a ${MAX_INTERVAL_DAYS} dias`)
            .max(MAX_INTERVAL_DAYS, `Use um número de ${MIN_INTERVAL_DAYS} a ${MAX_INTERVAL_DAYS} dias`),
        intervalAnchor: z.string().refine(isValidIsoDate, 'Escolha o dia de início'),
    })
    .strict()

export const routineItemInputSchema = z.union([weekdaysItemSchema, intervalItemSchema])

export type RoutineItemInput = z.infer<typeof routineItemInputSchema>
