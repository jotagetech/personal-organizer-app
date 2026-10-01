import { describe, expect, it } from 'vitest'

import type { ExerciseRow } from '@/features/exerciseCatalog/types'
import { builderPlanToDocument } from '@/features/workout/builder/builderDocument'
import { applyCatalogExercise, unlinkCatalogExercise } from '@/features/workout/builder/builderCatalog'
import { createEmptyPlan, createExercise } from '@/features/workout/builder/builderState'

const PULLDOWN: ExerciseRow = {
    id: 'id-puxada',
    slug: 'puxada_frontal_aberta',
    owner_user_id: null,
    name_pt: 'Puxada frontal aberta',
    name_norm: 'puxada frontal aberta',
    family: 'puxada',
    primary_muscle: 'costas',
    secondary_muscles: ['biceps'],
    equipment: 'cabo',
    pegada: 'pronada',
    largura_pegada: 'aberta',
    acessorio: 'barra_reta',
    padrao_movimento: 'puxar_vertical',
    default_load_form: 'total',
    description_pt: 'descrição',
    source: 'proprio',
    source_ref: null,
    license: 'proprio',
    attribution: null,
    merged_into_id: null,
    created_at: '2026-10-01T00:00:00Z',
}

describe('applyCatalogExercise', () => {
    it('traz nome, slug, equipamento, pegada e forma de carga, e mantém as séries', () => {
        const exercise = { ...createExercise(), nome: 'pull down', forma_carga: 'por_lado' as const }
        const applied = applyCatalogExercise(exercise, PULLDOWN)

        expect(applied).toMatchObject({
            nome: 'Puxada frontal aberta',
            catalogo: 'puxada_frontal_aberta',
            equipamento: 'cabo',
            pegada: 'pronada',
            largura_pegada: 'aberta',
            acessorio: 'barra_reta',
            forma_carga: 'total',
        })
        expect(applied.series).toBe(exercise.series)
    })

    it('máquina com assistência vira a máquina assistida da tela', () => {
        const assisted = { ...PULLDOWN, equipment: 'maquina' as const, default_load_form: 'assistencia' as const }

        expect(applyCatalogExercise(createExercise(), assisted).equipamento).toBe('maquina_assistida')
    })

    it('o slug vai para o arquivo e sai ao desvincular', () => {
        const linked = applyCatalogExercise(createExercise(), PULLDOWN)
        linked.series[0].alvo = { min: '8', max: '12', fixo: false }
        const plan = createEmptyPlan()
        plan.treinos[0].exercicios = [linked]
        const [workout] = builderPlanToDocument(plan).treinos as { exercicios: Record<string, unknown>[] }[]
        const unlinked = unlinkCatalogExercise(linked)

        expect(workout.exercicios[0].catalogo).toBe('puxada_frontal_aberta')
        expect(unlinked.catalogo).toBeNull()
        expect(unlinked.nome).toBe('Puxada frontal aberta')
    })
})
