import { describe, expect, it } from 'vitest'

import {
    exerciseTags,
    formatRestPrescription,
    formatRirTarget,
    formatSetTargetText,
    loadFieldHint,
    loadFieldLabel,
    loadFieldPlaceholder,
    resultFieldLabel,
} from '@/features/workout/setPresentation'

describe('formatSetTargetText', () => {
    it('mostra o alvo com a unidade da métrica', () => {
        expect(formatSetTargetText('repeticoes', 8, 12, false)).toBe('8 a 12 reps')
        expect(formatSetTargetText('tempo', 20, 40, false)).toBe('20 a 40 s')
        expect(formatSetTargetText('distancia', 25, 40, false)).toBe('25 a 40 m')
    })

    it('valor fixo aparece uma vez só, com vírgula decimal', () => {
        expect(formatSetTargetText('repeticoes', 10, 10, false)).toBe('10 reps')
        expect(formatSetTargetText('distancia', 12.5, 12.5, false)).toBe('12,5 m')
    })

    it('exercício unilateral deixa claro que o alvo é de cada lado', () => {
        expect(formatSetTargetText('repeticoes', 8, 8, true)).toBe('8 reps por lado')
        expect(formatSetTargetText('tempo', 20, 40, true)).toBe('20 a 40 s por lado')
    })
})

describe('loadFieldLabel', () => {
    it('diz o que o número de carga significa em cada forma de carga', () => {
        expect(loadFieldLabel('por_halter', 'halteres')).toBe('Carga por halter')
        expect(loadFieldLabel('total', 'cabo')).toBe('Carga total')
        expect(loadFieldLabel('total', 'barra')).toBe('Carga total (com a barra)')
        expect(loadFieldLabel('por_lado', 'barra')).toBe('Carga por lado')
        expect(loadFieldLabel('peso_corporal', null)).toBe('Lastro opcional')
        expect(loadFieldLabel('assistencia', 'maquina')).toBe('Assistência')
    })
})

describe('loadFieldHint', () => {
    it('halter bilateral confirma a conta de dois halteres com o valor digitado', () => {
        expect(loadFieldHint('por_halter', false, '12')).toBe('2 × 12 kg')
        expect(loadFieldHint('por_halter', false, '12,5')).toBe('2 × 12,5 kg')
    })

    it('halter sem valor ou em exercício unilateral fica só na regra', () => {
        expect(loadFieldHint('por_halter', false, '')).toBe('peso de um halter')
        expect(loadFieldHint('por_halter', true, '12')).toBe('peso de um halter')
    })

    it('assistência avisa que menos é melhor e carga total não tem dica', () => {
        expect(loadFieldHint('assistencia', false, '40')).toBe('menos é melhor')
        expect(loadFieldHint('total', false, '60')).toBeNull()
    })
})

describe('loadFieldPlaceholder', () => {
    it('usa a sugestão do plano como exemplo, e peso corporal sem sugestão fica sem lastro', () => {
        expect(loadFieldPlaceholder('por_halter', 22.5)).toBe('ex: 22,5')
        expect(loadFieldPlaceholder('peso_corporal', null)).toBe('sem lastro')
        expect(loadFieldPlaceholder('total', null)).toBe('ex: 60')
    })
})

describe('prescrição', () => {
    it('formata RIR alvo e descanso, e some quando o plano não prescreve', () => {
        expect(formatRirTarget(2, 3)).toBe('RIR alvo 2 a 3')
        expect(formatRirTarget(0, 0)).toBe('RIR alvo 0')
        expect(formatRirTarget(null, null)).toBeNull()
        expect(formatRestPrescription(90, 120)).toBe('Descanso 90 a 120 s')
        expect(formatRestPrescription(null, null)).toBeNull()
    })

    it('rótulo do resultado segue a métrica', () => {
        expect(resultFieldLabel('repeticoes')).toBe('Realizadas')
        expect(resultFieldLabel('tempo')).toBe('Tempo (s)')
        expect(resultFieldLabel('distancia')).toBe('Distância (m)')
    })
})

describe('exerciseTags', () => {
    it('mostra equipamento e execução unilateral, sem etiqueta para "outro"', () => {
        expect(exerciseTags({ equipamento: 'halteres', por_lado: true })).toEqual(['Halteres', 'Unilateral, cada lado'])
        expect(exerciseTags({ equipamento: 'outro', por_lado: false })).toEqual([])
        expect(exerciseTags({ equipamento: null, por_lado: false })).toEqual([])
    })

    it('mostra acessório e junta orientação e largura numa etiqueta de pegada', () => {
        const pulldown = {
            equipamento: 'cabo',
            acessorio: 'barra_reta',
            pegada: 'pronada',
            largura_pegada: 'aberta',
            por_lado: false,
        } as const

        expect(exerciseTags(pulldown)).toEqual(['Cabo', 'Barra reta', 'Pegada pronada aberta'])
        expect(exerciseTags({ equipamento: null, largura_pegada: 'media', por_lado: false })).toEqual(['Pegada média'])
        expect(exerciseTags({ equipamento: null, pegada: 'neutra', por_lado: false })).toEqual(['Pegada neutra'])
    })
})
