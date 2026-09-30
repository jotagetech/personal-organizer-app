import { dropsFromRows } from '@/features/workout/setDrops'
import type { WorkoutSetDropRow } from '@/features/workout/types'
import type { IsoDate } from '@/lib/dateUtils'
import type { OutboxDropValues } from '@/lib/outbox/outboxQueue'
import { supabase } from '@/lib/supabaseClient'
import type { SetMetric } from '@/lib/workoutPlanSchema'
import { normalizeWorkoutSnapshot, type WorkoutSnapshot } from '@/lib/workoutSnapshotSchema'

export type LogSession = {
    id: string
    sessionDate: IsoDate
    finishedAt: string | null
    snapshot: WorkoutSnapshot
}

export type LogSet = {
    sessionId: string
    exerciseKey: string
    setIndex: number
    loadKg: number | null
    reps: number | null
    durationSeconds: number | null
    distanceM: number | null
    // Nula nas séries gravadas antes da coluna existir.
    metric: SetMetric | null
    // A posição na lista é o índice da queda menos 1; queda do meio que não
    // foi feita vem com tudo nulo.
    drops: OutboxDropValues[]
}

export type ExerciseLog = {
    sessions: LogSession[]
    sets: LogSet[]
    // Sessões cujo snapshot não lê no formato atual e ficaram de fora.
    unreadableSessionCount: number
}

type LogSessions = {
    sessions: LogSession[]
    unreadableCount: number
}

type StoredLogSet = {
    id: string
    set: Omit<LogSet, 'drops'>
}

const LOG_PAGE_SIZE = 1000

// Os ids vão na query string do filtro "in"; em lotes, um histórico longo não
// estoura o limite de tamanho de URL dos proxies no caminho.
const SET_IDS_PER_REQUEST = 100

// O PostgREST corta a resposta em 1000 linhas; paginar evita perder as
// sessões e séries mais novas de quem treina há anos.
async function listLogSessions(): Promise<LogSessions> {
    const sessions: LogSession[] = []
    let unreadableCount = 0

    for (let from = 0; ; from += LOG_PAGE_SIZE) {
        const { data, error } = await supabase
            .from('workout_sessions')
            .select('id, session_date, finished_at, workout_snapshot')
            .order('session_date', { ascending: true })
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, from + LOG_PAGE_SIZE - 1)

        if (error) {
            throw new Error(error.message)
        }

        const rows = data ?? []
        rows.forEach((row) => {
            const session = toLogSession(row)
            if (session) {
                sessions.push(session)
            } else {
                unreadableCount += 1
            }
        })

        if (rows.length < LOG_PAGE_SIZE) {
            return { sessions, unreadableCount }
        }
    }
}

// Um snapshot que não lê no formato atual tira só aquela sessão do registro,
// em vez de derrubar a seção inteira.
function toLogSession(row: {
    id: string
    session_date: string
    finished_at: string | null
    workout_snapshot: unknown
}): LogSession | null {
    try {
        const snapshot = normalizeWorkoutSnapshot(row.workout_snapshot)
        return { id: row.id, sessionDate: row.session_date, finishedAt: row.finished_at, snapshot }
    } catch {
        return null
    }
}

// Série concluída é a com conclusão e sem pulo.
async function listCompletedSets(): Promise<StoredLogSet[]> {
    const storedSets: StoredLogSet[] = []

    for (let from = 0; ; from += LOG_PAGE_SIZE) {
        const { data, error } = await supabase
            .from('workout_sets')
            .select('id, session_id, exercise_key, set_index, load_kg, reps, duration_seconds, distance_m, metric')
            .not('completed_at', 'is', null)
            .is('skipped_at', null)
            .order('id', { ascending: true })
            .range(from, from + LOG_PAGE_SIZE - 1)

        if (error) {
            throw new Error(error.message)
        }

        const rows = data ?? []
        rows.forEach((row) => {
            storedSets.push({
                id: row.id,
                set: {
                    sessionId: row.session_id,
                    exerciseKey: row.exercise_key,
                    setIndex: row.set_index,
                    loadKg: row.load_kg,
                    reps: row.reps,
                    durationSeconds: row.duration_seconds,
                    distanceM: row.distance_m,
                    metric: row.metric,
                },
            })
        })

        if (rows.length < LOG_PAGE_SIZE) {
            return storedSets
        }
    }
}

async function listDropRowsOfBatch(setIds: string[]): Promise<WorkoutSetDropRow[]> {
    const rows: WorkoutSetDropRow[] = []

    for (let from = 0; ; from += LOG_PAGE_SIZE) {
        const { data, error } = await supabase
            .from('workout_set_drops')
            .select('*')
            .in('set_id', setIds)
            .order('id', { ascending: true })
            .range(from, from + LOG_PAGE_SIZE - 1)

        if (error) {
            throw new Error(error.message)
        }

        const page = data ?? []
        rows.push(...page)

        if (page.length < LOG_PAGE_SIZE) {
            return rows
        }
    }
}

async function listDropRows(setIds: string[]): Promise<WorkoutSetDropRow[]> {
    const idBatches: string[][] = []
    for (let start = 0; start < setIds.length; start += SET_IDS_PER_REQUEST) {
        idBatches.push(setIds.slice(start, start + SET_IDS_PER_REQUEST))
    }

    const rowsPerBatch = await Promise.all(idBatches.map(listDropRowsOfBatch))
    return rowsPerBatch.flat()
}

function dropsBySetId(rows: readonly WorkoutSetDropRow[]): Map<string, OutboxDropValues[]> {
    const rowsBySetId = new Map<string, WorkoutSetDropRow[]>()
    rows.forEach((row) => {
        const setRows = rowsBySetId.get(row.set_id)
        if (setRows) {
            setRows.push(row)
        } else {
            rowsBySetId.set(row.set_id, [row])
        }
    })

    const dropsMap = new Map<string, OutboxDropValues[]>()
    rowsBySetId.forEach((setRows, setId) => {
        dropsMap.set(setId, dropsFromRows(setRows.sort((first, second) => first.drop_index - second.drop_index)))
    })

    return dropsMap
}

async function listLogSets(): Promise<LogSet[]> {
    const storedSets = await listCompletedSets()
    const dropRows = await listDropRows(storedSets.map((stored) => stored.id))
    const dropsOfSet = dropsBySetId(dropRows)
    const sets = storedSets.map((stored) => ({ ...stored.set, drops: dropsOfSet.get(stored.id) ?? [] }))

    return sets
}

export async function loadExerciseLog(): Promise<ExerciseLog> {
    const [{ sessions, unreadableCount }, sets] = await Promise.all([listLogSessions(), listLogSets()])
    const log = { sessions, sets, unreadableSessionCount: unreadableCount }

    return log
}
