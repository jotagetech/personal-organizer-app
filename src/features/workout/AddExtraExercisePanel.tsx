import { Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { listPastSessionsWithExtras } from '@/features/workout/api'
import { BuilderRangeField, segmentClassName } from '@/features/workout/builder/BuilderRangeField'
import { emptyRange, SET_METRIC_OPTIONS } from '@/features/workout/builder/builderState'
import type { BuilderRange } from '@/features/workout/builder/builderTypes'
import {
    buildNewExtraExercise,
    collectExtraSuggestions,
    filterExtraSuggestions,
    findExactSuggestion,
    generateExtraExerciseKey,
    knownExerciseKeys,
    MAX_EXTRA_SETS,
    parseExtraExerciseForm,
    type ExtraSuggestion,
    type PastSessionSnapshot,
} from '@/features/workout/extraExercises'
import type { PlanWeek } from '@/features/workout/planWeek'
import { planDefaultRest } from '@/features/workout/restPrescription'
import { formatRestPrescription, formatSetTargetText } from '@/features/workout/setPresentation'
import type { WorkoutSnapshot, WorkoutSnapshotExercise } from '@/features/workout/types'
import type { SetMetric, WorkoutPlan } from '@/lib/workoutPlanSchema'

const BUTTON_ICON_SIZE = 18
const DEFAULT_SERIES_TEXT = '3'

type PastExtrasState = { status: 'loading' } | { status: 'ready'; sessions: PastSessionSnapshot[] } | { status: 'offline' }

type AddExtraExercisePanelProps = {
    plan: WorkoutPlan
    planWeek: PlanWeek | null
    sessionDate: string
    todaySnapshot: WorkoutSnapshot
    onAdd: (exercise: WorkoutSnapshotExercise) => void
    onCancel: () => void
}

// Os extras de sessões anteriores vêm do servidor; sem sinal, as sugestões
// ficam só com os exercícios do plano e o resto funciona igual.
function usePastExtraSessions(sessionDate: string): PastExtrasState {
    const [state, setState] = useState<PastExtrasState>({ status: 'loading' })

    useEffect(() => {
        let isCancelled = false
        listPastSessionsWithExtras(sessionDate)
            .then((sessions) => {
                if (!isCancelled) {
                    setState({ status: 'ready', sessions })
                }
            })
            .catch(() => {
                if (!isCancelled) {
                    setState({ status: 'offline' })
                }
            })

        return () => {
            isCancelled = true
        }
    }, [sessionDate])

    return state
}

export function AddExtraExercisePanel({
    plan,
    planWeek,
    sessionDate,
    todaySnapshot,
    onAdd,
    onCancel,
}: AddExtraExercisePanelProps) {
    const pastExtras = usePastExtraSessions(sessionDate)
    const [nome, setNome] = useState('')
    const [metrica, setMetrica] = useState<SetMetric>('repeticoes')
    const [series, setSeries] = useState(DEFAULT_SERIES_TEXT)
    const [alvo, setAlvo] = useState<BuilderRange>(emptyRange(false))
    const [descanso, setDescanso] = useState<BuilderRange>(emptyRange(true))
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    const sources = useMemo(
        () => ({
            plan,
            planWeek,
            pastSessions: pastExtras.status === 'ready' ? pastExtras.sessions : [],
            todaySnapshot,
        }),
        [plan, planWeek, pastExtras, todaySnapshot],
    )
    const suggestions = useMemo(() => collectExtraSuggestions(sources), [sources])
    const matchingSuggestions = filterExtraSuggestions(suggestions, nome)
    const exactSuggestion = findExactSuggestion(suggestions, nome)
    const canCreate = nome.trim() !== '' && exactSuggestion === null
    const defaultRest = planDefaultRest(plan)
    const metricOption = SET_METRIC_OPTIONS.find((option) => option.value === metrica) ?? SET_METRIC_OPTIONS[0]

    function handleCreate() {
        const result = parseExtraExerciseForm({ nome, metrica, series, alvo, descanso })
        if (!result.success) {
            setErrorMessage(result.message)
            return
        }
        const exerciseKey = generateExtraExerciseKey(result.value.nome, knownExerciseKeys(sources))
        onAdd(buildNewExtraExercise(exerciseKey, result.value, defaultRest))
    }

    return (
        <div className="extra-exercise">
            <div className="field">
                <label htmlFor="extra-exercise-nome">Nome do exercício</label>
                <input
                    id="extra-exercise-nome"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="sentences"
                    enterKeyHint="search"
                    placeholder="Ex.: Elevação lateral"
                    value={nome}
                    onChange={(event) => {
                        setNome(event.target.value)
                        setErrorMessage(null)
                    }}
                />
                {pastExtras.status === 'offline' && (
                    <span className="builder-hint">Sem conexão: sugestões só do plano ativo.</span>
                )}
            </div>
            {matchingSuggestions.length > 0 && (
                <div className="extra-exercise__suggestions" role="list" aria-label="Sugestões">
                    {matchingSuggestions.map((suggestion) => (
                        <button
                            key={suggestion.exercise.exercise_key}
                            type="button"
                            role="listitem"
                            className="extra-exercise__suggestion"
                            onClick={() => onAdd(suggestion.exercise)}
                        >
                            <span className="extra-exercise__suggestion-name">{suggestion.exercise.nome}</span>
                            <span className="extra-exercise__suggestion-meta">{describeSuggestion(suggestion)}</span>
                        </button>
                    ))}
                </div>
            )}
            {canCreate && (
                <div className="extra-exercise__create">
                    <p className="builder-subtitle">Criar “{nome.trim()}”</p>
                    <div className="builder-segmented builder-segmented--full" role="group" aria-label="Medida da série">
                        {SET_METRIC_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                className={segmentClassName(option.value === metrica)}
                                aria-pressed={option.value === metrica}
                                onClick={() => setMetrica(option.value)}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <div className="field">
                        <label htmlFor="extra-exercise-series">Séries</label>
                        <input
                            id="extra-exercise-series"
                            type="text"
                            inputMode="numeric"
                            placeholder={`1 a ${MAX_EXTRA_SETS}`}
                            value={series}
                            onChange={(event) => setSeries(event.target.value)}
                        />
                    </div>
                    <BuilderRangeField
                        id="extra-exercise-alvo"
                        label={`Alvo (${metricOption.label.toLowerCase()})`}
                        unit={metricOption.unidade}
                        range={alvo}
                        onChange={setAlvo}
                        inputMode={metrica === 'distancia' ? 'decimal' : 'numeric'}
                    />
                    <BuilderRangeField
                        id="extra-exercise-descanso"
                        label="Descanso"
                        unit="s, opcional"
                        range={descanso}
                        onChange={setDescanso}
                        hint={restHint(defaultRest)}
                    />
                    {errorMessage && <p className="save-status save-status--error">{errorMessage}</p>}
                    <button type="button" className="primary-button full-width" onClick={handleCreate}>
                        <Plus size={BUTTON_ICON_SIZE} aria-hidden="true" />
                        Adicionar ao treino
                    </button>
                </div>
            )}
            <button type="button" className="ghost-button full-width" onClick={onCancel}>
                Cancelar
            </button>
        </div>
    )
}

function restHint(defaultRest: { min: number; max: number } | null): string {
    const defaultText = defaultRest ? formatRestPrescription(defaultRest.min, defaultRest.max) : null
    const hint = defaultText ? `Vazio usa o padrão do plano: ${defaultText.toLowerCase()}.` : 'Vazio fica sem descanso.'

    return hint
}

function formatShortDate(isoDate: string): string {
    const [, month, day] = isoDate.split('-')

    return `${day}/${month}`
}

function describeSuggestion(suggestion: ExtraSuggestion): string {
    const { exercise, source } = suggestion
    const [firstSet] = exercise.series
    const prescription =
        exercise.tipo === 'intervalado'
            ? `Intervalado · ${exercise.series.length} rodadas`
            : `${exercise.series.length} ${exercise.series.length === 1 ? 'série' : 'séries'}${
                  firstSet
                      ? ` · ${formatSetTargetText(firstSet.metrica, firstSet.alvo_min, firstSet.alvo_max, exercise.por_lado)}`
                      : ''
              }`
    const origin = source.kind === 'plano' ? `No plano: ${source.workoutName}` : `Extra em ${formatShortDate(source.sessionDate)}`

    return `${prescription} · ${origin}`
}
