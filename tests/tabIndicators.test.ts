import { describe, expect, it } from 'vitest'

import type { DaySignals } from '@/features/shared/daySignals'
import { deriveTabIndicators } from '@/features/shared/tabIndicators'

function buildSignals(overrides: Partial<DaySignals> = {}): DaySignals {
    const baseSignals: DaySignals = {
        workout: 'none',
        mealsLogged: new Set(),
        foodEntryCount: 0,
        bodyWeightLogged: false,
        sleepLogged: false,
        cardioCount: 0,
    }
    return { ...baseSignals, ...overrides }
}

describe('deriveTabIndicators', () => {
    it('não marca nenhuma aba quando o dia está inteiramente vazio e sem treino previsto', () => {
        const indicators = deriveTabIndicators(buildSignals(), false)

        expect(indicators).toEqual({ treino: 'none', alimentacao: 'none', resultados: 'pending' })
    })

    it('marca tudo como concluído quando o dia está inteiramente preenchido', () => {
        const signals = buildSignals({
            workout: 'finished',
            foodEntryCount: 3,
            bodyWeightLogged: true,
            sleepLogged: true,
        })

        const indicators = deriveTabIndicators(signals, false)

        expect(indicators).toEqual({ treino: 'done', alimentacao: 'done', resultados: 'none' })
    })

    it('marca o treino como pendente (âmbar) quando a sessão está em andamento', () => {
        const indicators = deriveTabIndicators(buildSignals({ workout: 'in_progress' }), false)

        expect(indicators.treino).toBe('pending')
    })

    it('não soa alarme de treino num dia sem sessão quando não havia treino previsto', () => {
        const indicators = deriveTabIndicators(buildSignals({ workout: 'none' }), false)

        expect(indicators.treino).toBe('none')
    })

    it('marca o treino como pendente num dia sem sessão quando havia treino previsto', () => {
        const indicators = deriveTabIndicators(buildSignals({ workout: 'none' }), true)

        expect(indicators.treino).toBe('pending')
    })

    it('marca a alimentação como concluída com apenas um registro parcial no dia', () => {
        const indicators = deriveTabIndicators(buildSignals({ foodEntryCount: 1 }), false)

        expect(indicators.alimentacao).toBe('done')
    })

    it('deixa a alimentação sem indicador quando não há nenhum registro', () => {
        const indicators = deriveTabIndicators(buildSignals({ foodEntryCount: 0 }), false)

        expect(indicators.alimentacao).toBe('none')
    })

    it('marca resultados como pendente quando só o peso está registrado', () => {
        const indicators = deriveTabIndicators(buildSignals({ bodyWeightLogged: true }), false)

        expect(indicators.resultados).toBe('pending')
    })

    it('marca resultados como pendente quando só o sono está registrado', () => {
        const indicators = deriveTabIndicators(buildSignals({ sleepLogged: true }), false)

        expect(indicators.resultados).toBe('pending')
    })

    it('não marca resultados como pendente quando peso e sono estão registrados', () => {
        const indicators = deriveTabIndicators(
            buildSignals({ bodyWeightLogged: true, sleepLogged: true }),
            false,
        )

        expect(indicators.resultados).toBe('none')
    })
})
