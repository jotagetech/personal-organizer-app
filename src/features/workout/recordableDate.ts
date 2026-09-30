// Quando a tela do treino aceita registro. Datas ISO (AAAA-MM-DD) comparadas
// como texto seguem a ordem do calendário, então basta a comparação direta.

import type { IsoDate } from '@/lib/dateUtils'

// Hoje e qualquer dia passado aceitam registro (o retroativo é o mesmo
// fluxo de hoje); um dia futuro só mostra o treino sugerido para consulta.
export function isRecordableSessionDate(sessionDate: IsoDate, today: IsoDate): boolean {
    return sessionDate <= today
}

// 'futuro': a data ainda não chegou. 'excluindo': a exclusão do treino do
// dia está na janela de desfazer, e a tela mostra o dia vazio sem deixar
// recomeçar até ela ser efetivada ou desfeita.
export type RecordingLock = 'futuro' | 'excluindo' | null

export function resolveRecordingLock(
    sessionDate: IsoDate,
    today: IsoDate,
    isDeletionPending: boolean,
): RecordingLock {
    if (isDeletionPending) {
        return 'excluindo'
    }
    if (!isRecordableSessionDate(sessionDate, today)) {
        return 'futuro'
    }

    return null
}

export function recordingLockNotice(lock: RecordingLock): string | null {
    if (lock === 'futuro') {
        return 'Treino de um dia que ainda não chegou: dá para consultar, e o registro abre no próprio dia.'
    }
    if (lock === 'excluindo') {
        return 'Treino do dia excluído. Toque em Desfazer para voltar ao que estava registrado.'
    }

    return null
}
