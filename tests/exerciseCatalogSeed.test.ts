import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
    normalizeAlias,
    validateExerciseSeed,
    type ExerciseSeed,
    type SeedAlias,
    type SeedExercise,
} from '@/lib/exerciseCatalogSeed'

const SEED_DIR = new URL('../supabase/seed/exercises/', import.meta.url)

const BENCH: SeedExercise = {
    slug: 'supino_reto_barra',
    name_pt: 'Supino reto com barra',
    family: 'supino_reto',
    primary_muscle: 'peito',
    secondary_muscles: ['triceps'],
    equipment: 'barra',
    default_load_form: 'total',
    description_pt: 'Deitado no banco, desça a barra até o peito e empurre de volta.',
    source: 'proprio',
    source_ref: null,
    license: 'proprio',
    attribution: null,
}

const DUMBBELL_BENCH: SeedExercise = {
    ...BENCH,
    slug: 'supino_reto_halteres',
    name_pt: 'Supino reto com halteres',
    equipment: 'halteres',
    default_load_form: 'por_halter',
}

function buildSeed(exercises: SeedExercise[], aliases: SeedAlias[] = []): ExerciseSeed {
    const seed = { exercises, aliases }

    return seed
}

function readSeedFile<T>(fileName: string): T {
    const content = readFileSync(new URL(fileName, SEED_DIR), 'utf-8')
    const parsed = JSON.parse(content) as T

    return parsed
}

describe('normalizeAlias', () => {
    it('tira acento, pontuação e caixa', () => {
        expect(normalizeAlias('Leg press 45°')).toBe('leg press 45')
        expect(normalizeAlias('Tríceps  francês (polia)')).toBe('triceps frances polia')
        expect(normalizeAlias('pull-up')).toBe('pull up')
    })
})

describe('validateExerciseSeed', () => {
    it('aceita um seed coerente', () => {
        const seed = buildSeed(
            [BENCH, DUMBBELL_BENCH],
            [{ alias: 'Supino reto', alias_norm: 'supino reto', slug: 'supino_reto_barra' }],
        )

        expect(validateExerciseSeed(seed)).toEqual([])
    })

    it('recusa slug repetido e fora do formato', () => {
        const seed = buildSeed([BENCH, BENCH, { ...DUMBBELL_BENCH, slug: 'Supino-Halter' }])
        const errors = validateExerciseSeed(seed)

        expect(errors).toContain('slug repetido: supino_reto_barra')
        expect(errors.some((error) => error.includes('Supino-Halter: slug fora do formato'))).toBe(true)
    })

    it('recusa equipamento, forma de carga e músculo fora do vocabulário', () => {
        const seed = buildSeed([{
            ...BENCH,
            equipment: 'polia',
            default_load_form: 'por_braco',
            secondary_muscles: ['peitoral_maior'],
        }])
        const errors = validateExerciseSeed(seed).join('\n')

        expect(errors).toContain('equipment "polia"')
        expect(errors).toContain('default_load_form "por_braco"')
        expect(errors).toContain('peitoral_maior')
    })

    it('recusa apelido para slug inexistente ou com alias_norm errado', () => {
        const seed = buildSeed([BENCH], [
            { alias: 'Supino', alias_norm: 'supino', slug: 'supino_inexistente' },
            { alias: 'Supino reto', alias_norm: 'Supino Reto', slug: 'supino_reto_barra' },
        ])
        const errors = validateExerciseSeed(seed).join('\n')

        expect(errors).toContain('slug inexistente supino_inexistente')
        expect(errors).toContain('alias_norm deveria ser "supino reto"')
    })

    it('recusa o mesmo alias_norm em exercícios diferentes, inclusive contra o nome oficial', () => {
        const seed = buildSeed([BENCH, DUMBBELL_BENCH], [
            { alias: 'Supino', alias_norm: 'supino', slug: 'supino_reto_barra' },
            { alias: 'supino', alias_norm: 'supino', slug: 'supino_reto_halteres' },
            { alias: 'Supino reto com barra', alias_norm: 'supino reto com barra', slug: 'supino_reto_halteres' },
        ])
        const errors = validateExerciseSeed(seed).join('\n')

        expect(errors).toContain('"supino" já pertence a supino_reto_barra')
        expect(errors).toContain('"supino reto com barra" já pertence a supino_reto_barra')
    })

    it('exige licença e atribuição de fonte externa', () => {
        const seed = buildSeed([{ ...BENCH, source: 'wger', license: null }])

        expect(validateExerciseSeed(seed).join('\n')).toContain('fonte externa "wger"')
    })
})

describe('seed de exercícios do repositório', () => {
    it('passa no validador', () => {
        const seed = buildSeed(
            readSeedFile<SeedExercise[]>('exercises.json'),
            readSeedFile<SeedAlias[]>('aliases.json'),
        )

        expect(validateExerciseSeed(seed)).toEqual([])
    })
})
