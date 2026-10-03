import { isValidIsoDate, type IsoDate } from '@/lib/dateUtils'
import type { Weekday } from '@/lib/workoutPlanSchema'

export const MIN_INTERVAL_DAYS = 1
export const MAX_INTERVAL_DAYS = 365

export type NewTaskRepeat = 'none' | 'weekdays' | 'interval'

// Estado cru da folha de nova tarefa. date nulo é "sem data"; o texto do
// intervalo fica como o campo numérico entrega, para o validador decidir.
export type NewTaskDraft = {
    title: string
    date: string | null
    repeat: NewTaskRepeat
    weekdays: Weekday[]
    intervalText: string
    isImportant: boolean
    categoryId: string | null
}

export type NewTaskInsert =
    | { kind: 'task'; title: string; scheduledOn: IsoDate | null; isImportant: boolean; categoryId: string | null }
    | {
          kind: 'item'
          title: string
          repeatKind: 'weekdays'
          weekdays: Weekday[]
          intervalDays: null
          intervalAnchor: null
          activeFrom: IsoDate
          isImportant: boolean
          categoryId: string | null
      }
    | {
          kind: 'item'
          title: string
          repeatKind: 'interval'
          weekdays: null
          intervalDays: number
          intervalAnchor: IsoDate
          activeFrom: IsoDate
          isImportant: boolean
          categoryId: string | null
      }

// Na criação a folha também cria item que repete; na edição só a tarefa
// avulsa muda, então a repetição do rascunho é ignorada.
export type NewTaskMode = 'create' | 'edit'

export type NewTaskErrors = {
    title?: string
    date?: string
    weekdays?: string
    interval?: string
}

export type NewTaskValidation = { ok: true; value: NewTaskInsert } | { ok: false; errors: NewTaskErrors }

const INTEGER_PATTERN = /^\d+$/

// Lógica pura: valida o estado da folha e devolve o insert de tarefa avulsa
// ou de item que repete. Repetir precisa de um dia de início, então a
// ausência de data só vale para tarefa que não repete.
export function validateNewTask(rawDraft: NewTaskDraft, mode: NewTaskMode = 'create'): NewTaskValidation {
    const draft: NewTaskDraft = mode === 'edit' ? { ...rawDraft, repeat: 'none' } : rawDraft
    const title = draft.title.trim()
    const errors: NewTaskErrors = {}

    if (title === '') {
        errors.title = 'Informe o nome da tarefa.'
    }
    const date = validateDate(draft, errors)
    const weekdays = validateWeekdays(draft, errors)
    const intervalDays = validateInterval(draft, errors)

    if (Object.keys(errors).length > 0) {
        return { ok: false, errors }
    }

    return { ok: true, value: buildInsert(draft, title, date, weekdays, intervalDays) }
}

function validateDate(draft: NewTaskDraft, errors: NewTaskErrors): IsoDate | null {
    if (draft.date === null) {
        if (draft.repeat !== 'none') {
            errors.date = 'Para repetir, escolha o dia de início.'
        }
        return null
    }
    if (!isValidIsoDate(draft.date)) {
        errors.date = 'Informe uma data válida.'
        return null
    }

    return draft.date
}

function validateWeekdays(draft: NewTaskDraft, errors: NewTaskErrors): Weekday[] {
    const uniqueWeekdays = [...new Set(draft.weekdays)]
    if (draft.repeat === 'weekdays' && uniqueWeekdays.length === 0) {
        errors.weekdays = 'Marque pelo menos um dia da semana.'
    }

    return uniqueWeekdays
}

function validateInterval(draft: NewTaskDraft, errors: NewTaskErrors): number {
    if (draft.repeat !== 'interval') {
        return 0
    }
    const intervalText = draft.intervalText.trim()
    const intervalDays = INTEGER_PATTERN.test(intervalText) ? Number(intervalText) : Number.NaN
    if (!(intervalDays >= MIN_INTERVAL_DAYS && intervalDays <= MAX_INTERVAL_DAYS)) {
        errors.interval = `Use um número de ${MIN_INTERVAL_DAYS} a ${MAX_INTERVAL_DAYS} dias.`
    }

    return intervalDays
}

function buildInsert(
    draft: NewTaskDraft,
    title: string,
    date: IsoDate | null,
    weekdays: Weekday[],
    intervalDays: number,
): NewTaskInsert {
    const { isImportant, categoryId } = draft
    if (draft.repeat === 'none' || date === null) {
        return { kind: 'task', title, scheduledOn: date, isImportant, categoryId }
    }
    if (draft.repeat === 'weekdays') {
        return {
            kind: 'item',
            title,
            repeatKind: 'weekdays',
            weekdays,
            intervalDays: null,
            intervalAnchor: null,
            activeFrom: date,
            isImportant,
            categoryId,
        }
    }

    return {
        kind: 'item',
        title,
        repeatKind: 'interval',
        weekdays: null,
        intervalDays,
        intervalAnchor: date,
        activeFrom: date,
        isImportant,
        categoryId,
    }
}
