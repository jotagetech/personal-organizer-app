import type { RoutineProgress } from '@/features/routine/resolveRoutine'

function isComplete(progress: RoutineProgress): boolean {
    return progress.total > 0 && progress.done >= progress.total
}

// Comemora só a passagem de "faltava algo" para "tudo feito". Um dia sem itens
// nunca comemora, e um dia que já estava completo não comemora de novo.
export function shouldCelebrate(previous: RoutineProgress, next: RoutineProgress): boolean {
    const result = !isComplete(previous) && isComplete(next)

    return result
}
