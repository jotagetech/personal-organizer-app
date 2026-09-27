import { useState } from 'react'

import { createActivityType } from '@/features/cardio/api'
import { FeelingScaleInput } from '@/features/cardio/FeelingScaleInput'
import type { CardioActivityTypeRow } from '@/features/cardio/types'

const NEW_TYPE_OPTION_VALUE = '__novo_tipo__'

export type CardioEntrySubmitValues = {
    activityTypeId: string
    durationMinutes: number
    distanceKm: number | null
    feelingScale: number
    feelingNote: string | null
    note: string | null
}

type CardioEntryFormProps = {
    activityTypes: CardioActivityTypeRow[]
    onActivityTypeCreated: (activityType: CardioActivityTypeRow) => void
    onSubmit: (values: CardioEntrySubmitValues) => Promise<void>
    onCancel: () => void
}

export function CardioEntryForm({
    activityTypes,
    onActivityTypeCreated,
    onSubmit,
    onCancel,
}: CardioEntryFormProps) {
    const [selectedTypeId, setSelectedTypeId] = useState(activityTypes[0]?.id ?? NEW_TYPE_OPTION_VALUE)
    const [newTypeName, setNewTypeName] = useState('')
    const [durationText, setDurationText] = useState('')
    const [distanceText, setDistanceText] = useState('')
    const [feelingScale, setFeelingScale] = useState<number | null>(null)
    const [feelingNote, setFeelingNote] = useState('')
    const [note, setNote] = useState('')
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault()

        const durationMinutes = Number(durationText.trim().replace(',', '.'))
        const normalizedDistanceText = distanceText.trim().replace(',', '.')
        const distanceKm = normalizedDistanceText === '' ? null : Number(normalizedDistanceText)

        if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
            setErrorMessage('Informe a duração em minutos.')
            return
        }
        if (distanceKm !== null && (!Number.isFinite(distanceKm) || distanceKm <= 0)) {
            setErrorMessage('Distância precisa ser maior que zero.')
            return
        }
        if (feelingScale === null) {
            setErrorMessage('Escolha como você se sentiu.')
            return
        }

        setErrorMessage(null)
        setIsSubmitting(true)

        try {
            const activityTypeId = await resolveActivityTypeId()
            await onSubmit({
                activityTypeId,
                durationMinutes,
                distanceKm,
                feelingScale,
                feelingNote: feelingNote.trim() === '' ? null : feelingNote.trim(),
                note: note.trim() === '' ? null : note.trim(),
            })
        } catch (submitError) {
            const message = submitError instanceof Error ? submitError.message : 'Falha ao salvar'
            setErrorMessage(message)
        } finally {
            setIsSubmitting(false)
        }
    }

    async function resolveActivityTypeId(): Promise<string> {
        if (selectedTypeId !== NEW_TYPE_OPTION_VALUE) {
            return selectedTypeId
        }

        const trimmedName = newTypeName.trim()
        if (trimmedName === '') {
            throw new Error('Informe o nome do novo tipo de atividade.')
        }

        const createdType = await createActivityType(trimmedName)
        onActivityTypeCreated(createdType)
        setSelectedTypeId(createdType.id)
        return createdType.id
    }

    return (
        <form onSubmit={handleSubmit}>
            {errorMessage && <div className="error-list">{errorMessage}</div>}
            <div className="field">
                <label htmlFor="cardio-type">Atividade</label>
                <select
                    id="cardio-type"
                    value={selectedTypeId}
                    onChange={(event) => setSelectedTypeId(event.target.value)}
                >
                    {activityTypes.map((activityType) => (
                        <option key={activityType.id} value={activityType.id}>
                            {activityType.name}
                        </option>
                    ))}
                    <option value={NEW_TYPE_OPTION_VALUE}>+ Novo tipo...</option>
                </select>
            </div>
            {selectedTypeId === NEW_TYPE_OPTION_VALUE && (
                <div className="field">
                    <label htmlFor="cardio-new-type">Nome do novo tipo</label>
                    <input
                        id="cardio-new-type"
                        type="text"
                        value={newTypeName}
                        onChange={(event) => setNewTypeName(event.target.value)}
                        placeholder="ex: Esteira"
                    />
                </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
                <div className="field" style={{ flex: 1 }}>
                    <label htmlFor="cardio-duration">Duração (min)</label>
                    <input
                        id="cardio-duration"
                        type="text"
                        inputMode="numeric"
                        value={durationText}
                        onChange={(event) => setDurationText(event.target.value)}
                        placeholder="ex: 30"
                    />
                </div>
                <div className="field" style={{ flex: 1 }}>
                    <label htmlFor="cardio-distance">Distância (km)</label>
                    <input
                        id="cardio-distance"
                        type="text"
                        inputMode="decimal"
                        value={distanceText}
                        onChange={(event) => setDistanceText(event.target.value)}
                        placeholder="opcional"
                    />
                </div>
            </div>
            <div className="field">
                <label>Como você se sentiu?</label>
                <FeelingScaleInput value={feelingScale} onChange={setFeelingScale} />
            </div>
            <div className="field">
                <label htmlFor="cardio-feeling-note">Detalhar o sentimento (opcional)</label>
                <input
                    id="cardio-feeling-note"
                    type="text"
                    value={feelingNote}
                    onChange={(event) => setFeelingNote(event.target.value)}
                />
            </div>
            <div className="field">
                <label htmlFor="cardio-note">Observação (opcional)</label>
                <input
                    id="cardio-note"
                    type="text"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="primary-button" disabled={isSubmitting}>
                    {isSubmitting ? 'Salvando...' : 'Salvar cardio'}
                </button>
                <button type="button" className="secondary-button" onClick={onCancel}>
                    Cancelar
                </button>
            </div>
        </form>
    )
}
