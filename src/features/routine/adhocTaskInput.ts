import { isValidIsoDate, type IsoDate } from '@/lib/dateUtils'

export type AdhocTaskInput = {
    title: string
    scheduledOn: IsoDate
}

export type AdhocTaskValidation = { ok: true; value: AdhocTaskInput } | { ok: false; message: string }

// Lógica pura: valida o formulário de nova tarefa avulsa, que vai para o dia
// informado.
export function validateAdhocTaskInput(rawTitle: string, rawScheduledOn: string): AdhocTaskValidation {
    const title = rawTitle.trim()
    if (title === '') {
        return { ok: false, message: 'Informe a tarefa.' }
    }
    if (!isValidIsoDate(rawScheduledOn)) {
        return { ok: false, message: 'Informe a data.' }
    }

    return { ok: true, value: { title, scheduledOn: rawScheduledOn } }
}
