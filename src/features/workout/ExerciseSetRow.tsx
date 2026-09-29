import { Check, ChevronsRight, MessageSquare, SkipForward, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useOutbox } from '@/contexts/OutboxContext'
import { buildOverlaySetRow, type OutboxSetValues, type UpsertSetOperation } from '@/lib/outbox/outboxQueue'
import {
    canConfirmEntry,
    loadTextOf,
    parseMeasuredValues,
    resultTextOf,
    withBodyweightDefault,
} from '@/features/workout/setEntry'
import {
    formatDecimal,
    formatRestPrescription,
    formatRirTarget,
    formatSetTarget,
    loadFieldHint,
    loadFieldLabel,
    loadFieldPlaceholder,
    resultFieldLabel,
    resultFieldPlaceholder,
} from '@/features/workout/setPresentation'
import type {
    WorkoutSetRow,
    WorkoutSnapshot,
    WorkoutSnapshotExercise,
    WorkoutSnapshotExerciseSet,
} from '@/features/workout/types'
import type { SetMetric } from '@/lib/workoutPlanSchema'

const SAVE_DEBOUNCE_MS = 600
const ACTION_ICON_SIZE = 16
const CONFIRM_ICON_SIZE = 22
const CONFIRM_ICON_STROKE = 3

// O campo de resultado muda de sentido com a métrica da série: repetições,
// segundos ou metros.
type SetFieldState = {
    loadKgText: string
    resultText: string
    rirText: string
    noteText: string
    completedAt: string | null
    skippedAt: string | null
}

type ExerciseSetRowProps = {
    sessionDate: string
    planId: string
    snapshot: WorkoutSnapshot
    exercicio: WorkoutSnapshotExercise
    serie: WorkoutSnapshotExerciseSet
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
    exercicio,
    serie,
    existingSet,
    confirmLabel,
    onConfirmed,
    onSkipped,
    onSkipExercise,
    onLocalSave,
}: ExerciseSetRowProps) {
    const { enqueueUpsertSet, getOperationsForDate } = useOutbox()
    const exerciseKey = exercicio.exercise_key
    const setIndex = serie.set_index
    const metric = serie.metrica
    const formaCarga = exercicio.forma_carga
    const hasPlannedDrops = serie.quedas.length > 0
    const [fields, setFields] = useState<SetFieldState>(() => toFieldState(existingSet, metric))
    const [isNoteOpen, setIsNoteOpen] = useState(() => Boolean(existingSet?.note))
    const [hasEverSaved, setHasEverSaved] = useState(() => Boolean(existingSet))
    const fieldsRef = useRef(fields)
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    function updateFields(nextFields: SetFieldState) {
        fieldsRef.current = nextFields
        setFields(nextFields)
    }

    useEffect(() => {
        updateFields(toFieldState(existingSet, metric))
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

    // A métrica vai sempre explícita: sem ela o banco trata a série como
    // repetições e exige carga e repetições para aceitar a conclusão.
    function valuesFromFields(nextFields: SetFieldState): OutboxSetValues {
        const measuredValues = parseMeasuredValues(metric, nextFields.loadKgText, nextFields.resultText)
        const isConfirmed = nextFields.completedAt !== null
        const savedMeasures = isConfirmed ? withBodyweightDefault(measuredValues, formaCarga) : measuredValues

        return {
            ...savedMeasures,
            rir: parseOptionalInteger(nextFields.rirText),
            note: normalizeNote(nextFields.noteText),
            completedAt: nextFields.completedAt,
            skippedAt: nextFields.skippedAt,
            metric,
        }
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

    function saveToOutbox(nextFields: SetFieldState, extraValues: Partial<OutboxSetValues> = {}): WorkoutSetRow {
        const values = { ...valuesFromFields(nextFields), ...extraValues }

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

    function handleResultChange(rawValue: string) {
        const nextFields = { ...fields, resultText: rawValue }
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

    const canConfirm = canConfirmEntry(metric, formaCarga, fields.loadKgText, fields.resultText)

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
            resultText: '',
            rirText: '',
            noteText: fields.noteText,
            completedAt: null,
            skippedAt: new Date().toISOString(),
        }

        updateFields(skippedFields)
        // Série pulada não tem quedas; a lista vazia apaga as já lançadas.
        const skipExtraValues: Partial<OutboxSetValues> = hasPlannedDrops ? { drops: [] } : {}
        onSkipped(saveToOutbox(skippedFields, skipExtraValues))
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

    const target = formatSetTarget(metric, serie.alvo_min, serie.alvo_max, exercicio.por_lado)
    const restPrescription = formatRestPrescription(exercicio.descanso_segundos_min, exercicio.descanso_segundos_max)
    const rirTarget = formatRirTarget(exercicio.rir_alvo_min, exercicio.rir_alvo_max)
    const loadHint = loadFieldHint(formaCarga, exercicio.por_lado, fields.loadKgText)

    return (
        <div className="set-card__body">
            <div className="set-card__targets">
                <span>
                    Meta <strong className="set-card__target-value">{target.value}</strong> {target.unit}
                </span>
                {serie.carga_sugerida !== null && (
                    <span>
                        Sugestão{' '}
                        <strong className="set-card__target-value">{formatDecimal(serie.carga_sugerida)}</strong> kg
                    </span>
                )}
                {restPrescription && <span>{restPrescription}</span>}
                {hasPlannedDrops && (
                    <span className="set-card__drop-note">
                        Drop set: {serie.quedas.length} {serie.quedas.length === 1 ? 'queda' : 'quedas'} depois
                    </span>
                )}
            </div>
            {isSkipped ? (
                <p className="set-skipped-badge">Série pulada</p>
            ) : (
                <div className="set-fields">
                    <LoadField
                        label={loadFieldLabel(formaCarga, exercicio.equipamento)}
                        hint={loadHint}
                        placeholder={loadFieldPlaceholder(formaCarga, serie.carga_sugerida)}
                        value={fields.loadKgText}
                        onChange={handleLoadChange}
                        onBlur={handleFieldBlur}
                    />
                    <div className="field set-fields__field">
                        <label>{resultFieldLabel(metric)}</label>
                        <input
                            type="text"
                            inputMode={metric === 'distancia' ? 'decimal' : 'numeric'}
                            value={fields.resultText}
                            onChange={(event) => handleResultChange(event.target.value)}
                            onBlur={handleFieldBlur}
                            placeholder={resultFieldPlaceholder(metric)}
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
                        {rirTarget && <span className="set-fields__hint">{rirTarget}</span>}
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

type LoadFieldProps = {
    label: string
    hint: string | null
    placeholder: string
    value: string
    onChange: (rawValue: string) => void
    onBlur: () => void
}

// Ocupa a linha inteira: o rótulo diz o que o número significa (um halter,
// cada lado, total com a barra), e é essa leitura que evita o registro errado.
export function LoadField({ label, hint, placeholder, value, onChange, onBlur }: LoadFieldProps) {
    return (
        <div className="field set-fields__field set-fields__field--load">
            <label>{label} (kg)</label>
            <input
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onBlur={onBlur}
                placeholder={placeholder}
            />
            {hint && <span className="set-fields__hint">{hint}</span>}
        </div>
    )
}

export function SaveStatusLabel({
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

function toFieldState(existingSet: WorkoutSetRow | undefined, metric: SetMetric): SetFieldState {
    const fieldState: SetFieldState = {
        loadKgText: loadTextOf(existingSet),
        resultText: resultTextOf(metric, existingSet),
        rirText: existingSet?.rir != null ? String(existingSet.rir) : '',
        noteText: existingSet?.note ?? '',
        completedAt: existingSet?.completed_at ?? null,
        skippedAt: existingSet?.skipped_at ?? null,
    }

    return fieldState
}

function parseOptionalInteger(text: string): number | null {
    const normalizedText = text.trim()

    return normalizedText === '' ? null : Number(normalizedText)
}

function normalizeNote(text: string): string | null {
    const normalizedText = text.trim()

    return normalizedText === '' ? null : normalizedText
}
