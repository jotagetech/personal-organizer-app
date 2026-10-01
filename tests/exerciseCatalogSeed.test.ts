import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
    normalizeAlias,
    validateExerciseSeed,
    type ExerciseSeed,
    type SeedAlias,
    type SeedExercise,
    type SeedGenericName,
} from '@/lib/exerciseCatalogSeed'

const SEED_DIR = new URL('../supabase/seed/exercises/', import.meta.url)

const BENCH: SeedExercise = {
    slug: 'supino_reto_barra',
    name_pt: 'Supino reto com barra',
    family: 'supino_reto',
    primary_muscle: 'peito',
    secondary_muscles: ['triceps'],
    equipment: 'barra',
    pegada: null,
    largura_pegada: null,
    acessorio: null,
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

const WIDE_PULLDOWN: SeedExercise = {
    ...BENCH,
    slug: 'puxada_frontal_aberta',
    name_pt: 'Puxada frontal aberta',
    family: 'puxada',
    primary_muscle: 'costas',
    secondary_muscles: ['biceps'],
    equipment: 'cabo',
    pegada: 'pronada',
    largura_pegada: 'aberta',
    acessorio: 'barra_reta',
}

function buildSeed(
    exercises: SeedExercise[],
    aliases: SeedAlias[] = [],
    genericNames: SeedGenericName[] = [],
): ExerciseSeed {
    const seed = { exercises, aliases, genericNames }

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

    it('recusa pegada, largura e acessório fora do contrato', () => {
        const seed = buildSeed([{ ...WIDE_PULLDOWN, pegada: 'mista', largura_pegada: 'larga', acessorio: 'v' }])
        const errors = validateExerciseSeed(seed).join('\n')

        expect(errors).toContain('pegada "mista"')
        expect(errors).toContain('largura_pegada "larga"')
        expect(errors).toContain('acessorio "v"')
    })

    it('recusa duas variações iguais em família, equipamento, pegada, largura e acessório', () => {
        const duplicate = { ...WIDE_PULLDOWN, slug: 'pulldown_aberto', name_pt: 'Pulldown aberto' }
        const supinated = { ...WIDE_PULLDOWN, slug: 'puxada_supinada', name_pt: 'Puxada supinada', pegada: 'supinada' }
        const errors = validateExerciseSeed(buildSeed([WIDE_PULLDOWN, duplicate, supinated]))

        expect(errors).toEqual([
            'pulldown_aberto e puxada_frontal_aberta: mesma família, equipamento, pegada, largura e acessório',
        ])
    })

    it('aceita nome genérico ligado a famílias existentes', () => {
        const generic = { name: 'Pull down', name_norm: 'pull down', families: ['puxada'] }

        expect(validateExerciseSeed(buildSeed([WIDE_PULLDOWN], [], [generic]))).toEqual([])
    })

    it('recusa nome genérico de família inexistente ou que já é apelido', () => {
        const alias = { alias: 'Pull down', alias_norm: 'pull down', slug: 'puxada_frontal_aberta' }
        const generics = [
            { name: 'pull down', name_norm: 'pull down', families: ['puxada'] },
            { name: 'Remada baixa', name_norm: 'remada baixa', families: ['remada_baixa'] },
        ]
        const errors = validateExerciseSeed(buildSeed([WIDE_PULLDOWN], [alias], generics)).join('\n')

        expect(errors).toContain('"pull down" já pertence a puxada_frontal_aberta')
        expect(errors).toContain('famílias inexistentes ou vazias (remada_baixa)')
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
            readSeedFile<SeedGenericName[]>('generic_names.json'),
        )

        expect(validateExerciseSeed(seed)).toEqual([])
    })
})
