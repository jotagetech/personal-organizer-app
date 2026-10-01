// Snapshot é a cópia congelada do treino gravada em cada sessão, para que o
// histórico não mude quando a ficha muda depois. Sessões antigas guardam o
// formato original (sem `versao`, só repetições); este módulo lê os dois
// formatos e sempre devolve o atual, e é também a validação usada para
// snapshots vindos do localStorage (fila de envio), que são dado externo.

import { z } from 'zod'

import {
    ATTACHMENT_TYPES,
    EQUIPMENT_TYPES,
    EXERCISE_KINDS,
    GRIP_TYPES,
    GRIP_WIDTHS,
    LOAD_CONVENTIONS,
    SET_METRICS,
} from '@/lib/workoutPlanSchema'

export const CURRENT_SNAPSHOT_VERSION = 2

const snapshotDropSchema = z.object({
    drop_index: z.number().int().positive(),
    alvo_min: z.number(),
    alvo_max: z.number(),
    carga_sugerida: z.number().nullable(),
})

// Descanso já resolvido pela ficha no dia da sessão. A série só leva o
// próprio quando ele difere do descanso do exercício; nulo é "igual ao
// exercício", que é também o que um snapshot antigo sem o campo significa.
const snapshotSetSchema = z.object({
    set_index: z.number().int(),
    metrica: z.enum(SET_METRICS),
    alvo_min: z.number(),
    alvo_max: z.number(),
    carga_sugerida: z.number().nullable(),
    descanso_segundos_min: z.number().nullable().default(null),
    descanso_segundos_max: z.number().nullable().default(null),
    quedas: z.array(snapshotDropSchema).default([]),
})

// Prescrição do intervalado já resolvida para a semana. As rodadas também
// aparecem em `series` (uma série de tempo por rodada), que é o que um
// cliente que não conhece o tipo continua lendo.
const snapshotIntervalSchema = z.object({
    modalidade: z.string(),
    rodadas: z.number().int().positive(),
    trabalho_segundos_min: z.number(),
    trabalho_segundos_max: z.number(),
    recuperacao_segundos_min: z.number(),
    recuperacao_segundos_max: z.number(),
    rpe_alvo_min: z.number().nullable().default(null),
    rpe_alvo_max: z.number().nullable().default(null),
})

// `extra` marca o exercício acrescentado só a esta sessão, fora do treino do
// plano. Ausente é exercício do plano, que é o que todo snapshot antigo tem.
// `grupo` é o rótulo do bi-set, tri-set ou circuito copiado da ficha; ausente
// é exercício feito sozinho, como em todo snapshot anterior aos grupos.
// Pegada, largura e acessório seguem a mesma regra: ausente é não informado.
export const snapshotExerciseSchema = z.object({
    exercise_key: z.string(),
    nome: z.string(),
    tipo: z.enum(EXERCISE_KINDS).default('series'),
    intervalado: snapshotIntervalSchema.nullable().default(null),
    equipamento: z.enum(EQUIPMENT_TYPES).nullable().default(null),
    pegada: z.enum(GRIP_TYPES).optional(),
    largura_pegada: z.enum(GRIP_WIDTHS).optional(),
    acessorio: z.enum(ATTACHMENT_TYPES).optional(),
    forma_carga: z.enum(LOAD_CONVENTIONS),
    por_lado: z.boolean().default(false),
    descanso_segundos_min: z.number().nullable().default(null),
    descanso_segundos_max: z.number().nullable().default(null),
    rir_alvo_min: z.number().nullable().default(null),
    rir_alvo_max: z.number().nullable().default(null),
    observacoes: z.string().nullable().default(null),
    series: z.array(snapshotSetSchema),
    extra: z.boolean().optional(),
    grupo: z.string().optional(),
})

// A semana do bloco fica gravada junto com as séries já resolvidas para ela,
// então o histórico mostra o que foi prescrito naquele dia mesmo que o plano
// ou o ciclo mudem depois. Nula quando o plano não tem bloco ou não havia
// ciclo em andamento.
const workoutSnapshotV2Schema = z.object({
    versao: z.literal(CURRENT_SNAPSHOT_VERSION),
    workout_key: z.string(),
    nome: z.string(),
    semana_bloco: z.number().int().positive().nullable().default(null),
    bloco_semanas: z.number().int().positive().nullable().default(null),
    descricao_semana: z.string().nullable().default(null),
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
export type WorkoutSnapshotInterval = z.output<typeof snapshotIntervalSchema>
export type WorkoutSnapshotExercise = z.output<typeof snapshotExerciseSchema>
export type WorkoutSnapshot = z.output<typeof workoutSnapshotV2Schema>
export type LegacyWorkoutSnapshot = z.output<typeof legacySnapshotSchema>
export type StoredWorkoutSnapshot = WorkoutSnapshot | LegacyWorkoutSnapshot

function upgradeLegacySnapshot(legacy: LegacyWorkoutSnapshot): WorkoutSnapshot {
    return {
        versao: CURRENT_SNAPSHOT_VERSION,
        workout_key: legacy.workout_key,
        nome: legacy.nome,
        semana_bloco: null,
        bloco_semanas: null,
        descricao_semana: null,
        exercicios: legacy.exercicios.map((exercicio) => ({
            exercise_key: exercicio.exercise_key,
            nome: exercicio.nome,
            tipo: 'series' as const,
            intervalado: null,
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
                descanso_segundos_min: null,
                descanso_segundos_max: null,
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
