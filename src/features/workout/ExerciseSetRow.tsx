import { useEffect, useRef, useState } from 'react'

import { useOutbox } from '@/contexts/OutboxContext'
import { buildOverlaySetRow, type UpsertSetOperation } from '@/lib/outbox/outboxQueue'
import type { WorkoutSetRow, WorkoutSnapshot } from '@/features/workout/types'

const SAVE_DEBOUNCE_MS = 600

type SetFieldState = {
    loadKgText: string
    repsText: string
    rirText: string
    noteText: string
    completedAt: string | null
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
    onConfirmed: () => void
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

    function saveToOutbox(nextFields: SetFieldState) {
        const parsedValues = parseFieldsForSave(nextFields)
        const values = { ...parsedValues, completedAt: nextFields.completedAt }

        enqueueUpsertSet({ sessionDate, planId, snapshot, exerciseKey, setIndex, values })
        setHasEverSaved(true)

        // Sincronizar com o servidor pode levar tempo (ou nunca terminar antes
        // de o usuário navegar de volta pra essa série): o valor confirmado
        // localmente precisa ficar visível de qualquer forma, não só enquanto
        // a operação segue pendente na fila de envio.
        onLocalSave(
            buildOverlaySetRow(
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
            ),
        )
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
        }

        updateFields(confirmedFields)
        saveToOutbox(confirmedFields)
        onConfirmed()
    }

    const pendingOperation = getOperationsForDate(sessionDate).find(
        (operation): operation is UpsertSetOperation =>
            operation.kind === 'upsert_set' &&
            operation.exerciseKey === exerciseKey &&
            operation.setIndex === setIndex,
    )

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#52525b' }}>
                <span>Série {setIndex}</span>
                <span>
                    Meta: {formatRepRange(repeticoesMin, repeticoesMax)}
                    {cargaSugerida !== null ? ` · Sugestão: ${cargaSugerida} kg` : ''}
                </span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
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
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
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
                <div className="field" style={{ width: 64, flexShrink: 0, marginBottom: 0 }}>
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
            {isNoteOpen ? (
                <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
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
                    className="secondary-button"
                    style={{ marginTop: 8 }}
                    onClick={() => setIsNoteOpen(true)}
                >
                    💬 Comentário
                </button>
            )}
            <button
                type="button"
                className="primary-button"
                style={{ width: '100%', marginTop: 10 }}
                disabled={!canConfirm}
                onClick={handleConfirmClick}
            >
                {confirmLabel}
            </button>
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
