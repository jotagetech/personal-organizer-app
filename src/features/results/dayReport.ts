import { computeDailyTotals } from '@/features/food/dailyTotals'
import type { DaySummary } from '@/features/results/api'
import { summarizeWorkoutSets } from '@/features/results/daySummary'
import type { RoutineRow } from '@/features/routine/types'
import type { IsoDate } from '@/lib/dateUtils'

export type DayReportBand = 'no_routine' | 'complete' | 'mostly' | 'partial' | 'none'

export type DayReport = {
    band: DayReportBand
    routineDoneCount: number
    routineTotalCount: number
    pendingTitles: string[]
    highlights: string[]
    headline: string
}

const MAX_HIGHLIGHTS = 4

// Lógica pura (sem chamada de rede): monta o resumo do dia a partir do que
// getDaySummary/resolveRoutineForDate já buscaram, sem consulta própria.
export function buildDayReport(
    summary: DaySummary,
    routineRows: RoutineRow[],
    date: IsoDate,
    today: IsoDate,
): DayReport {
    const isToday = date === today
    const routineTotalCount = routineRows.length
    const routineDoneCount = routineRows.filter(
        (row) => row.state === 'done' || row.state === 'done_manual_override',
    ).length
    const pendingTitles = routineRows.filter((row) => row.state === 'pending').map((row) => row.title)
    const band = deriveBand(routineDoneCount, routineTotalCount)
    const highlights = buildHighlights(summary)
    const headline = buildHeadline(band, { isToday, doneCount: routineDoneCount, totalCount: routineTotalCount }, date)

    return { band, routineDoneCount, routineTotalCount, pendingTitles, highlights, headline }
}

function deriveBand(doneCount: number, totalCount: number): DayReportBand {
    if (totalCount === 0) {
        return 'no_routine'
    }
    if (doneCount === totalCount) {
        return 'complete'
    }
    if (doneCount === 0) {
        return 'none'
    }
    return doneCount / totalCount >= 0.5 ? 'mostly' : 'partial'
}

function buildHighlights(summary: DaySummary): string[] {
    const highlights: string[] = []

    if (summary.workoutSession?.finished_at) {
        const workoutSummary = summarizeWorkoutSets(summary.workoutSession.workout_snapshot, summary.workoutSets)
        const totalSets = workoutSummary.exercises.reduce((count, exercise) => count + exercise.sets.length, 0)
        const completedSets = workoutSummary.exercises.reduce(
            (count, exercise) => count + exercise.sets.filter((set) => set.isCompleted).length,
            0,
        )
        const duration = formatDurationMinutes(summary.workoutSession.created_at, summary.workoutSession.finished_at)
        highlights.push(`Treino: ${completedSets} de ${totalSets} séries, ${duration}`)
    }

    if (summary.foodEntries.length > 0) {
        const totals = computeDailyTotals(summary.foodEntries)
        highlights.push(`${totals.kcal} kcal · ${totals.proteinG} g de proteína`)
    }

    if (summary.cardioEntries.length > 0) {
        const totalMinutes = summary.cardioEntries.reduce((sum, entry) => sum + entry.duration_minutes, 0)
        highlights.push(`${totalMinutes} min de cardio`)
    }

    if (summary.bodyWeightEntry && summary.sleepEntry) {
        highlights.push('Peso e sono registrados')
    } else if (summary.bodyWeightEntry) {
        highlights.push(`Peso registrado: ${summary.bodyWeightEntry.weight_kg} kg`)
    } else if (summary.sleepEntry) {
        highlights.push(`Sono registrado: ${summary.sleepEntry.hours} horas`)
    }

    return highlights.slice(0, MAX_HIGHLIGHTS)
}

function formatDurationMinutes(startIso: string, endIso: string): string {
    const totalMinutes = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000))
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    if (hours === 0) {
        return `${minutes} min`
    }
    return `${hours}h ${minutes}min`
}

type HeadlineContext = {
    isToday: boolean
    doneCount: number
    totalCount: number
}

const HEADLINE_BUILDERS: Record<DayReportBand, Array<(ctx: HeadlineContext) => string>> = {
    no_routine: [() => 'Nenhum item de rotina ativo por enquanto.', () => 'Sem rotina configurada ainda.'],
    complete: [
        (ctx) => `Rotina 100% ${ctx.isToday ? 'até agora' : 'no dia'}: os ${ctx.totalCount} itens em dia.`,
        () => 'Rotina fechada, nada ficou pra trás.',
        (ctx) => `Todos os ${ctx.totalCount} itens da rotina foram batidos.`,
    ],
    mostly: [
        (ctx) => `Rotina quase completa: ${ctx.doneCount} de ${ctx.totalCount} feitos.`,
        (ctx) =>
            `Boa parte da rotina em dia, ${ctx.isToday ? 'ainda falta' : 'faltou'} só ${ctx.totalCount - ctx.doneCount}.`,
    ],
    partial: [
        (ctx) =>
            `Rotina começou: ${ctx.doneCount} de ${ctx.totalCount} feitos, ${ctx.isToday ? 'ainda tem' : 'ficou'} bastante pela frente.`,
        (ctx) =>
            `Primeiros passos da rotina dados (${ctx.doneCount} de ${ctx.totalCount}), o resto ${ctx.isToday ? 'ainda falta' : 'faltou'}.`,
    ],
    none: [
        (ctx) => `Nenhum item da rotina feito ${ctx.isToday ? 'ainda' : 'nesse dia'}.`,
        () => 'Rotina zerada por enquanto.',
    ],
}

// Determinístico por data: a mesma data sempre escolhe a mesma variação
// (não muda a cada render), mas datas diferentes tendem a variar o texto.
function pickVariantIndex(date: IsoDate, variantCount: number): number {
    const hash = Array.from(date).reduce((sum, char) => sum + char.charCodeAt(0), 0)
    return hash % variantCount
}

function buildHeadline(band: DayReportBand, ctx: HeadlineContext, date: IsoDate): string {
    const builders = HEADLINE_BUILDERS[band]
    const variantIndex = pickVariantIndex(date, builders.length)
    return builders[variantIndex](ctx)
}
