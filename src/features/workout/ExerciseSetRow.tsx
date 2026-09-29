import { Check, ChevronsRight, MessageSquare, SkipForward, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useOutbox } from '@/contexts/OutboxContext'
import { buildOverlaySetRow, type OutboxSetValues, type UpsertSetOperation } from '@/lib/outbox/outboxQueue'
import type { WorkoutSetRow, WorkoutSnapshot } from '@/features/workout/types'

const SAVE_DEBOUNCE_MS = 600
const ACTION_ICON_SIZE = 16
const CONFIRM_ICON_SIZE = 22
const CONFIRM_ICON_STROKE = 3

type SetFieldState = {
    loadKgText: string
    repsText: string
    rirText: string
    noteText: string
    completedAt: string | null
    skippedAt: string | null
}

type ExerciseSetRowProps = {
    sessionDate: string
    planId: string
    snapshot: WorkoutSnapshot
    exerciseKey: string
    setIndex: number
    repeticoesMin: number
    repeticoesMax: number
    cargaSugerida: number | null
    existingSet: WorkoutSetRow | undefined
    confirmLabel: string
    onConfirmed: (row: WorkoutSetRow) => void
    onSkipped: (row: WorkoutSetRow) => void
    onSkipExercise: (row: WorkoutSetRow) => void
    onLocalSave: (row: WorkoutSetRow) => void
}

export function ExerciseSetRow({
    sessionDate,
    planId,
    snapshot,
    exerciseKey,
    setIndex,
    repeticoesMin,
    repeticoesMax,
    cargaSugerida,
    existingSet,
    confirmLabel,
    onConfirmed,
    onSkipped,
    onSkipExercise,
    onLocalSave,
}: ExerciseSetRowProps) {
    const { enqueueUpsertSet, getOperationsForDate } = useOutbox()
    const [fields, setFields] = useState<SetFieldState>(() => toFieldState(existingSet))
    const [isNoteOpen, setIsNoteOpen] = useState(() => Boolean(existingSet?.note))
    const [hasEverSaved, setHasEverSaved] = useState(() => Boolean(existingSet))
    const fieldsRef = useRef(fields)
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    function updateFields(nextFields: SetFieldState) {
        fieldsRef.current = nextFields
        setFields(nextFields)
    }

    useEffect(() => {
        updateFields(toFieldState(existingSet))
        setIsNoteOpen(Boolean(existingSet?.note))
        setHasEverSaved(Boolean(existingSet))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [existingSet])

    // Sair da série sem tirar o foco do campo (trocando de série ou de data)
    // não pode perder a última digitação: o autosave pendente é enviado pra
    // fila em vez de descartado.
    useEffect(() => {
        return () => {
            if (!debounceTimerRef.current) {
                return
            }
            clearTimeout(debounceTimerRef.current)
            debounceTimerRef.current = null
            saveToOutbox(fieldsRef.current)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    function clearPendingAutosave() {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
            debounceTimerRef.current = null
        }
    }

    function valuesFromFields(nextFields: SetFieldState): OutboxSetValues {
        const parsedValues = parseFieldsForSave(nextFields)

        return { ...parsedValues, completedAt: nextFields.completedAt, skippedAt: nextFields.skippedAt }
    }

    function buildLocalRow(values: OutboxSetValues): WorkoutSetRow {
        return buildOverlaySetRow(
            {
                kind: 'upsert_set',
                sessionDate,
                planId,
                snapshot,
                exerciseKey,
                setIndex,
                values,
                enqueuedAt: new Date().toISOString(),
                attempts: 0,
                status: 'pending',
            },
            existingSet,
        )
    }

    function saveToOutbox(nextFields: SetFieldState): WorkoutSetRow {
        const values = valuesFromFields(nextFields)

        enqueueUpsertSet({ sessionDate, planId, snapshot, exerciseKey, setIndex, values })
        setHasEverSaved(true)

        // Sincronizar com o servidor pode levar tempo (ou nunca terminar antes
        // de o usuário navegar de volta pra essa série): o valor confirmado
        // localmente precisa ficar visível de qualquer forma, não só enquanto
        // a operação segue pendente na fila de envio.
        const savedRow = buildLocalRow(values)
        onLocalSave(savedRow)

        return savedRow
    }

    function scheduleAutosave(nextFields: SetFieldState) {
        clearPendingAutosave()
        debounceTimerRef.current = setTimeout(() => {
            saveToOutbox(nextFields)
        }, SAVE_DEBOUNCE_MS)
    }

    function handleLoadChange(rawValue: string) {
        const nextFields = { ...fields, loadKgText: rawValue }
        updateFields(nextFields)
        scheduleAutosave(nextFields)
    }

    function handleRepsChange(rawValue: string) {
        const nextFields = { ...fields, repsText: rawValue }
        updateFields(nextFields)
        scheduleAutosave(nextFields)
    }

    function handleRirChange(rawValue: string) {
        const nextFields = { ...fields, rirText: rawValue }
        updateFields(nextFields)
        scheduleAutosave(nextFields)
    }

    function handleNoteChange(rawValue: string) {
        const nextFields = { ...fields, noteText: rawValue }
        updateFields(nextFields)
        scheduleAutosave(nextFields)
    }

    function handleFieldBlur() {
        clearPendingAutosave()
        saveToOutbox(fields)
    }

    const canConfirm = isValidNonNegativeNumber(fields.loadKgText) && isValidNonNegativeInteger(fields.repsText)

    function handleConfirmClick() {
        if (!canConfirm) {
            return
        }

        clearPendingAutosave()
        const confirmedFields: SetFieldState = {
            ...fields,
            completedAt: fields.completedAt ?? new Date().toISOString(),
            skippedAt: null,
        }

        updateFields(confirmedFields)
        onConfirmed(saveToOutbox(confirmedFields))
    }

    // Pular é gravado daqui de dentro, e não pelo pai, porque o autosave
    // pendente precisa ser cancelado antes: senão o envio feito ao desmontar a
    // série mandaria os campos antigos, sem o pulo, por cima dele.
    function handleSkipSetClick() {
        clearPendingAutosave()
        const skippedFields: SetFieldState = {
            loadKgText: '',
            repsText: '',
            rirText: '',
            noteText: fields.noteText,
            completedAt: null,
            skippedAt: new Date().toISOString(),
        }

        updateFields(skippedFields)
        onSkipped(saveToOutbox(skippedFields))
    }

    function handleUndoSkipClick() {
        clearPendingAutosave()
        const restoredFields: SetFieldState = { ...fields, skippedAt: null }

        updateFields(restoredFields)
        saveToOutbox(restoredFields)
    }

    // A digitação ainda não salva desta série (um comentário, por exemplo)
    // precisa chegar ao pai antes de ele montar o pulo das séries restantes;
    // sem nada pendente, a linha atual basta e nada novo vai pra fila.
    function handleSkipExerciseClick() {
        const hasUnsavedTyping = debounceTimerRef.current !== null
        clearPendingAutosave()
        const currentRow = hasUnsavedTyping
            ? saveToOutbox(fieldsRef.current)
            : (existingSet ?? buildLocalRow(valuesFromFields(fieldsRef.current)))
        onSkipExercise(currentRow)
    }

    const isSkipped = fields.skippedAt !== null

    const pendingOperation = getOperationsForDate(sessionDate).find(
        (operation): operation is UpsertSetOperation =>
            operation.kind === 'upsert_set' &&
            operation.exerciseKey === exerciseKey &&
            operation.setIndex === setIndex,
    )

    return (
        <div className="set-card__body">
            <div className="set-card__targets">
                <span>
                    Meta{' '}
                    <strong className="set-card__target-value">{formatRepRange(repeticoesMin, repeticoesMax)}</strong>{' '}
                    reps
                </span>
                {cargaSugerida !== null && (
                    <span>
                        Sugestão <strong className="set-card__target-value">{cargaSugerida}</strong> kg
                    </span>
                )}
            </div>
            {isSkipped ? (
                <p className="set-skipped-badge">Série pulada</p>
            ) : (
                <div className="set-fields">
                    <div className="field set-fields__field">
                        <label>Carga (kg)</label>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={fields.loadKgText}
                            onChange={(event) => handleLoadChange(event.target.value)}
                            onBlur={handleFieldBlur}
                            placeholder="ex: 60"
                        />
                    </div>
                    <div className="field set-fields__field">
                        <label>Realizadas</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={fields.repsText}
                            onChange={(event) => handleRepsChange(event.target.value)}
                            onBlur={handleFieldBlur}
                            placeholder="ex: 10"
                        />
                    </div>
                    <div className="field set-fields__field">
                        <label>RIR</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={fields.rirText}
                            onChange={(event) => handleRirChange(event.target.value)}
                            onBlur={handleFieldBlur}
                            placeholder="0-10"
                        />
                    </div>
                </div>
            )}
            {isNoteOpen ? (
                <div className="field set-card__note">
                    <label>Comentário (dor, desconforto, observação)</label>
                    <textarea
                        rows={2}
                        value={fields.noteText}
                        onChange={(event) => handleNoteChange(event.target.value)}
                        onBlur={handleFieldBlur}
                        placeholder="ex: senti o ombro puxar na última repetição"
                    />
                </div>
            ) : (
                <button
                    type="button"
                    className="ghost-button set-card__note-toggle"
                    onClick={() => setIsNoteOpen(true)}
                >
                    <MessageSquare size={ACTION_ICON_SIZE} aria-hidden="true" />
                    Comentário
                </button>
            )}
            {isSkipped ? (
                <button type="button" className="secondary-button set-card__undo-skip" onClick={handleUndoSkipClick}>
                    <Undo2 size={ACTION_ICON_SIZE} aria-hidden="true" />
                    Desfazer pulo
                </button>
            ) : (
                <>
                    <button
                        type="button"
                        className="primary-button set-card__confirm"
                        disabled={!canConfirm}
                        onClick={handleConfirmClick}
                    >
                        <Check size={CONFIRM_ICON_SIZE} strokeWidth={CONFIRM_ICON_STROKE} aria-hidden="true" />
                        {confirmLabel}
                    </button>
                    <div className="set-skip-actions">
                        <button type="button" className="ghost-button" onClick={handleSkipSetClick}>
                            <SkipForward size={ACTION_ICON_SIZE} aria-hidden="true" />
                            Pular série
                        </button>
                        <button type="button" className="ghost-button" onClick={handleSkipExerciseClick}>
                            <ChevronsRight size={ACTION_ICON_SIZE} aria-hidden="true" />
                            Pular exercício
                        </button>
                    </div>
                </>
            )}
            <SaveStatusLabel hasEverSaved={hasEverSaved} pendingOperation={pendingOperation} />
        </div>
    )
}

function SaveStatusLabel({
    hasEverSaved,
    pendingOperation,
}: {
    hasEverSaved: boolean
    pendingOperation: UpsertSetOperation | undefined
}) {
    if (!hasEverSaved) {
        return null
    }

    if (pendingOperation?.status === 'failed') {
        return (
            <p className="save-status save-status--error">
                Falha ao salvar. Corrija o valor ou descarte no selo de sincronização.
            </p>
        )
    }

    if (pendingOperation) {
        return <p className="save-status">Salvo no aparelho, enviando quando houver sinal</p>
    }

    return <p className="save-status">Salvo</p>
}

function toFieldState(existingSet: WorkoutSetRow | undefined): SetFieldState {
    const fieldState: SetFieldState = {
        loadKgText: existingSet?.load_kg != null ? String(existingSet.load_kg) : '',
        repsText: existingSet?.reps != null ? String(existingSet.reps) : '',
        rirText: existingSet?.rir != null ? String(existingSet.rir) : '',
        noteText: existingSet?.note ?? '',
        completedAt: existingSet?.completed_at ?? null,
        skippedAt: existingSet?.skipped_at ?? null,
    }

    return fieldState
}

function parseFieldsForSave(fields: SetFieldState): {
    loadKg: number | null
    reps: number | null
    rir: number | null
    note: string | null
} {
    const normalizedLoadText = fields.loadKgText.trim().replace(',', '.')
    const normalizedRepsText = fields.repsText.trim()
    const normalizedRirText = fields.rirText.trim()
    const normalizedNoteText = fields.noteText.trim()

    const loadKg = normalizedLoadText === '' ? null : Number(normalizedLoadText)
    const reps = normalizedRepsText === '' ? null : Number(normalizedRepsText)
    const rir = normalizedRirText === '' ? null : Number(normalizedRirText)
    const note = normalizedNoteText === '' ? null : normalizedNoteText

    return { loadKg, reps, rir, note }
}

function isValidNonNegativeNumber(text: string): boolean {
    const normalizedText = text.trim().replace(',', '.')
    if (normalizedText === '') {
        return false
    }
    const parsedValue = Number(normalizedText)

    return Number.isFinite(parsedValue) && parsedValue >= 0
}

function isValidNonNegativeInteger(text: string): boolean {
    const normalizedText = text.trim()
    if (normalizedText === '') {
        return false
    }
    const parsedValue = Number(normalizedText)

    return Number.isInteger(parsedValue) && parsedValue >= 0
}

function formatRepRange(min: number, max: number): string {
    if (min === max) {
        return `${min}`
    }
    const range = `${min} a ${max}`

    return range
}
