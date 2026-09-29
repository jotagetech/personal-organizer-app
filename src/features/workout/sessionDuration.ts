import type { WorkoutSetRow } from '@/features/workout/types'

export type SessionActiveWindow = { startIso: string; endIso: string }

// A sessão é criada quando o treino é aberto (às vezes horas antes de
// começar) e finished_at depende de quando a fila conseguiu sincronizar, então
// nenhum dos dois mede o treino de verdade. A janela real vai da primeira à
// última série concluída; séries puladas não têm hora de execução.
export function deriveSessionActiveWindow(sets: WorkoutSetRow[]): SessionActiveWindow | null {
    const completedTimes = sets
        .map((set) => set.completed_at)
        .filter((completedAt): completedAt is string => completedAt !== null)
        .map((completedAt) => ({ iso: completedAt, time: new Date(completedAt).getTime() }))
        .filter((entry) => Number.isFinite(entry.time))

    if (completedTimes.length < 2) {
        return null
    }

    const earliest = completedTimes.reduce((min, entry) => (entry.time < min.time ? entry : min))
    const latest = completedTimes.reduce((max, entry) => (entry.time > max.time ? entry : max))
    if (earliest.time === latest.time) {
        return null
    }

    return { startIso: earliest.iso, endIso: latest.iso }
}

export function formatDurationMinutes(startIso: string, endIso: string): string {
    const totalMinutes = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000))
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    if (hours === 0) {
        return `${minutes} min`
    }
    return `${hours}h ${minutes}min`
}
