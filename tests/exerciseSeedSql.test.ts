import { describe, expect, it } from 'vitest'

import { buildExerciseSeedSql, sqlText, sqlTextArray, type ExerciseSeedFiles } from '../scripts/exerciseSeedSql.ts'

const SEED: ExerciseSeedFiles = {
    exercises: [
        {
            slug: 'supino_reto_barra',
            name_pt: "Supino reto d'água",
            family: 'supino_reto',
            primary_muscle: 'peito',
            secondary_muscles: ['triceps', 'ombro_anterior'],
            equipment: 'barra',
            pegada: 'pronada',
            largura_pegada: null,
            acessorio: null,
            padrao_movimento: 'empurrar_horizontal',
            default_load_form: 'total',
            description_pt: 'Desça a barra.',
            source: 'proprio',
            source_ref: null,
            license: 'proprio',
            attribution: null,
        },
    ],
    aliases: [{ alias: 'Supino reto', alias_norm: 'supino reto', slug: 'supino_reto_barra' }],
    genericNames: [{ name: 'Supino', name_norm: 'supino', families: ['supino_reto'] }],
}

describe('sqlText e sqlTextArray', () => {
    it('escapa aspas simples e escreve nulo e lista vazia', () => {
        expect(sqlText("d'água")).toBe("'d''água'")
        expect(sqlText(null)).toBe('null')
        expect(sqlTextArray([])).toBe("'{}'::text[]")
        expect(sqlTextArray(['a', 'b'])).toBe("array['a', 'b']::text[]")
    })
})

describe('buildExerciseSeedSql', () => {
    const sql = buildExerciseSeedSql(SEED)

    it('faz upsert dos exercícios globais pelo slug', () => {
        expect(sql).toContain("('supino_reto_barra', 'Supino reto d''água', 'supino_reto', 'peito'")
        expect(sql).toContain('on conflict (slug) where owner_user_id is null do update set')
        expect(sql).not.toContain('slug = excluded.slug')
    })

    it('sincroniza apelidos e nomes genéricos globais sem tocar nos da conta', () => {
        expect(sql).toContain("('Supino reto', 'supino_reto_barra')")
        expect(sql).toContain('where a.owner_user_id is null')
        expect(sql).toContain("('supino', 'Supino', array['supino_reto']::text[])")
    })

    it('religa as séries existentes no fim', () => {
        expect(sql.trimEnd().endsWith("where ws.session_id = s.id and item ->> 'exercise_key' = ws.exercise_key;")).toBe(true)
    })
})
