import { Check, ChevronsRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useOutbox } from '@/contexts/OutboxContext'
import { LoadField, SaveStatusLabel } from '@/features/workout/ExerciseSetRow'
import { replaceDropAt } from '@/features/workout/setDrops'
import {
    canConfirmEntry,
    dropValuesToColumns,
    loadTextOf,
    parseMeasuredValues,
    resultTextOf,
    withBodyweightDefault,
} from '@/features/workout/setEntry'
import {
    formatDecimal,
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
import { setValuesFromRow, type OutboxDropValues, type UpsertSetOperation } from '@/lib/outbox/outboxQueue'

const SAVE_DEBOUNCE_MS = 600
const ACTION_ICON_SIZE = 16
const CONFIRM_ICON_SIZE = 22
const CONFIRM_ICON_STROKE = 3

type DropFieldState = { loadKgText: string; resultText: string }

type DropSetStepRowProps = {
    sessionDate: string
    planId: string
    snapshot: WorkoutSnapshot
    exercicio: WorkoutSnapshotExercise
    serie: WorkoutSnapshotExerciseSet
    dropPosition: number
    parentSet: WorkoutSetRow
    drops: OutboxDropValues[]
    confirmLabel: string
    onConfirmed: () => void
    onSkipRemainingDrops: () => void
    onLocalDropsSave: (drops: OutboxDropValues[]) => void
}

// Uma queda do drop set como passo próprio do assistente: só carga e
// resultado, em campos grandes, porque a queda é feita sem descanso e lançada
// com pressa. A queda não tem registro próprio na fila: ela viaja na escrita
// da série, que leva a lista inteira de quedas e o resto da série como está.
export function DropSetStepRow({
    sessionDate,
    planId,
    snapshot,
    exercicio,
    serie,
    dropPosition,
    parentSet,
    drops,
    confirmLabel,
    onConfirmed,
    onSkipRemainingDrops,
    onLocalDropsSave,
}: DropSetStepRowProps) {
    const { enqueueUpsertSet, getOperationsForDate } = useOutbox()
    const metric = serie.metrica
    const formaCarga = exercicio.forma_carga
    const plannedDrop = serie.quedas[dropPosition]
    const [fields, setFields] = useState<DropFieldState>(() => toDropFieldState(drops[dropPosition], metric))
    const fieldsRef = useRef(fields)
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    // O envio feito ao desmontar roda depois da última renderização, então lê
    // a série e as quedas mais recentes por ref em vez das capturadas.
    const latestPropsRef = useRef({ parentSet, drops })
    latestPropsRef.current = { parentSet, drops }

    function updateFields(nextFields: DropFieldState) {
        fieldsRef.current = nextFields
        setFields(nextFields)
    }

    useEffect(() => {
        return () => {
            if (!debounceTimerRef.current) {
                return
            }
            clearTimeout(debounceTimerRef.current)
            debounceTimerRef.current = null
            saveDrop(fieldsRef.current, false)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    function clearPendingAutosave() {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
            debounceTimerRef.current = null
        }
    }

    function saveDrop(nextFields: DropFieldState, isConfirmed: boolean) {
        const measuredValues = parseMeasuredValues(metric, nextFields.loadKgText, nextFields.resultText)
        const dropValues = isConfirmed ? withBodyweightDefault(measuredValues, formaCarga) : measuredValues
        const { parentSet: latestParentSet, drops: latestDrops } = latestPropsRef.current
        const nextDrops = replaceDropAt(latestDrops, dropPosition, dropValues)

        enqueueUpsertSet({
            sessionDate,
            planId,
            snapshot,
            exerciseKey: exercicio.exercise_key,
            setIndex: serie.set_index,
            values: { ...setValuesFromRow(latestParentSet), drops: nextDrops },
        })
        onLocalDropsSave(nextDrops)
    }

    function handleFieldChange(nextFields: DropFieldState) {
        updateFields(nextFields)
        clearPendingAutosave()
        debounceTimerRef.current = setTimeout(() => {
            debounceTimerRef.current = null
            saveDrop(nextFields, false)
        }, SAVE_DEBOUNCE_MS)
    }

    function handleFieldBlur() {
        if (!debounceTimerRef.current) {
            return
        }
        clearPendingAutosave()
        saveDrop(fieldsRef.current, false)
    }

    const canConfirm = canConfirmEntry(metric, formaCarga, fields.loadKgText, fields.resultText)

    function handleConfirmClick() {
        if (!canConfirm) {
            return
        }
        clearPendingAutosave()
        saveDrop(fieldsRef.current, true)
        onConfirmed()
    }

    function handleSkipRemainingClick() {
        const hasUnsavedTyping = debounceTimerRef.current !== null
        clearPendingAutosave()
        if (hasUnsavedTyping) {
            saveDrop(fieldsRef.current, false)
        }
        onSkipRemainingDrops()
    }

    const target = formatSetTarget(metric, plannedDrop.alvo_min, plannedDrop.alvo_max, exercicio.por_lado)
    const hasSavedDrop = drops[dropPosition] !== undefined
    const pendingOperation = getOperationsForDate(sessionDate).find(
        (operation): operation is UpsertSetOperation =>
            operation.kind === 'upsert_set' &&
            operation.exerciseKey === exercicio.exercise_key &&
            operation.setIndex === serie.set_index,
    )

    return (
        <div className="set-card__body">
            <div className="set-card__targets">
                <span>
                    Meta <strong className="set-card__target-value">{target.value}</strong> {target.unit}
                </span>
                {plannedDrop.carga_sugerida !== null && (
                    <span>
                        Sugestão{' '}
                        <strong className="set-card__target-value">{formatDecimal(plannedDrop.carga_sugerida)}</strong>{' '}
                        kg
                    </span>
                )}
                <span className="set-card__drop-note">Sem descanso</span>
            </div>
            <div className="set-fields">
                <LoadField
                    label={loadFieldLabel(formaCarga, exercicio.equipamento)}
                    hint={loadFieldHint(formaCarga, exercicio.por_lado, fields.loadKgText)}
                    placeholder={loadFieldPlaceholder(formaCarga, plannedDrop.carga_sugerida)}
                    value={fields.loadKgText}
                    onChange={(rawValue) => handleFieldChange({ ...fields, loadKgText: rawValue })}
                    onBlur={handleFieldBlur}
                />
                <div className="field set-fields__field set-fields__field--result-wide">
                    <label>{resultFieldLabel(metric)}</label>
                    <input
                        type="text"
                        inputMode={metric === 'distancia' ? 'decimal' : 'numeric'}
                        value={fields.resultText}
                        onChange={(event) => handleFieldChange({ ...fields, resultText: event.target.value })}
                        onBlur={handleFieldBlur}
                        placeholder={resultFieldPlaceholder(metric)}
                    />
                </div>
            </div>
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
                <button type="button" className="ghost-button" onClick={handleSkipRemainingClick}>
                    <ChevronsRight size={ACTION_ICON_SIZE} aria-hidden="true" />
                    {dropPosition === serie.quedas.length - 1 ? 'Pular esta queda' : 'Pular quedas restantes'}
                </button>
            </div>
            <SaveStatusLabel hasEverSaved={hasSavedDrop} pendingOperation={pendingOperation} />
        </div>
    )
}

function toDropFieldState(drop: OutboxDropValues | undefined, metric: WorkoutSnapshotExerciseSet['metrica']) {
    const columns = dropValuesToColumns(drop)
    const fieldState: DropFieldState = { loadKgText: loadTextOf(columns), resultText: resultTextOf(metric, columns) }

    return fieldState
}
