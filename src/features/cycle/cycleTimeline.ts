import { shiftIsoDate, type IsoDate } from '@/lib/dateUtils'
import type { WorkoutCycleRow } from '@/features/cycle/types'

export type CycleOnDate = {
    cycle: WorkoutCycleRow
    // Posição do ciclo na linha do tempo, a partir de 1.
    number: number
    // Último dia do ciclo; nulo no ciclo em aberto.
    endDate: IsoDate | null
}

function lastIndexStartedOnOrBefore(cycles: readonly WorkoutCycleRow[], date: IsoDate): number {
    let lastIndex = -1
    cycles.forEach((cycle, index) => {
        if (cycle.start_date <= date) {
            lastIndex = index
        }
    })

    return lastIndex
}

// Espera a lista na ordem cronológica de listCycles (início e, no empate,
// criação). Com dois ciclos no mesmo início, o criado depois vale e o
// anterior fica sem nenhum dia.
export function cycleForDate(cycles: readonly WorkoutCycleRow[], date: IsoDate): CycleOnDate | null {
    const lastStartedIndex = lastIndexStartedOnOrBefore(cycles, date)
    if (lastStartedIndex === -1) {
        return null
    }

    const cycle = cycles[lastStartedIndex]
    const nextCycle = cycles.find((candidate) => candidate.start_date > cycle.start_date) ?? null
    const endDate = nextCycle ? shiftIsoDate(nextCycle.start_date, -1) : null
    // Ciclos repetidos no mesmo início contam uma vez só, para a numeração
    // não pular um ciclo que nunca teve dia.
    const startDatesSoFar = new Set(cycles.slice(0, lastStartedIndex + 1).map((candidate) => candidate.start_date))
    const number = startDatesSoFar.size

    return { cycle, number, endDate }
}

export function nextCycleAfter(cycles: readonly WorkoutCycleRow[], date: IsoDate): WorkoutCycleRow | null {
    const nextCycle = cycles.find((cycle) => cycle.start_date > date) ?? null

    return nextCycle
}
