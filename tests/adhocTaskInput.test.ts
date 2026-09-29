import { describe, expect, it } from 'vitest'

import { validateAdhocTaskInput } from '@/features/routine/adhocTaskInput'

describe('validateAdhocTaskInput', () => {
    it('aceita tarefa sem prazo', () => {
        const validation = validateAdhocTaskInput('  Pagar boleto ', '2026-09-28', null)

        expect(validation).toEqual({
            ok: true,
            value: { title: 'Pagar boleto', entryDate: '2026-09-28', dueDate: null },
        })
    })

    it('aceita prazo no mesmo dia ou depois da data', () => {
        expect(validateAdhocTaskInput('Pagar boleto', '2026-09-28', '2026-09-28').ok).toBe(true)
        expect(validateAdhocTaskInput('Pagar boleto', '2026-09-28', '2026-10-05')).toEqual({
            ok: true,
            value: { title: 'Pagar boleto', entryDate: '2026-09-28', dueDate: '2026-10-05' },
        })
    })

    it('rejeita prazo anterior à data da tarefa', () => {
        const validation = validateAdhocTaskInput('Pagar boleto', '2026-09-28', '2026-09-27')

        expect(validation).toEqual({ ok: false, message: 'O prazo não pode ser antes da data da tarefa.' })
    })

    it('rejeita título vazio, data inválida e prazo inválido', () => {
        expect(validateAdhocTaskInput('   ', '2026-09-28', null).ok).toBe(false)
        expect(validateAdhocTaskInput('Pagar boleto', '', null).ok).toBe(false)
        expect(validateAdhocTaskInput('Pagar boleto', '2026-09-28', '').ok).toBe(false)
    })
})
