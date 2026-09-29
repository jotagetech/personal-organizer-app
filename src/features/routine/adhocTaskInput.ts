import { isValidIsoDate, type IsoDate } from '@/lib/dateUtils'

export type AdhocTaskInput = {
    title: string
    entryDate: IsoDate
    dueDate: IsoDate | null
}

export type AdhocTaskValidation = { ok: true; value: AdhocTaskInput } | { ok: false; message: string }

// Lógica pura: valida o formulário de nova tarefa avulsa. O prazo é opcional,
// mas quando informado não pode cair antes da data da tarefa, que é o mesmo
// check garantido no banco.
export function validateAdhocTaskInput(
    rawTitle: string,
    rawEntryDate: string,
    rawDueDate: string | null,
): AdhocTaskValidation {
    const title = rawTitle.trim()
    if (title === '') {
        return { ok: false, message: 'Informe a tarefa.' }
    }
    if (!isValidIsoDate(rawEntryDate)) {
        return { ok: false, message: 'Informe a data.' }
    }
    if (rawDueDate === null) {
        return { ok: true, value: { title, entryDate: rawEntryDate, dueDate: null } }
    }
    if (!isValidIsoDate(rawDueDate)) {
        return { ok: false, message: 'Informe o prazo.' }
    }
    if (rawDueDate < rawEntryDate) {
        return { ok: false, message: 'O prazo não pode ser antes da data da tarefa.' }
    }

    return { ok: true, value: { title, entryDate: rawEntryDate, dueDate: rawDueDate } }
}
