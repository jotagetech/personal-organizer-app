import { describe, expect, it } from 'vitest'

import { describeStoredPlans, storedPlanDisplayName } from '@/features/workout/storedPlans'

describe('describeStoredPlans', () => {
    it('lista do mais novo para o mais antigo e marca o ativo', () => {
        const entries = describeStoredPlans({
            plans: [
                { id: 'antigo', name: 'Treino ABC', importedAt: '2026-09-01T10:00:00Z' },
                { id: 'novo', name: 'Treino ABCDE', importedAt: '2026-09-20T10:00:00Z' },
            ],
            activePlanId: 'antigo',
        })

        expect(entries.map((entry) => entry.id)).toEqual(['novo', 'antigo'])
        expect(entries.map((entry) => entry.isActive)).toEqual([false, true])
        expect(entries.every((entry) => entry.versionLabel === null)).toBe(true)
    })

    it('numera as versões de planos com o mesmo nome pela ordem de importação', () => {
        const entries = describeStoredPlans({
            plans: [
                { id: 'v3', name: 'Treino ABC', importedAt: '2026-09-03T10:00:00Z' },
                { id: 'outro', name: 'Cardio', importedAt: '2026-09-02T12:00:00Z' },
                { id: 'v1', name: 'Treino ABC', importedAt: '2026-09-01T10:00:00Z' },
                { id: 'v2', name: 'Treino ABC', importedAt: '2026-09-02T10:00:00Z' },
            ],
            activePlanId: 'v3',
        })

        const labelById = Object.fromEntries(entries.map((entry) => [entry.id, entry.versionLabel]))
        expect(labelById).toEqual({
            v1: 'versão 1 de 3',
            v2: 'versão 2 de 3',
            v3: 'versão 3 de 3',
            outro: null,
        })
        expect(storedPlanDisplayName(entries[0])).toBe('Treino ABC (versão 3 de 3)')
    })

    it('sem plano ativo nenhum item fica marcado', () => {
        const entries = describeStoredPlans({
            plans: [{ id: 'unico', name: 'Treino A', importedAt: '2026-09-01T10:00:00Z' }],
            activePlanId: null,
        })

        expect(entries[0].isActive).toBe(false)
    })
})
