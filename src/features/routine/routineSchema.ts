import { z } from 'zod'

import { ROUTINE_LINK_KINDS } from '@/features/routine/types'
import { WEEKDAYS } from '@/lib/workoutPlanSchema'

const nonEmptyText = z.string().trim().min(1)

export const routineItemInputSchema = z
    .object({
        title: nonEmptyText,
        weekdays: z.array(z.enum(WEEKDAYS)).min(1),
        linkKind: z.enum(ROUTINE_LINK_KINDS).optional(),
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

export type RoutineItemInput = z.infer<typeof routineItemInputSchema>
