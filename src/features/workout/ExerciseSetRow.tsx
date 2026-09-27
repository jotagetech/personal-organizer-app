import { useEffect, useRef, useState } from 'react'

import { upsertSet } from '@/features/workout/api'
import type { WorkoutSetRow } from '@/features/workout/types'

const SAVE_DEBOUNCE_MS = 600

type SetFieldState = {
    loadKgText: string
    repsText: string
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
    onSessionNeeded: () => Promise<string>
    onSaved: (set: WorkoutSetRow) => void
}

export function ExerciseSetRow({
    sessionId,
    exerciseKey,
    setIndex,
    repeticoesMin,
    repeticoesMax,
    cargaSugerida,
    existingSet,
    onSessionNeeded,
    onSaved,
}: ExerciseSetRowProps) {
    const [fields, setFields] = useState<SetFieldState>(() => toFieldState(existingSet))
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const latestRequestIdRef = useRef(0)

    useEffect(() => {
        setFields(toFieldState(existingSet))
    }, [existingSet])

    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current)
            }
        }
    }, [])

    async function persist(nextFields: SetFieldState) {
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

    function scheduleSave(nextFields: SetFieldState) {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
        }
        debounceTimerRef.current = setTimeout(() => {
            void persist(nextFields)
        }, SAVE_DEBOUNCE_MS)
    }

    function saveNow(nextFields: SetFieldState) {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
        }
        void persist(nextFields)
    }

    function handleLoadChange(rawValue: string) {
        const nextFields = { ...fields, loadKgText: rawValue }
        setFields(nextFields)
        scheduleSave(nextFields)
    }

    function handleRepsChange(rawValue: string) {
        const nextFields = { ...fields, repsText: rawValue }
        setFields(nextFields)
        scheduleSave(nextFields)
    }

    function handleFieldBlur() {
        saveNow(fields)
    }

    function handleToggleCompleted() {
        const canComplete = isValidNonNegativeNumber(fields.loadKgText) && isValidNonNegativeInteger(fields.repsText)
        const isCurrentlyCompleted = fields.completedAt !== null

        if (!isCurrentlyCompleted && !canComplete) {
            return
        }

        const nextFields: SetFieldState = {
            ...fields,
            completedAt: isCurrentlyCompleted ? null : new Date().toISOString(),
        }
        setFields(nextFields)
        saveNow(nextFields)
    }

    const isCompleted = fields.completedAt !== null

    return (
        <div className="card" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#52525b' }}>
                <span>Série {setIndex}</span>
                <span>
                    Meta: {formatRepRange(repeticoesMin, repeticoesMax)}
                    {cargaSugerida !== null ? ` · Sugestão: ${cargaSugerida} kg` : ''}
                </span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'flex-end' }}>
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
                <button
                    type="button"
                    className={isCompleted ? 'primary-button' : 'secondary-button'}
                    onClick={handleToggleCompleted}
                    style={{ minWidth: 44 }}
                    aria-label="Marcar série como concluída"
                >
                    {isCompleted ? '✓' : '○'}
                </button>
            </div>
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
        return <p className="save-status save-status--error">Falha ao salvar. Tentando novamente ao editar.</p>
    }

    return <p className="save-status">Salvo</p>
}

function toFieldState(existingSet: WorkoutSetRow | undefined): SetFieldState {
    const fieldState: SetFieldState = {
        loadKgText: existingSet?.load_kg != null ? String(existingSet.load_kg) : '',
        repsText: existingSet?.reps != null ? String(existingSet.reps) : '',
        completedAt: existingSet?.completed_at ?? null,
    }

    return fieldState
}

function parseFieldsForSave(fields: SetFieldState): { loadKg: number | null; reps: number | null } {
    const normalizedLoadText = fields.loadKgText.trim().replace(',', '.')
    const normalizedRepsText = fields.repsText.trim()

    const loadKg = normalizedLoadText === '' ? null : Number(normalizedLoadText)
    const reps = normalizedRepsText === '' ? null : Number(normalizedRepsText)

    return { loadKg, reps }
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
