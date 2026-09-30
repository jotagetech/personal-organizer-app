import { groupLastTimeByExercise, type LastTime, type LastTimeRow } from '@/features/evolution/metrics/lastTime'
import type { IsoDate } from '@/lib/dateUtils'
import { supabase } from '@/lib/supabaseClient'
import type { SetMetric } from '@/lib/workoutPlanSchema'

// Leitura de apoio: rede instável não pode deixar o treino esperando.
const LAST_TIME_READ_TIMEOUT_MS = 8_000

// Por chave, sobra espaço para algumas sessões recentes; o teto é o corte de
// resposta do PostgREST.
const LAST_TIME_ROWS_PER_KEY = 30
const LAST_TIME_ROWS_MAX = 1000

type StoredLastTimeRow = {
    exercise_key: string
    set_index: number
    load_kg: number | null
    reps: number | null
    duration_seconds: number | null
    distance_m: number | null
    metric: SetMetric | null
    workout_sessions: { session_date: string }
}

function toLastTimeRow(row: StoredLastTimeRow): LastTimeRow {
    return {
        exerciseKey: row.exercise_key,
        sessionDate: row.workout_sessions.session_date,
        setIndex: row.set_index,
        loadKg: row.load_kg,
        reps: row.reps,
        durationSeconds: row.duration_seconds,
        distanceM: row.distance_m,
        metric: row.metric,
    }
}

// Uma consulta só para todas as chaves: séries concluídas (com conclusão e
// sem pulo) de sessões anteriores à data, da mais recente para a mais antiga.
// O join interno deixa de fora séries de sessão fora do filtro de data.
export async function loadLastTimeByExercise(
    exerciseKeys: string[],
    beforeDate: IsoDate,
): Promise<Map<string, LastTime>> {
    if (exerciseKeys.length === 0) {
        return new Map()
    }

    const { data, error } = await supabase
        .from('workout_sets')
        .select(
            'exercise_key, set_index, load_kg, reps, duration_seconds, distance_m, metric, workout_sessions!inner(session_date)',
        )
        .in('exercise_key', exerciseKeys)
        .lt('workout_sessions.session_date', beforeDate)
        .not('completed_at', 'is', null)
        .is('skipped_at', null)
        .order('workout_sessions(session_date)', { ascending: false })
        .limit(Math.min(exerciseKeys.length * LAST_TIME_ROWS_PER_KEY, LAST_TIME_ROWS_MAX))
        .abortSignal(AbortSignal.timeout(LAST_TIME_READ_TIMEOUT_MS))
        .returns<StoredLastTimeRow[]>()

    if (error) {
        throw new Error(error.message)
    }

    const lastTimeByKey = groupLastTimeByExercise((data ?? []).map(toLastTimeRow))
    return lastTimeByKey
}
