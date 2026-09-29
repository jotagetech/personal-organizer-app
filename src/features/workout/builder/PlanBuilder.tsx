import { AlertCircle, ArrowLeft, Download, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useSuspendedTrainingMode } from '@/features/shared/useTrainingMode'
import { importWorkoutPlanFromText } from '@/features/workout/api'
import { BuilderRangeField } from '@/features/workout/builder/BuilderRangeField'
import { BuilderWorkoutSection } from '@/features/workout/builder/BuilderWorkoutSection'
import { builderPlanFromWorkoutPlan } from '@/features/workout/builder/builderDocument'
import {
    clearBuilderDraft,
    loadBuilderDraft,
    saveBuilderDraft,
    type BuilderOrigin,
} from '@/features/workout/builder/builderDraft'
import { slugify } from '@/features/workout/builder/builderIds'
import {
    createEmptyPlan,
    createWorkout,
    moveItem,
    parseBlockWeeks,
    removeAt,
    replaceAt,
} from '@/features/workout/builder/builderState'
import type { BuilderPlan } from '@/features/workout/builder/builderTypes'
import {
    builderFieldId,
    candidateFieldIds,
    validateBuilderPlan,
    type BuilderIssue,
} from '@/features/workout/builder/builderValidation'
import { MAX_BLOCK_WEEKS, type WorkoutPlan, type WorkoutPlanV2Document } from '@/lib/workoutPlanSchema'

const ACTION_ICON_SIZE = 18
const WEEK_DESCRIPTION_MAX_LENGTH = 120
const JSON_INDENT = 2
const DOWNLOAD_URL_LIFETIME_MS = 10_000
const FOCUSABLE_SELECTOR = 'input, select, textarea, button'

type PlanBuilderProps = {
    origin: BuilderOrigin
    activePlan: WorkoutPlan | null
    onClose: () => void
    onSaved: (message: string) => void
}

type BuilderSession = {
    plan: BuilderPlan
    origin: BuilderOrigin
    restoredAt: string | null
}

function freshPlan(origin: BuilderOrigin, activePlan: WorkoutPlan | null): BuilderPlan {
    const plan = origin === 'edicao' && activePlan ? builderPlanFromWorkoutPlan(activePlan) : createEmptyPlan()

    return plan
}

// Editando o plano ativo, tudo começa recolhido para caber na tela; um plano
// novo abre o primeiro treino para já começar a preencher.
function initialExpandedUids(plan: BuilderPlan, origin: BuilderOrigin): Set<string> {
    const firstWorkout = plan.treinos[0]
    const expandedUids = origin === 'novo' && firstWorkout ? new Set([firstWorkout.uid]) : new Set<string>()

    return expandedUids
}

function startSession(origin: BuilderOrigin, activePlan: WorkoutPlan | null): BuilderSession {
    const draft = loadBuilderDraft()
    if (draft) {
        return { plan: draft.plano, origin: draft.origem, restoredAt: draft.salvoEm }
    }

    return { plan: freshPlan(origin, activePlan), origin, restoredAt: null }
}

function formatDraftTime(isoDate: string): string {
    const formatted = new Date(isoDate).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })

    return formatted
}

function issueOwnerUids(issues: BuilderIssue[]): Set<string> {
    const uids = new Set<string>()
    issues.forEach((issue) => {
        ;[issue.workoutUid, issue.exerciseUid, issue.variationUid].forEach((uid) => {
            if (uid) {
                uids.add(uid)
            }
        })
    })

    return uids
}

function focusField(fieldPath: (string | number)[]): void {
    const target = candidateFieldIds(fieldPath)
        .map((fieldId) => document.getElementById(fieldId))
        .find((element): element is HTMLElement => element !== null)
    if (!target) {
        return
    }

    const focusable = target.matches(FOCUSABLE_SELECTOR) ? target : target.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    focusable?.focus({ preventScroll: true })
}

function downloadDocument(document: WorkoutPlanV2Document): void {
    const fileName = `plano-${slugify(document.nome) || 'treino'}.json`
    const blob = new Blob([JSON.stringify(document, null, JSON_INDENT)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = fileName
    window.document.body.appendChild(link)
    link.click()
    link.remove()
    // Revogar na hora cancela o download em alguns navegadores móveis.
    window.setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS)
}

export function PlanBuilder({ origin: requestedOrigin, activePlan, onClose, onSaved }: PlanBuilderProps) {
    useSuspendedTrainingMode()
    const [session, setSession] = useState<BuilderSession>(() => startSession(requestedOrigin, activePlan))
    const [expandedUids, setExpandedUids] = useState<Set<string>>(() =>
        initialExpandedUids(session.plan, session.origin),
    )
    const [issues, setIssues] = useState<BuilderIssue[]>([])
    const [statusMessage, setStatusMessage] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false)
    const hasChangesRef = useRef(session.restoredAt !== null)
    const issuesRef = useRef<HTMLDivElement>(null)

    const { plan } = session
    const blockWeeks = plan.usaProgressao ? parseBlockWeeks(plan.blocoSemanas) : null
    const ownerUids = issueOwnerUids(issues)

    // Só grava depois da primeira mudança: abrir e fechar a tela sem mexer
    // em nada não deixa um rascunho para trás.
    useEffect(() => {
        if (hasChangesRef.current) {
            saveBuilderDraft(session.plan, session.origin)
        }
    }, [session.plan, session.origin])

    function updatePlan(nextPlan: BuilderPlan) {
        hasChangesRef.current = true
        setSession((current) => ({ ...current, plan: nextPlan }))
        setStatusMessage(null)
        // Com a lista de problemas aberta, ela acompanha as correções.
        if (issues.length > 0) {
            const result = validateBuilderPlan(nextPlan)
            setIssues(result.success ? [] : result.issues)
        }
    }

    function isExpanded(uid: string): boolean {
        return expandedUids.has(uid)
    }

    function toggleExpanded(uid: string) {
        setExpandedUids((current) => {
            const next = new Set(current)
            if (next.has(uid)) {
                next.delete(uid)
            } else {
                next.add(uid)
            }
            return next
        })
    }

    function expand(uids: (string | null)[]) {
        setExpandedUids((current) => {
            const next = new Set(current)
            uids.forEach((uid) => uid && next.add(uid))
            return next
        })
    }

    function goToIssue(issue: BuilderIssue) {
        expand([issue.workoutUid, issue.exerciseUid, issue.variationUid])
        // O campo só existe depois que a seção recolhida abre e renderiza.
        window.requestAnimationFrame(() => focusField(issue.fieldPath))
    }

    function validateOrShowIssues(): WorkoutPlanV2Document | null {
        const result = validateBuilderPlan(plan)
        if (!result.success) {
            setIssues(result.issues)
            setStatusMessage(null)
            window.requestAnimationFrame(() => issuesRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
            return null
        }

        setIssues([])
        return result.document
    }

    async function handleSave() {
        const document = validateOrShowIssues()
        if (!document) {
            return
        }

        setIsSaving(true)
        const result = await importWorkoutPlanFromText(JSON.stringify(document))
        setIsSaving(false)
        if (!result.success) {
            const [firstError] = result.errors
            setStatusMessage(`Não foi possível salvar: ${firstError?.message ?? 'erro desconhecido'}`)
            return
        }

        clearBuilderDraft()
        const message = result.alreadyImported
            ? 'Nada mudou: esse já era o plano ativo.'
            : 'Plano salvo e ativado.'
        onSaved(message)
    }

    function handleDownload() {
        const document = validateOrShowIssues()
        if (document) {
            downloadDocument(document)
            setStatusMessage('Arquivo JSON gerado.')
        }
    }

    function handleDiscardDraft() {
        clearBuilderDraft()
        hasChangesRef.current = false
        const nextPlan = freshPlan(requestedOrigin, activePlan)
        setSession({ plan: nextPlan, origin: requestedOrigin, restoredAt: null })
        setExpandedUids(initialExpandedUids(nextPlan, requestedOrigin))
        setIssues([])
        setIsConfirmingDiscard(false)
        setStatusMessage('Rascunho descartado.')
    }

    function addWorkout() {
        const workout = createWorkout(plan.treinos.length)
        updatePlan({ ...plan, treinos: [...plan.treinos, workout] })
        expand([workout.uid])
    }

    const title = session.origin === 'edicao' ? 'Editar plano' : 'Criar plano'
    const planNameId = builderFieldId(['nome'])
    const blockWeeksId = builderFieldId(['bloco_semanas'])
    const progressionToggleId = builderFieldId(['usa_progressao'])

    return (
        <div className="plan-builder">
            <div className="page-header">
                <h2 className="page-title">{title}</h2>
                <button type="button" className="secondary-button" onClick={onClose}>
                    <ArrowLeft size={ACTION_ICON_SIZE} aria-hidden="true" />
                    Voltar
                </button>
            </div>

            {session.restoredAt && (
                <div className="builder-draft-notice">
                    Continuando o rascunho de {formatDraftTime(session.restoredAt)}
                    {session.origin === 'edicao' ? ' (edição do plano ativo).' : ' (plano novo).'}
                </div>
            )}

            <div className="card">
                <div className="field">
                    <label htmlFor={planNameId}>Nome do plano</label>
                    <input
                        id={planNameId}
                        type="text"
                        placeholder="ex: Hipertrofia setembro"
                        value={plan.nome}
                        onChange={(event) => updatePlan({ ...plan, nome: event.target.value })}
                    />
                </div>
                <BuilderRangeField
                    id={builderFieldId(['descanso_padrao'])}
                    label="Descanso padrão"
                    unit="s, opcional"
                    range={plan.descansoPadrao}
                    onChange={(descansoPadrao) => updatePlan({ ...plan, descansoPadrao })}
                    hint="Vale para os exercícios sem descanso próprio. Intervalado usa a recuperação dele."
                />
                <label className="builder-check" htmlFor={progressionToggleId}>
                    <input
                        id={progressionToggleId}
                        type="checkbox"
                        checked={plan.usaProgressao}
                        onChange={(event) => updatePlan({ ...plan, usaProgressao: event.target.checked })}
                    />
                    <span>
                        Usar progressão por semanas
                        <span className="builder-hint">
                            Bloco de semanas contado a partir do início do ciclo, com semanas diferentes por exercício.
                        </span>
                    </span>
                </label>
                {plan.usaProgressao && (
                    <div className="builder-progression" id={builderFieldId(['progressao'])}>
                        <div className="field">
                            <label htmlFor={blockWeeksId}>Semanas do bloco (1 a {MAX_BLOCK_WEEKS})</label>
                            <input
                                id={blockWeeksId}
                                type="text"
                                inputMode="numeric"
                                value={plan.blocoSemanas}
                                onChange={(event) => updatePlan({ ...plan, blocoSemanas: event.target.value })}
                            />
                        </div>
                        {blockWeeks !== null &&
                            Array.from({ length: blockWeeks }, (_, index) => index + 1).map((week) => {
                                const descriptionId = builderFieldId(['semanas', week])

                                return (
                                    <div className="field" key={week}>
                                        <label htmlFor={descriptionId}>Semana {week} (descrição opcional)</label>
                                        <input
                                            id={descriptionId}
                                            type="text"
                                            maxLength={WEEK_DESCRIPTION_MAX_LENGTH}
                                            placeholder={week === blockWeeks ? 'ex: Redução de volume' : 'ex: Mais carga'}
                                            value={plan.descricoesSemana[String(week)] ?? ''}
                                            onChange={(event) =>
                                                updatePlan({
                                                    ...plan,
                                                    descricoesSemana: {
                                                        ...plan.descricoesSemana,
                                                        [String(week)]: event.target.value,
                                                    },
                                                })
                                            }
                                        />
                                    </div>
                                )
                            })}
                    </div>
                )}
            </div>

            <div id={builderFieldId(['treinos'])}>
                {plan.treinos.map((workout, index) => (
                    <BuilderWorkoutSection
                        key={workout.uid}
                        position={index + 1}
                        workout={workout}
                        isFirst={index === 0}
                        isLast={index === plan.treinos.length - 1}
                        canRemove={plan.treinos.length > 1}
                        usaProgressao={plan.usaProgressao}
                        blockWeeks={blockWeeks}
                        issueOwnerUids={ownerUids}
                        isExpanded={isExpanded}
                        onToggleExpanded={toggleExpanded}
                        onExpand={(uid) => expand([uid])}
                        onChange={(nextWorkout) => updatePlan({ ...plan, treinos: replaceAt(plan.treinos, index, nextWorkout) })}
                        onMove={(offset) => updatePlan({ ...plan, treinos: moveItem(plan.treinos, index, offset) })}
                        onRemove={() => updatePlan({ ...plan, treinos: removeAt(plan.treinos, index) })}
                    />
                ))}
            </div>
            <button type="button" className="secondary-button full-width builder-add-workout" onClick={addWorkout}>
                <Plus size={ACTION_ICON_SIZE} aria-hidden="true" />
                Adicionar treino
            </button>

            <div className="card builder-finish" ref={issuesRef}>
                {issues.length > 0 && (
                    <div className="error-list builder-issues">
                        <strong>
                            {issues.length === 1 ? 'Falta acertar 1 ponto' : `Faltam acertar ${issues.length} pontos`}{' '}
                            antes de salvar:
                        </strong>
                        <ul className="builder-issues__list">
                            {issues.map((issue) => (
                                <li key={`${issue.fieldPath.join('.')}|${issue.mensagem}`}>
                                    <button type="button" className="builder-issues__item" onClick={() => goToIssue(issue)}>
                                        <AlertCircle size={ACTION_ICON_SIZE} aria-hidden="true" />
                                        <span>
                                            <span className="builder-issues__where">{issue.local}</span>
                                            <span className="builder-issues__message">{issue.mensagem}</span>
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {statusMessage && <p className="save-status">{statusMessage}</p>}
                <button type="button" className="primary-button full-width" disabled={isSaving} onClick={handleSave}>
                    <Save size={ACTION_ICON_SIZE} aria-hidden="true" />
                    {isSaving ? 'Salvando...' : 'Salvar e ativar plano'}
                </button>
                <button type="button" className="secondary-button full-width builder-finish__secondary" onClick={handleDownload}>
                    <Download size={ACTION_ICON_SIZE} aria-hidden="true" />
                    Baixar JSON
                </button>
                <p className="builder-hint builder-finish__hint">
                    O rascunho fica salvo neste aparelho enquanto você monta; dá para sair e voltar depois.
                </p>
                {isConfirmingDiscard ? (
                    <div className="builder-confirm">
                        <span>Descartar o rascunho e começar de novo?</span>
                        <div className="form-actions">
                            <button type="button" className="secondary-button" onClick={() => setIsConfirmingDiscard(false)}>
                                Cancelar
                            </button>
                            <button type="button" className="primary-button builder-danger-button" onClick={handleDiscardDraft}>
                                Descartar
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        className="ghost-button builder-danger full-width"
                        onClick={() => setIsConfirmingDiscard(true)}
                    >
                        <Trash2 size={ACTION_ICON_SIZE} aria-hidden="true" />
                        Descartar rascunho
                    </button>
                )}
            </div>
        </div>
    )
}
