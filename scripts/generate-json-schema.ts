import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { zodToJsonSchema } from 'zod-to-json-schema'

import { workoutPlanSchema } from '../src/lib/workoutPlanSchema.ts'

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const outputDirectory = path.join(projectRoot, 'schemas')
const outputFile = path.join(outputDirectory, 'workout-plan.schema.json')

const jsonSchema = zodToJsonSchema(workoutPlanSchema, {
    name: 'WorkoutPlan',
    $refStrategy: 'none',
})

await mkdir(outputDirectory, { recursive: true })
await writeFile(outputFile, `${JSON.stringify(jsonSchema, null, 2)}\n`, 'utf8')

console.log(`JSON Schema gerado em ${path.relative(projectRoot, outputFile)}`)
