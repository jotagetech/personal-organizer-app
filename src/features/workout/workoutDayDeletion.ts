// Excluir o treino do dia passa pela mesma janela de desfazer das outras
// exclusões; o id dela é por data, para a aba Treino e o indicador do dia
// saberem que aquela data está sendo excluída.

import { cancelRestPush } from '@/features/notifications/pushApi'
import { clearWorkoutLocalStateForDate } from '@/features/workout/timerStorage'

export const WORKOUT_DAY_DELETION_LABEL = 'Treino do dia'

export function workoutDayDeletionId(sessionDate: string): string {
    return `treino-do-dia:${sessionDate}`
}

// Efetiva a exclusão: a fila troca tudo o que a data tinha pela exclusão da
// sessão (e a guarda no aparelho até ela chegar ao servidor), e o que a data
// deixou no aparelho some junto. O push agendado só é cancelado quando o
// descanso era desta data, porque ele é um só por usuário.
export function commitWorkoutDayDeletion(sessionDate: string, deleteQueuedSession: (sessionDate: string) => void) {
    deleteQueuedSession(sessionDate)
    const { hadRestTimer } = clearWorkoutLocalStateForDate(sessionDate)
    if (hadRestTimer) {
        cancelRestPush()
    }
}
