import { useEffect, useRef, useState } from 'react'

import { upsertSet } from '@/features/workout/api'
import type { WorkoutSetRow } from '@/features/workout/types'

const SAVE_DEBOUNCE_MS = 600

type SetFieldState = {
    loadKgText: string
    repsText: string
    rirText: string
    noteText: string
    completedAt: string | null
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

type ExerciseSetRowProps = {
    sessionId: string | null
    exerciseKey: string
    setIndex: number
    repeticoesMin: number
    repeticoesMax: number
    cargaSugerida: number | null
    existingSet: WorkoutSetRow | undefined
    confirmLabel: string
    onSessionNeeded: () => Promise<string>
    onSaved: (set: WorkoutSetRow) => void
    onConfirmed: () => void
}

export function ExerciseSetRow({
    sessionId,
    exerciseKey,
    setIndex,
    repeticoesMin,
    repeticoesMax,
    cargaSugerida,
    existingSet,
    confirmLabel,
    onSessionNeeded,
    onSaved,
    onConfirmed,
}: ExerciseSetRowProps) {
    const [fields, setFields] = useState<SetFieldState>(() => toFieldState(existingSet))
    const [isNoteOpen, setIsNoteOpen] = useState(() => Boolean(existingSet?.note))
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const latestRequestIdRef = useRef(0)

    useEffect(() => {
        setFields(toFieldState(existingSet))
        setIsNoteOpen(Boolean(existingSet?.note))
    }, [existingSet])

    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current)
            }
        }
    }, [])

    function clearPendingAutosave() {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
            debounceTimerRef.current = null
        }
    }

    async function autosave(nextFields: SetFieldState) {
        const requestId = ++latestRequestIdRef.current
        setSaveStatus('saving')

        try {
            const activeSessionId = sessionId ?? (await onSessionNeeded())
            const parsedValues = parseFieldsForSave(nextFields)
            const savedSet = await upsertSet({
                sessionId: activeSessionId,
                exerciseKey,
                setIndex,
                loadKg: parsedValues.loadKg,
                reps: parsedValues.reps,
                rir: parsedValues.rir,
                note: parsedValues.note,
                completedAt: nextFields.completedAt,
            })

            if (requestId !== latestRequestIdRef.current) {
                return
            }
            setSaveStatus('saved')
            onSaved(savedSet)
        } catch {
            if (requestId !== latestRequestIdRef.current) {
                return
            }
            setSaveStatus('error')
        }
    }

    function scheduleAutosave(nextFields: SetFieldState) {
        clearPendingAutosave()
        debounceTimerRef.current = setTimeout(() => {
            void autosave(nextFields)
        }, SAVE_DEBOUNCE_MS)
    }

    function handleLoadChange(rawValue: string) {
        const nextFields = { ...fields, loadKgText: rawValue }
        setFields(nextFields)
        scheduleAutosave(nextFields)
    }

    function handleRepsChange(rawValue: string) {
        const nextFields = { ...fields, repsText: rawValue }
        setFields(nextFields)
        scheduleAutosave(nextFields)
    }

    function handleRirChange(rawValue: string) {
        const nextFields = { ...fields, rirText: rawValue }
        setFields(nextFields)
        scheduleAutosave(nextFields)
    }

    function handleNoteChange(rawValue: string) {
        const nextFields = { ...fields, noteText: rawValue }
        setFields(nextFields)
        scheduleAutosave(nextFields)
    }

    function handleFieldBlur() {
        clearPendingAutosave()
        void autosave(fields)
    }

    const canConfirm = isValidNonNegativeNumber(fields.loadKgText) && isValidNonNegativeInteger(fields.repsText)

    async function handleConfirmClick() {
        if (!canConfirm) {
            return
        }

        clearPendingAutosave()
        const requestId = ++latestRequestIdRef.current
        setSaveStatus('saving')

        const confirmedFields: SetFieldState = {
            ...fields,
            completedAt: fields.completedAt ?? new Date().toISOString(),
        }

        try {
            const activeSessionId = sessionId ?? (await onSessionNeeded())
            const parsedValues = parseFieldsForSave(confirmedFields)
            const savedSet = await upsertSet({
                sessionId: activeSessionId,
                exerciseKey,
                setIndex,
                loadKg: parsedValues.loadKg,
                reps: parsedValues.reps,
                rir: parsedValues.rir,
                note: parsedValues.note,
                completedAt: confirmedFields.completedAt,
            })

            if (requestId !== latestRequestIdRef.current) {
                return
            }
            setFields(confirmedFields)
            setSaveStatus('saved')
            onSaved(savedSet)
            onConfirmed()
        } catch {
            if (requestId !== latestRequestIdRef.current) {
                return
            }
            setSaveStatus('error')
        }
    }

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
            <SaveStatusLabel status={saveStatus} />
        </div>
    )
}

function SaveStatusLabel({ status }: { status: SaveStatus }) {
    if (status === 'idle') {
        return null
    }

    if (status === 'saving') {
        return <p className="save-status">Salvando...</p>
    }

    if (status === 'error') {
        return <p className="save-status save-status--error">Falha ao salvar. Toque em confirmar para tentar de novo.</p>
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
