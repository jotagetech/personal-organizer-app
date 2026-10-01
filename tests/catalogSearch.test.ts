import { describe, expect, it } from 'vitest'

import { buildCatalogIndex, isKnownNameFor, nameInitials, searchCatalog } from '@/features/exerciseCatalog/catalogSearch'
import type { ExerciseAliasRow, ExerciseCatalogData, ExerciseRow } from '@/features/exerciseCatalog/types'
import { normalizeAlias } from '@/lib/exerciseCatalogSeed'

const CURRENT_USER = 'user-a'

function exercise(id: string, name: string, family: string, overrides: Partial<ExerciseRow> = {}): ExerciseRow {
    const row: ExerciseRow = {
        id,
        slug: id,
        owner_user_id: null,
        name_pt: name,
        name_norm: normalizeAlias(name),
        family,
        primary_muscle: 'peito',
        secondary_muscles: [],
        equipment: 'barra',
        pegada: null,
        largura_pegada: null,
        acessorio: null,
        padrao_movimento: 'empurrar_horizontal',
        default_load_form: 'total',
        description_pt: 'descrição',
        source: 'proprio',
        source_ref: null,
        license: 'proprio',
        attribution: null,
        merged_into_id: null,
        created_at: '2026-10-01T00:00:00Z',
        ...overrides,
    }

    return row
}

function alias(exerciseId: string, text: string, ownerUserId: string | null = null): ExerciseAliasRow {
    const row = {
        id: `${exerciseId}-${text}`,
        exercise_id: exerciseId,
        owner_user_id: ownerUserId,
        alias: text,
        alias_norm: normalizeAlias(text),
        created_at: '2026-10-01T00:00:00Z',
    }

    return row
}

const CATALOG: ExerciseCatalogData = {
    exercises: [
        exercise('supino_reto_barra', 'Supino reto com barra', 'supino_reto'),
        exercise('supino_reto_halteres', 'Supino reto com halteres', 'supino_reto', { equipment: 'halteres' }),
        exercise('puxada_frontal_aberta', 'Puxada frontal aberta', 'puxada'),
        exercise('puxada_triangulo', 'Puxada com triângulo', 'puxada'),
        exercise('stiff_barra', 'Stiff com barra', 'stiff'),
        exercise('fundido', 'Exercício fundido', 'outro', { merged_into_id: 'stiff_barra' }),
    ],
    aliases: [
        alias('stiff_barra', 'levantamento terra romeno'),
        alias('supino_reto_halteres', 'sprh', CURRENT_USER),
        alias('supino_reto_barra', 'sprh-outra-conta', 'user-b'),
    ],
    genericNames: [{ name: 'pull down', name_norm: 'pull down', families: ['puxada'] }],
}

const INDEX = buildCatalogIndex(CATALOG, CURRENT_USER)

function slugsFor(query: string): string[] {
    const slugs = searchCatalog(INDEX, query).matches.map((match) => match.exercise.slug)

    return slugs
}

describe('nameInitials', () => {
    it('pula conectivos', () => {
        expect(nameInitials('supino reto com halteres')).toBe('srh')
        expect(nameInitials('puxada com triangulo')).toBe('pt')
    })
})

describe('searchCatalog', () => {
    it('acha pelo começo do nome, sem acento e sem caixa', () => {
        expect(slugsFor('SUPINO RETO')).toEqual(['supino_reto_barra', 'supino_reto_halteres'])
        expect(slugsFor('puxada com triangulo')[0]).toBe('puxada_triangulo')
    })

    it('acha por palavras soltas em qualquer ordem', () => {
        expect(slugsFor('halteres supino')).toEqual(['supino_reto_halteres'])
    })

    it('acha pelo apelido global e diz que foi pelo apelido', () => {
        const [match] = searchCatalog(INDEX, 'terra romeno').matches

        expect(match.exercise.slug).toBe('stiff_barra')
        expect(match.kind).toBe('apelido')
        expect(match.matchedText).toBe('levantamento terra romeno')
    })

    it('acha pelo apelido da conta e põe na frente', () => {
        const [match] = searchCatalog(INDEX, 'sprh').matches

        expect(match.exercise.slug).toBe('supino_reto_halteres')
        expect(match.kind).toBe('meu_apelido')
    })

    it('acha pelas iniciais do nome', () => {
        const [match] = searchCatalog(INDEX, 'srh').matches

        expect(match.exercise.slug).toBe('supino_reto_halteres')
        expect(match.kind).toBe('iniciais')
    })

    it('nome genérico devolve as variações da família', () => {
        const result = searchCatalog(INDEX, 'Pull down')

        expect(result.generic?.exercises.map((row) => row.slug)).toEqual(['puxada_triangulo', 'puxada_frontal_aberta'])
    })

    it('ignora exercício fundido e busca curta demais', () => {
        expect(slugsFor('fundido')).toEqual([])
        expect(searchCatalog(INDEX, 's')).toEqual({ generic: null, matches: [] })
    })
})

describe('isKnownNameFor', () => {
    it('diz se o texto já leva ao exercício sem apelido novo', () => {
        expect(isKnownNameFor(INDEX, 'Supino reto com halteres', 'supino_reto_halteres')).toBe(true)
        expect(isKnownNameFor(INDEX, 'srh', 'supino_reto_halteres')).toBe(true)
        expect(isKnownNameFor(INDEX, 'supino do joão', 'supino_reto_halteres')).toBe(false)
    })
})
