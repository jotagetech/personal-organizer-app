import { useState } from 'react'

import { useOutbox } from '@/contexts/OutboxContext'
import { correctWorkoutSet } from '@/features/results/api'
import type { WorkoutSetSummary } from '@/features/results/daySummary'
import {
    initialCorrectionFields,
    isCorrectionBlocked,
    UNSENT_OPERATIONS_MESSAGE,
    validateCorrection,
    type SetCorrectionFields,
    type SetCorrectionShape,
    type SetCorrectionValidation,
} from '@/features/results/setCorrection'
import type { WorkoutSetRow } from '@/features/workout/types'

const NETWORK_ERROR_MESSAGE = 'Falha ao salvar a correção. Confira a conexão e toque em Salvar de novo.'

type SetCorrectionStatus = 'closed' | 'editing' | 'saving'

type UseSetCorrectionInput = {
    set: WorkoutSetSummary
    shape: SetCorrectionShape
    sessionDate: string
    onCorrected: (row: WorkoutSetRow) => void
}

export type SetCorrectionState = {
    isOpen: boolean
    isSaving: boolean
    fields: SetCorrectionFields
    validation: SetCorrectionValidation
    // Aviso de fila pendente ou erro de rede; os campos continuam como estão.
    noticeMessage: string | null
    open: () => void
    cancel: () => void
    changeField: (fieldName: keyof SetCorrectionFields, value: string) => void
    save: () => Promise<void>
}

export function useSetCorrection({ set, shape, sessionDate, onCorrected }: UseSetCorrectionInput): SetCorrectionState {
    const { getOperationsForDate } = useOutbox()
    const [status, setStatus] = useState<SetCorrectionStatus>('closed')
    const [fields, setFields] = useState<SetCorrectionFields>(() => initialCorrectionFields(set))
    const [noticeMessage, setNoticeMessage] = useState<string | null>(null)

    function isBlocked(): boolean {
        return isCorrectionBlocked(getOperationsForDate(sessionDate), set.setId)
    }

    function open() {
        if (isBlocked()) {
            setNoticeMessage(UNSENT_OPERATIONS_MESSAGE)
            return
        }
        setFields(initialCorrectionFields(set))
        setNoticeMessage(null)
        setStatus('editing')
    }

    function cancel() {
        setNoticeMessage(null)
        setStatus('closed')
    }

    function changeField(fieldName: keyof SetCorrectionFields, value: string) {
        setFields((previous) => ({ ...previous, [fieldName]: value }))
    }

    const validation = validateCorrection(shape, fields)

    // A fila é conferida de novo na hora de salvar: uma escrita pode ter
    // entrado nela (outra aba, retomada) enquanto os campos estavam abertos.
    async function save() {
        if (!validation.isValid || set.setId === null) {
            return
        }
        if (isBlocked()) {
            setNoticeMessage(UNSENT_OPERATIONS_MESSAGE)
            return
        }

        setStatus('saving')
        setNoticeMessage(null)
        try {
            const correctedRow = await correctWorkoutSet(set.setId, validation.patch)
            setStatus('closed')
            onCorrected(correctedRow)
        } catch {
            setStatus('editing')
            setNoticeMessage(NETWORK_ERROR_MESSAGE)
        }
    }

    const correctionState: SetCorrectionState = {
        isOpen: status !== 'closed',
        isSaving: status === 'saving',
        fields,
        validation,
        noticeMessage,
        open,
        cancel,
        changeField,
        save,
    }

    return correctionState
}
