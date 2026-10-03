import { describe, expect, it } from 'vitest'

import { validateAdhocTaskInput } from '@/features/routine/adhocTaskInput'

describe('validateAdhocTaskInput', () => {
    it('aceita a tarefa com título e data, limpando espaços do título', () => {
        const validation = validateAdhocTaskInput('  Pagar boleto ', '2026-09-28')

        expect(validation).toEqual({
            ok: true,
            value: { title: 'Pagar boleto', scheduledOn: '2026-09-28' },
        })
    })

    it('rejeita título vazio', () => {
        expect(validateAdhocTaskInput('   ', '2026-09-28')).toEqual({ ok: false, message: 'Informe a tarefa.' })
    })

    it('rejeita data vazia ou inválida', () => {
        expect(validateAdhocTaskInput('Pagar boleto', '')).toEqual({ ok: false, message: 'Informe a data.' })
        expect(validateAdhocTaskInput('Pagar boleto', '2026-02-30').ok).toBe(false)
    })
})
