import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { buildWorkoutPlanJsonSchema, WORKOUT_PLAN_JSON_SCHEMA_FILE } from '../scripts/workoutPlanJsonSchema.ts'

// O arquivo versionado é o que ferramentas fora do app (como o validador do skill de
// plano de treino) consomem; se ele ficar para trás do Zod, elas aceitam plano que o app recusa.
describe('schemas/workout-plan.schema.json', () => {
    it('está em dia com o schema Zod do plano', () => {
        const committedSchema: unknown = JSON.parse(readFileSync(WORKOUT_PLAN_JSON_SCHEMA_FILE, 'utf8'))

        expect(committedSchema, 'arquivo desatualizado: rode npm run schema:generate').toEqual(
            buildWorkoutPlanJsonSchema(),
        )
    })
})
