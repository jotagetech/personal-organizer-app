import type { WorkoutSessionRow, WorkoutSetRow } from '@/features/workout/types'

export type SessionActiveWindow = { startIso: string; endIso: string }

const MS_PER_MINUTE = 60_000

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

export type SessionTimes = Pick<WorkoutSessionRow, 'started_at' | 'finished_at'>

function isForwardWindow(startIso: string, endIso: string): boolean {
    const startTime = new Date(startIso).getTime()
    const endTime = new Date(endIso).getTime()
    const isForward = Number.isFinite(startTime) && Number.isFinite(endTime) && endTime > startTime

    return isForward
}

// Fonte única da duração do treino. Com o início marcado (botão "Iniciar
// treino" ou a primeira série confirmada) e o fim registrado, a duração é o
// intervalo entre os dois; sessões gravadas antes de existir o início, ou
// com horários inconsistentes, continuam medidas pela janela das séries.
export function resolveSessionDuration(session: SessionTimes, sets: WorkoutSetRow[]): SessionActiveWindow | null {
    const { started_at: startedAt, finished_at: finishedAt } = session
    if (startedAt && finishedAt && isForwardWindow(startedAt, finishedAt)) {
        const recordedWindow: SessionActiveWindow = { startIso: startedAt, endIso: finishedAt }
        return recordedWindow
    }

    const derivedWindow = deriveSessionActiveWindow(sets)

    return derivedWindow
}

export function durationInMinutes(activeWindow: SessionActiveWindow): number {
    const elapsedMs = new Date(activeWindow.endIso).getTime() - new Date(activeWindow.startIso).getTime()
    const totalMinutes = Math.max(0, Math.round(elapsedMs / MS_PER_MINUTE))

    return totalMinutes
}

export function formatDurationMinutes(startIso: string, endIso: string): string {
    const totalMinutes = durationInMinutes({ startIso, endIso })
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    if (hours === 0) {
        return `${minutes} min`
    }
    return `${hours}h ${minutes}min`
}
