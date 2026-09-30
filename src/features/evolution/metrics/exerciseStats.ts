// Visão por exercício sobre o registro de sessões. A identidade é o
// `exercise_key`, igual entre planos: o mesmo exercício em fichas diferentes
// soma no mesmo histórico. Só entram séries concluídas (com conclusão e sem
// pulo), que é o que o carregamento já entrega.

import { cycleForDate } from '@/features/cycle/cycleTimeline'
import type { WorkoutCycleRow } from '@/features/cycle/types'
import type { ExerciseLog, LogSession, LogSet } from '@/features/evolution/data/exerciseLog'
import type { IsoDate } from '@/lib/dateUtils'
import type { OutboxDropValues } from '@/lib/outbox/outboxQueue'
import type { LoadConvention, SetMetric } from '@/lib/workoutPlanSchema'
import type { WorkoutSnapshotExercise } from '@/lib/workoutSnapshotSchema'

// Extremos nulos ficam abertos. Os dois valem no próprio dia.
export type DateRange = {
    from: IsoDate | null
    to: IsoDate | null
}

export type RecordKind =
    | 'maxLoad'
    | 'maxReps'
    | 'maxBallast'
    | 'minAssistance'
    | 'bestOneRepMax'
    | 'bestVolume'
    | 'maxDuration'
    | 'maxDistance'

export type RecordEntry = {
    value: number
    date: IsoDate
}

export type MainRecord = RecordEntry & {
    kind: RecordKind
    formaCarga: LoadConvention
}

export type ExerciseIndexEntry = {
    key: string
    name: string
    // Outros nomes que a chave já teve, do mais recente para o mais antigo.
    previousNames: string[]
    sessionCount: number
    lastDate: IsoDate
    metric: SetMetric
    mainRecord: MainRecord | null
}

export type PlannedSet = {
    metric: SetMetric
    targetMin: number
    targetMax: number
    suggestedLoadKg: number | null
}

export type DoneSet = {
    metric: SetMetric
    loadKg: number | null
    reps: number | null
    durationSeconds: number | null
    distanceM: number | null
}

export type HistoryDrop = {
    dropIndex: number
    planned: PlannedSet | null
    done: DoneSet
}

export type HistorySet = {
    setIndex: number
    // Nulo quando o snapshot da sessão não tinha essa série.
    planned: PlannedSet | null
    done: DoneSet
    drops: HistoryDrop[]
}

export type ExerciseSessionEntry = {
    sessionId: string
    date: IsoDate
    name: string
    formaCarga: LoadConvention
    porLado: boolean
    sets: HistorySet[]
}

// O que existe depende da métrica e da forma de carga do exercício: tempo e
// distância não têm carga para estimar 1RM nem volume; peso corporal compara
// repetições e lastro; assistência compara a menor ajuda.
export type ExerciseRecords = {
    metric: SetMetric
    // Forma da sessão mais recente; os recordes de repetições só olham as
    // sessões que tiveram essa forma, porque cargas de formas diferentes não
    // se comparam.
    formaCarga: LoadConvention
    hasOtherLoadForm: boolean
    maxLoad: RecordEntry | null
    maxReps: RecordEntry | null
    maxBallast: RecordEntry | null
    minAssistance: RecordEntry | null
    bestOneRepMax: RecordEntry | null
    bestVolume: RecordEntry | null
    maxDuration: RecordEntry | null
    maxDistance: RecordEntry | null
}

type Appearance = {
    session: LogSession
    // Nulo quando as séries existem mas o snapshot da sessão não lista o
    // exercício.
    exercise: WorkoutSnapshotExercise | null
    name: string
    formaCarga: LoadConvention
    porLado: boolean
    // Em ordem de índice da série.
    sets: LogSet[]
}

const DEFAULT_METRIC: SetMetric = 'repeticoes'
const DEFAULT_LOAD_CONVENTION: LoadConvention = 'total'

// Epley só se sustenta em séries curtas; acima disso a estimativa se descola
// da carga máxima real.
const ONE_REP_MAX_MIN_REPS = 1
const ONE_REP_MAX_MAX_REPS = 12
const EPLEY_REPS_DIVISOR = 30

export function isInRange(date: IsoDate, range?: DateRange): boolean {
    if (!range) {
        return true
    }
    const isAfterStart = range.from === null || date >= range.from
    const isBeforeEnd = range.to === null || date <= range.to
    const isInside = isAfterStart && isBeforeEnd

    return isInside
}

// O ciclo da data, com o último dia dele; aberto, vai sem fim.
export function cycleDateRange(cycles: readonly WorkoutCycleRow[], date: IsoDate): DateRange | null {
    const current = cycleForDate(cycles, date)
    if (!current) {
        return null
    }
    const range = { from: current.cycle.start_date, to: current.endDate }

    return range
}

function groupBy<Item>(items: readonly Item[], keyOf: (item: Item) => string): Map<string, Item[]> {
    const grouped = new Map<string, Item[]>()
    items.forEach((item) => {
        const key = keyOf(item)
        const group = grouped.get(key)
        if (group) {
            group.push(item)
        } else {
            grouped.set(key, [item])
        }
    })

    return grouped
}

function byIndex(sets: readonly LogSet[]): LogSet[] {
    const sorted = [...sets].sort((first, second) => first.setIndex - second.setIndex)

    return sorted
}

function sessionAppearances(session: LogSession, sessionSets: readonly LogSet[]): Appearance[] {
    const setsByKey = groupBy(sessionSets, (set) => set.exerciseKey)
    const appearances: Appearance[] = []
    const listedKeys = new Set<string>()

    session.snapshot.exercicios.forEach((exercise) => {
        const key = exercise.exercise_key
        const sets = setsByKey.get(key)
        if (listedKeys.has(key) || !sets) {
            return
        }
        listedKeys.add(key)
        appearances.push({
            session,
            exercise,
            name: exercise.nome,
            formaCarga: exercise.forma_carga,
            porLado: exercise.por_lado,
            sets: byIndex(sets),
        })
    })

    setsByKey.forEach((sets, key) => {
        if (!listedKeys.has(key)) {
            appearances.push({
                session,
                exercise: null,
                name: key,
                formaCarga: DEFAULT_LOAD_CONVENTION,
                porLado: false,
                sets: byIndex(sets),
            })
        }
    })

    return appearances
}

// Série sem o exercício no snapshot herda nome, forma de carga e lado da
// aparição mais recente da chave que o snapshot descreve.
function resolveOrphans(appearances: readonly Appearance[]): Appearance[] {
    const described = appearances.filter((appearance) => appearance.exercise !== null)
    const reference = described[described.length - 1]
    if (!reference) {
        return [...appearances]
    }

    const resolved = appearances.map((appearance) =>
        appearance.exercise === null
            ? { ...appearance, name: reference.name, formaCarga: reference.formaCarga, porLado: reference.porLado }
            : appearance,
    )

    return resolved
}

// Da sessão mais antiga para a mais nova; datas iguais mantêm a ordem do
// registro.
function appearancesByKey(log: ExerciseLog, range?: DateRange): Map<string, Appearance[]> {
    const setsOfSession = groupBy(log.sets, (set) => set.sessionId)
    const orderedSessions = log.sessions
        .filter((session) => isInRange(session.sessionDate, range))
        .sort((first, second) => first.sessionDate.localeCompare(second.sessionDate))

    const rawByKey = new Map<string, Appearance[]>()
    orderedSessions.forEach((session) => {
        sessionAppearances(session, setsOfSession.get(session.id) ?? []).forEach((appearance) => {
            const key = appearance.sets[0].exerciseKey
            const keyAppearances = rawByKey.get(key)
            if (keyAppearances) {
                keyAppearances.push(appearance)
            } else {
                rawByKey.set(key, [appearance])
            }
        })
    })

    const byKey = new Map<string, Appearance[]>()
    rawByKey.forEach((appearances, key) => byKey.set(key, resolveOrphans(appearances)))

    return byKey
}

// Série gravada antes da coluna de métrica cai na métrica que o snapshot
// planejou para ela, e sem isso em repetições.
function setMetricOf(set: LogSet, exercise: WorkoutSnapshotExercise | null): SetMetric {
    const plannedSet = exercise?.series.find((candidate) => candidate.set_index === set.setIndex)
    const metric = set.metric ?? plannedSet?.metrica ?? DEFAULT_METRIC

    return metric
}

function primaryMetricOf(appearance: Appearance): SetMetric {
    const metric = setMetricOf(appearance.sets[0], appearance.exercise)

    return metric
}

export function estimateOneRepMax(loadKg: number, reps: number): number {
    const estimate = loadKg * (1 + reps / EPLEY_REPS_DIVISOR)

    return estimate
}

// Empate fica com o recorde mais antigo: a data é de quando o valor apareceu.
function beatRecord(current: RecordEntry | null, value: number, date: IsoDate): RecordEntry | null {
    if (value <= 0) {
        return current
    }
    if (current === null || value > current.value) {
        return { value, date }
    }

    return current
}

// Para o que melhora ao diminuir: zero é o melhor valor e conta.
function lowerRecord(current: RecordEntry | null, value: number, date: IsoDate): RecordEntry | null {
    if (current === null || value < current.value) {
        return { value, date }
    }

    return current
}

export function isEstimable(set: LogSet): boolean {
    const canEstimate =
        set.loadKg !== null &&
        set.reps !== null &&
        set.reps >= ONE_REP_MAX_MIN_REPS &&
        set.reps <= ONE_REP_MAX_MAX_REPS

    return canEstimate
}

function loadTimesReps(values: { loadKg: number | null; reps: number | null }): number {
    const product = values.loadKg !== null && values.reps !== null ? values.loadKg * values.reps : 0

    return product
}

function sum(values: readonly number[]): number {
    const total = values.reduce((accumulated, value) => accumulated + value, 0)

    return total
}

// A série e as quedas dela entram no volume; só a série principal entra nos
// recordes de carga.
export function sessionVolume(sets: readonly LogSet[]): number {
    const volume = sum(sets.map((set) => loadTimesReps(set) + sum(set.drops.map(loadTimesReps))))

    return volume
}

export function sessionTotalReps(sets: readonly LogSet[]): number {
    const totalReps = sum(sets.map((set) => (set.reps ?? 0) + sum(set.drops.map((drop) => drop.reps ?? 0))))

    return totalReps
}

function addLoadRecords(records: ExerciseRecords, sets: readonly LogSet[], date: IsoDate) {
    sets.forEach((set) => {
        records.maxLoad = beatRecord(records.maxLoad, set.loadKg ?? 0, date)
        if (isEstimable(set)) {
            const estimate = estimateOneRepMax(set.loadKg ?? 0, set.reps ?? 0)
            records.bestOneRepMax = beatRecord(records.bestOneRepMax, estimate, date)
        }
    })
    records.bestVolume = beatRecord(records.bestVolume, sessionVolume(sets), date)
}

function addBodyweightRecords(records: ExerciseRecords, sets: readonly LogSet[], date: IsoDate) {
    sets.forEach((set) => {
        records.maxReps = beatRecord(records.maxReps, set.reps ?? 0, date)
        records.maxBallast = beatRecord(records.maxBallast, set.loadKg ?? 0, date)
    })
    records.bestVolume = beatRecord(records.bestVolume, sessionTotalReps(sets), date)
}

function addAssistanceRecords(records: ExerciseRecords, sets: readonly LogSet[], date: IsoDate) {
    sets.forEach((set) => {
        if (set.loadKg !== null && (set.reps ?? 0) >= 1) {
            records.minAssistance = lowerRecord(records.minAssistance, set.loadKg, date)
        }
    })
}

function addRepsRecords(records: ExerciseRecords, sets: readonly LogSet[], date: IsoDate) {
    switch (records.formaCarga) {
        case 'peso_corporal':
            addBodyweightRecords(records, sets, date)
            return
        case 'assistencia':
            addAssistanceRecords(records, sets, date)
            return
        case 'total':
        case 'por_lado':
        case 'por_halter':
            addLoadRecords(records, sets, date)
            return
    }
}

type RecordScope = {
    metric: SetMetric
    formaCarga: LoadConvention
    hasOtherLoadForm: boolean
    appearances: Appearance[]
}

// Só as aparições na forma de carga da mais recente entram quando a métrica é
// de repetições; tempo e distância não dependem de carga.
function scopeOf(appearances: readonly Appearance[]): RecordScope | null {
    if (appearances.length === 0) {
        return null
    }

    const latest = appearances[appearances.length - 1]
    const metric = primaryMetricOf(latest)
    const isRepsMetric = metric === 'repeticoes'
    const scoped = isRepsMetric
        ? appearances.filter((appearance) => appearance.formaCarga === latest.formaCarga)
        : [...appearances]
    const scope = {
        metric,
        formaCarga: latest.formaCarga,
        hasOtherLoadForm: scoped.length < appearances.length,
        appearances: scoped,
    }

    return scope
}

function metricSets(appearance: Appearance, metric: SetMetric): LogSet[] {
    const sets = appearance.sets.filter((set) => setMetricOf(set, appearance.exercise) === metric)

    return sets
}

function recordsOf(appearances: readonly Appearance[]): ExerciseRecords | null {
    const scope = scopeOf(appearances)
    if (scope === null) {
        return null
    }

    const { metric } = scope
    const records: ExerciseRecords = {
        metric,
        formaCarga: scope.formaCarga,
        hasOtherLoadForm: scope.hasOtherLoadForm,
        maxLoad: null,
        maxReps: null,
        maxBallast: null,
        minAssistance: null,
        bestOneRepMax: null,
        bestVolume: null,
        maxDuration: null,
        maxDistance: null,
    }

    scope.appearances.forEach((appearance) => {
        const date = appearance.session.sessionDate
        const sets = metricSets(appearance, metric)
        if (metric === 'tempo') {
            sets.forEach((set) => {
                records.maxDuration = beatRecord(records.maxDuration, set.durationSeconds ?? 0, date)
            })
        } else if (metric === 'distancia') {
            sets.forEach((set) => {
                records.maxDistance = beatRecord(records.maxDistance, set.distanceM ?? 0, date)
            })
        } else {
            addRepsRecords(records, sets, date)
        }
    })

    return records
}

function mainRecordOf(records: ExerciseRecords): MainRecord | null {
    const candidates: [RecordKind, RecordEntry | null][] = [
        ['maxDuration', records.maxDuration],
        ['maxDistance', records.maxDistance],
        ['maxReps', records.maxReps],
        ['minAssistance', records.minAssistance],
        ['maxLoad', records.maxLoad],
    ]
    const found = candidates.find(([, entry]) => entry !== null)
    if (!found || found[1] === null) {
        return null
    }
    const mainRecord = { kind: found[0], formaCarga: records.formaCarga, ...found[1] }

    return mainRecord
}

function distinctPreviousNames(appearances: readonly Appearance[], currentName: string): string[] {
    const names: string[] = []
    for (let position = appearances.length - 1; position >= 0; position -= 1) {
        const name = appearances[position].name
        if (name !== currentName && !names.includes(name)) {
            names.push(name)
        }
    }

    return names
}

function indexEntryOf(key: string, appearances: readonly Appearance[]): ExerciseIndexEntry {
    const latest = appearances[appearances.length - 1]
    const records = recordsOf(appearances)
    const entry = {
        key,
        name: latest.name,
        previousNames: distinctPreviousNames(appearances, latest.name),
        sessionCount: appearances.length,
        lastDate: latest.session.sessionDate,
        metric: primaryMetricOf(latest),
        mainRecord: records ? mainRecordOf(records) : null,
    }

    return entry
}

// Do exercício feito mais recentemente para o mais antigo. Quem não tem série
// concluída no período não aparece.
export function buildExerciseIndex(log: ExerciseLog, range?: DateRange): ExerciseIndexEntry[] {
    const entries = [...appearancesByKey(log, range)].map(([key, appearances]) => indexEntryOf(key, appearances))
    entries.sort(
        (first, second) => second.lastDate.localeCompare(first.lastDate) || first.name.localeCompare(second.name),
    )

    return entries
}

function historyDropOf(
    drop: OutboxDropValues,
    position: number,
    metric: SetMetric,
    exercise: WorkoutSnapshotExercise | null,
    setIndex: number,
): HistoryDrop {
    const dropIndex = position + 1
    const plannedDrop = exercise?.series
        .find((candidate) => candidate.set_index === setIndex)
        ?.quedas.find((candidate) => candidate.drop_index === dropIndex)
    const planned = plannedDrop
        ? {
              metric,
              targetMin: plannedDrop.alvo_min,
              targetMax: plannedDrop.alvo_max,
              suggestedLoadKg: plannedDrop.carga_sugerida,
          }
        : null
    const done = {
        metric,
        loadKg: drop.loadKg,
        reps: drop.reps,
        durationSeconds: drop.durationSeconds,
        distanceM: drop.distanceM,
    }

    return { dropIndex, planned, done }
}

function historySetOf(set: LogSet, exercise: WorkoutSnapshotExercise | null): HistorySet {
    const plannedSet = exercise?.series.find((candidate) => candidate.set_index === set.setIndex)
    const metric = setMetricOf(set, exercise)
    const planned = plannedSet
        ? {
              metric: plannedSet.metrica,
              targetMin: plannedSet.alvo_min,
              targetMax: plannedSet.alvo_max,
              suggestedLoadKg: plannedSet.carga_sugerida,
          }
        : null
    const done = {
        metric,
        loadKg: set.loadKg,
        reps: set.reps,
        durationSeconds: set.durationSeconds,
        distanceM: set.distanceM,
    }
    const drops = set.drops.map((drop, position) => historyDropOf(drop, position, metric, exercise, set.setIndex))

    return { setIndex: set.setIndex, planned, done, drops }
}

function sessionEntryOf(appearance: Appearance): ExerciseSessionEntry {
    const { session, exercise, sets } = appearance
    const entry = {
        sessionId: session.id,
        date: session.sessionDate,
        name: appearance.name,
        formaCarga: appearance.formaCarga,
        porLado: appearance.porLado,
        sets: sets.map((set) => historySetOf(set, exercise)),
    }

    return entry
}

// Da sessão mais recente para a mais antiga.
export function exerciseHistory(log: ExerciseLog, key: string, range?: DateRange): ExerciseSessionEntry[] {
    const appearances = appearancesByKey(log, range).get(key) ?? []
    const history = appearances.map(sessionEntryOf).reverse()

    return history
}

export function exerciseRecords(log: ExerciseLog, key: string, range?: DateRange): ExerciseRecords | null {
    const records = recordsOf(appearancesByKey(log, range).get(key) ?? [])

    return records
}

export type SessionSets = {
    date: IsoDate
    // Só as séries principais da métrica do exercício, em ordem de índice.
    sets: LogSet[]
}

// As sessões que os recordes consideram, da mais antiga para a mais nova,
// para as séries por sessão usarem exatamente o mesmo recorte.
export type SeriesScope = {
    metric: SetMetric
    formaCarga: LoadConvention
    sessions: SessionSets[]
}

export function exerciseSeriesScope(log: ExerciseLog, key: string, range?: DateRange): SeriesScope | null {
    const scope = scopeOf(appearancesByKey(log, range).get(key) ?? [])
    if (scope === null) {
        return null
    }
    const sessions = scope.appearances.map((appearance) => ({
        date: appearance.session.sessionDate,
        sets: metricSets(appearance, scope.metric),
    }))
    const seriesScope = { metric: scope.metric, formaCarga: scope.formaCarga, sessions }

    return seriesScope
}
