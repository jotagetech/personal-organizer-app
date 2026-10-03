import { describe, expect, it } from 'vitest'

import { formatRoutineSchedule } from '@/features/routine/routineSchedule'

describe('formatRoutineSchedule', () => {
    it('lista os dias da semana na ordem da semana', () => {
        const text = formatRoutineSchedule({
            repeat_kind: 'weekdays',
            weekdays: ['sexta', 'segunda', 'quarta'],
            interval_days: null,
        })

        expect(text).toBe('Seg, Qua, Sex')
    })

    it('descreve o intervalo em dias', () => {
        const text = formatRoutineSchedule({ repeat_kind: 'interval', weekdays: null, interval_days: 3 })

        expect(text).toBe('A cada 3 dias')
    })

    it('usa o singular para um dia', () => {
        const text = formatRoutineSchedule({ repeat_kind: 'interval', weekdays: null, interval_days: 1 })

        expect(text).toBe('A cada 1 dia')
    })
})
