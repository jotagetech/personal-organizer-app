import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { buildExerciseSeedSql, readExerciseSeedFiles } from './exerciseSeedSql.ts'

// Uso: npm run exercises:seed-sql -- supabase/migrations/<timestamp>_exercise_catalog_seed.sql
// Cada mudança no seed vira uma migração nova; a já aplicada não é reescrita.
const outputArgument = process.argv[2]
if (!outputArgument) {
    console.error('Informe o arquivo de saída, ex: supabase/migrations/20261001000100_exercise_catalog_seed.sql')
    process.exit(1)
}

const outputFile = path.resolve(outputArgument)
const sql = buildExerciseSeedSql(readExerciseSeedFiles())
await writeFile(outputFile, sql, 'utf8')

console.log(`SQL do seed de exercícios gerado em ${path.relative(process.cwd(), outputFile)}`)
