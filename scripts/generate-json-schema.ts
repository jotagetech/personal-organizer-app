import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
    buildWorkoutPlanJsonSchema,
    serializeJsonSchema,
    WORKOUT_PLAN_JSON_SCHEMA_FILE,
} from './workoutPlanJsonSchema.ts'

await mkdir(path.dirname(WORKOUT_PLAN_JSON_SCHEMA_FILE), { recursive: true })
await writeFile(WORKOUT_PLAN_JSON_SCHEMA_FILE, serializeJsonSchema(buildWorkoutPlanJsonSchema()), 'utf8')

console.log(`JSON Schema gerado em ${path.relative(process.cwd(), WORKOUT_PLAN_JSON_SCHEMA_FILE)}`)
