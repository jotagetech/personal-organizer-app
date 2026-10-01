import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { zodToJsonSchema } from 'zod-to-json-schema'

import { workoutPlanV2Schema } from '../src/lib/workoutPlanSchema.ts'

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

export const WORKOUT_PLAN_JSON_SCHEMA_FILE = path.join(projectRoot, 'schemas', 'workout-plan.schema.json')

// O arquivo descreve o contrato atual, que é o que um plano novo deve seguir;
// a importação continua aceitando a versão 1 por compatibilidade.
export function buildWorkoutPlanJsonSchema() {
    const jsonSchema = zodToJsonSchema(workoutPlanV2Schema, {
        name: 'WorkoutPlan',
        $refStrategy: 'none',
    })
    return jsonSchema
}

export function serializeJsonSchema(jsonSchema: object): string {
    const serialized = `${JSON.stringify(jsonSchema, null, 2)}\n`
    return serialized
}
