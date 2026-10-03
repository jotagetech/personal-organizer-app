import { describe, expect, it } from 'vitest'

import { validateNewTask, type NewTaskDraft } from '@/features/routine/newTaskInput'

function draft(overrides: Partial<NewTaskDraft> = {}): NewTaskDraft {
    return {
        title: 'Pagar boleto',
        date: '2026-10-08',
        repeat: 'none',
        weekdays: [],
        intervalText: '',
        isImportant: false,
        ...overrides,
    }
}

describe('validateNewTask', () => {
    it('cria tarefa avulsa com o título aparado e a data escolhida', () => {
        const validation = validateNewTask(draft({ title: '  Pagar boleto ' }))

        expect(validation).toEqual({
            ok: true,
            value: { kind: 'task', title: 'Pagar boleto', scheduledOn: '2026-10-08', isImportant: false },
        })
    })

    it('aceita tarefa sem data e carrega a marca de importante', () => {
        const validation = validateNewTask(draft({ date: null, isImportant: true }))

        expect(validation).toEqual({
            ok: true,
            value: { kind: 'task', title: 'Pagar boleto', scheduledOn: null, isImportant: true },
        })
    })

    it('recusa título vazio', () => {
        const validation = validateNewTask(draft({ title: '   ' }))

        expect(validation.ok).toBe(false)
        expect(!validation.ok && validation.errors.title).toBeDefined()
    })

    it('recusa data inexistente', () => {
        const validation = validateNewTask(draft({ date: '2026-02-30' }))

        expect(!validation.ok && validation.errors.date).toBeDefined()
    })

    it('cria item por dias da semana começando na data escolhida', () => {
        const validation = validateNewTask(
            draft({ repeat: 'weekdays', weekdays: ['quinta', 'segunda', 'quinta'], isImportant: true }),
        )

        expect(validation).toEqual({
            ok: true,
            value: {
                kind: 'item',
                title: 'Pagar boleto',
                repeatKind: 'weekdays',
                weekdays: ['quinta', 'segunda'],
                intervalDays: null,
                intervalAnchor: null,
                activeFrom: '2026-10-08',
                isImportant: true,
            },
        })
    })

    it('recusa repetição por dias da semana sem nenhum dia marcado', () => {
        const validation = validateNewTask(draft({ repeat: 'weekdays', weekdays: [] }))

        expect(!validation.ok && validation.errors.weekdays).toBeDefined()
    })

    it('cria item por intervalo ancorado na data escolhida', () => {
        const validation = validateNewTask(draft({ repeat: 'interval', intervalText: ' 3 ' }))

        expect(validation).toEqual({
            ok: true,
            value: {
                kind: 'item',
                title: 'Pagar boleto',
                repeatKind: 'interval',
                weekdays: null,
                intervalDays: 3,
                intervalAnchor: '2026-10-08',
                activeFrom: '2026-10-08',
                isImportant: false,
            },
        })
    })

    it.each(['', '0', '366', '-2', '1.5', 'abc'])('recusa intervalo fora de 1 a 365 (%s)', (intervalText) => {
        const validation = validateNewTask(draft({ repeat: 'interval', intervalText }))

        expect(!validation.ok && validation.errors.interval).toBeDefined()
    })

    it('aceita os limites do intervalo', () => {
        expect(validateNewTask(draft({ repeat: 'interval', intervalText: '1' })).ok).toBe(true)
        expect(validateNewTask(draft({ repeat: 'interval', intervalText: '365' })).ok).toBe(true)
    })

    it('recusa repetir sem data de início', () => {
        const validation = validateNewTask(draft({ date: null, repeat: 'weekdays', weekdays: ['segunda'] }))

        expect(!validation.ok && validation.errors.date).toBeDefined()
    })

    it('junta todos os erros de uma vez', () => {
        const validation = validateNewTask(draft({ title: '', repeat: 'weekdays', weekdays: [] }))

        expect(!validation.ok && Object.keys(validation.errors).sort()).toEqual(['title', 'weekdays'])
    })
})
