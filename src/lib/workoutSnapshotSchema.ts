// Snapshot é a cópia congelada do treino gravada em cada sessão, para que o
// histórico não mude quando a ficha muda depois. Sessões antigas guardam o
// formato original (sem `versao`, só repetições); este módulo lê os dois
// formatos e sempre devolve o atual, e é também a validação usada para
// snapshots vindos do localStorage (fila de envio), que são dado externo.

import { z } from 'zod'

import { EQUIPMENT_TYPES, LOAD_CONVENTIONS, SET_METRICS } from '@/lib/workoutPlanSchema'

export const CURRENT_SNAPSHOT_VERSION = 2

const snapshotDropSchema = z.object({
    drop_index: z.number().int().positive(),
    alvo_min: z.number(),
    alvo_max: z.number(),
    carga_sugerida: z.number().nullable(),
})

const snapshotSetSchema = z.object({
    set_index: z.number().int(),
    metrica: z.enum(SET_METRICS),
    alvo_min: z.number(),
    alvo_max: z.number(),
    carga_sugerida: z.number().nullable(),
    quedas: z.array(snapshotDropSchema).default([]),
})

const snapshotExerciseSchema = z.object({
    exercise_key: z.string(),
    nome: z.string(),
    equipamento: z.enum(EQUIPMENT_TYPES).nullable().default(null),
    forma_carga: z.enum(LOAD_CONVENTIONS),
    por_lado: z.boolean().default(false),
    descanso_segundos_min: z.number().nullable().default(null),
    descanso_segundos_max: z.number().nullable().default(null),
    rir_alvo_min: z.number().nullable().default(null),
    rir_alvo_max: z.number().nullable().default(null),
    observacoes: z.string().nullable().default(null),
    series: z.array(snapshotSetSchema),
})

const workoutSnapshotV2Schema = z.object({
    versao: z.literal(CURRENT_SNAPSHOT_VERSION),
    workout_key: z.string(),
    nome: z.string(),
    exercicios: z.array(snapshotExerciseSchema),
})

const legacySnapshotSetSchema = z.object({
    set_index: z.number().int(),
    repeticoes_min: z.number().int(),
    repeticoes_max: z.number().int(),
    carga_sugerida: z.number().nullable(),
})

const legacySnapshotExerciseSchema = z.object({
    exercise_key: z.string(),
    nome: z.string(),
    forma_carga: z.enum(LOAD_CONVENTIONS),
    series: z.array(legacySnapshotSetSchema),
})

const legacySnapshotSchema = z.object({
    workout_key: z.string(),
    nome: z.string(),
    exercicios: z.array(legacySnapshotExerciseSchema),
})

export type WorkoutSnapshotDrop = z.output<typeof snapshotDropSchema>
export type WorkoutSnapshotExerciseSet = z.output<typeof snapshotSetSchema>
export type WorkoutSnapshotExercise = z.output<typeof snapshotExerciseSchema>
export type WorkoutSnapshot = z.output<typeof workoutSnapshotV2Schema>
export type LegacyWorkoutSnapshot = z.output<typeof legacySnapshotSchema>
export type StoredWorkoutSnapshot = WorkoutSnapshot | LegacyWorkoutSnapshot

function upgradeLegacySnapshot(legacy: LegacyWorkoutSnapshot): WorkoutSnapshot {
    return {
        versao: CURRENT_SNAPSHOT_VERSION,
        workout_key: legacy.workout_key,
        nome: legacy.nome,
        exercicios: legacy.exercicios.map((exercicio) => ({
            exercise_key: exercicio.exercise_key,
            nome: exercicio.nome,
            equipamento: null,
            forma_carga: exercicio.forma_carga,
            por_lado: false,
            descanso_segundos_min: null,
            descanso_segundos_max: null,
            rir_alvo_min: null,
            rir_alvo_max: null,
            observacoes: null,
            series: exercicio.series.map((serie) => ({
                set_index: serie.set_index,
                metrica: 'repeticoes' as const,
                alvo_min: serie.repeticoes_min,
                alvo_max: serie.repeticoes_max,
                carga_sugerida: serie.carga_sugerida,
                quedas: [],
            })),
        })),
    }
}

// A versão atual vem primeiro: um snapshot sem `versao` nunca casa com ela e
// cai no formato antigo, que é convertido na hora.
export const storedWorkoutSnapshotSchema = z.union([
    workoutSnapshotV2Schema,
    legacySnapshotSchema.transform(upgradeLegacySnapshot),
])

export function normalizeWorkoutSnapshot(rawSnapshot: unknown): WorkoutSnapshot {
    const result = storedWorkoutSnapshotSchema.safeParse(rawSnapshot)
    if (!result.success) {
        throw new Error('Snapshot de treino em formato desconhecido')
    }

    return result.data
}
