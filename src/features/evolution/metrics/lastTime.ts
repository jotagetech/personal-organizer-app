// A última vez que um exercício foi feito: as séries concluídas da sessão mais
// recente que o tiveram. A identidade do exercício é a chave, igual entre
// planos, então a leitura não depende de qual plano gerou a sessão.

import { formatDayMonth } from '@/features/evolution/sections/daysWindow'
import { formatSetResult } from '@/features/results/setResultText'
import type { IsoDate } from '@/lib/dateUtils'
import type { LoadConvention, SetMetric } from '@/lib/workoutPlanSchema'

export type LastTimeSet = {
    setIndex: number
    loadKg: number | null
    reps: number | null
    durationSeconds: number | null
    distanceM: number | null
    // Null nas séries gravadas antes da coluna existir.
    metric: SetMetric | null
}

export type LastTime = {
    sessionDate: IsoDate
    sets: LastTimeSet[]
}

export type LastTimeRow = LastTimeSet & {
    exerciseKey: string
    sessionDate: IsoDate
}

function toLastTimeSet(row: LastTimeRow): LastTimeSet {
    return {
        setIndex: row.setIndex,
        loadKg: row.loadKg,
        reps: row.reps,
        durationSeconds: row.durationSeconds,
        distanceM: row.distanceM,
        metric: row.metric,
    }
}

// Fica com a sessão mais recente de cada chave; as linhas de datas mais
// antigas da mesma chave são descartadas, e as séries saem em ordem de índice.
export function groupLastTimeByExercise(rows: LastTimeRow[]): Map<string, LastTime> {
    const newestDateByKey = new Map<string, IsoDate>()
    for (const row of rows) {
        const newestDate = newestDateByKey.get(row.exerciseKey)
        if (newestDate === undefined || row.sessionDate > newestDate) {
            newestDateByKey.set(row.exerciseKey, row.sessionDate)
        }
    }

    const lastTimeByKey = new Map<string, LastTime>()
    for (const [exerciseKey, sessionDate] of newestDateByKey) {
        const sets = rows
            .filter((row) => row.exerciseKey === exerciseKey && row.sessionDate === sessionDate)
            .map(toLastTimeSet)
            .sort((first, second) => first.setIndex - second.setIndex)
        lastTimeByKey.set(exerciseKey, { sessionDate, sets })
    }

    return lastTimeByKey
}

// A série de mesmo índice; sem ela (a sessão de antes tinha menos séries), a
// última que houve.
export function lastTimeForSet(lastTime: LastTime | null, setIndex: number): LastTimeSet | null {
    if (!lastTime || lastTime.sets.length === 0) {
        return null
    }
    const sameIndexSet = lastTime.sets.find((candidate) => candidate.setIndex === setIndex)
    const chosenSet = sameIndexSet ?? lastTime.sets[lastTime.sets.length - 1]

    return chosenSet
}

// A forma de carga e o lado vêm do exercício de hoje, pois a leitura guarda só
// os números; a métrica guardada vale, e a da série de hoje cobre a ausente.
export function formatLastTimeText(
    lastTime: LastTime | null,
    setIndex: number,
    formaCarga: LoadConvention,
    fallbackMetric: SetMetric,
    porLado: boolean,
): string | null {
    const lastSet = lastTimeForSet(lastTime, setIndex)
    if (!lastTime || !lastSet) {
        return null
    }
    const resultText = formatSetResult(formaCarga, lastSet.metric ?? fallbackMetric, lastSet, porLado)
    const lastTimeText = `Última vez (${formatDayMonth(lastTime.sessionDate)}): ${resultText}`

    return lastTimeText
}
