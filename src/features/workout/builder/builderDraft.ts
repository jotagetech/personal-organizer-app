// Rascunho do montador em localStorage: fechar o app (ou o iPhone descartar
// a aba) no meio da montagem não perde o que já foi digitado.

import { emptyRange } from '@/features/workout/builder/builderState'
import type { BuilderPlan } from '@/features/workout/builder/builderTypes'

const DRAFT_KEY = 'workout-plan-builder:rascunho'
const DRAFT_FORMAT_VERSION = 1

export type BuilderOrigin = 'novo' | 'edicao'

export type BuilderDraft = {
    formato: typeof DRAFT_FORMAT_VERSION
    origem: BuilderOrigin
    salvoEm: string
    plano: BuilderPlan
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function looksLikePlan(value: unknown): value is BuilderPlan {
    if (!isRecord(value) || typeof value.nome !== 'string' || !Array.isArray(value.treinos)) {
        return false
    }
    const hasWorkoutShape = value.treinos.every(
        (workout) => isRecord(workout) && typeof workout.uid === 'string' && Array.isArray(workout.exercicios),
    )

    return hasWorkoutShape && typeof value.usaProgressao === 'boolean' && isRecord(value.descricoesSemana)
}

// Rascunho gravado antes do descanso padrão não tem o campo; ele entra vazio
// para o rascunho continuar valendo. Série de rascunho antigo também não tem
// `descanso`, e a conversão trata ausente igual a nulo (sem descanso próprio).
function withDefaultRest(plan: BuilderPlan): BuilderPlan {
    const upgradedPlan = plan.descansoPadrao ? plan : { ...plan, descansoPadrao: emptyRange(true) }

    return upgradedPlan
}

// Exercício de rascunho antigo não tem `grupo` nem os campos de pegada;
// ausente vale como sem grupo e pegada não informada.
function withDefaultGroups(plan: BuilderPlan): BuilderPlan {
    const treinos = plan.treinos.map((workout) => ({
        ...workout,
        exercicios: workout.exercicios.map((exercise) => ({
            ...exercise,
            grupo: exercise.grupo ?? null,
            pegada: exercise.pegada ?? '',
            largura_pegada: exercise.largura_pegada ?? '',
            acessorio: exercise.acessorio ?? '',
        })),
    }))

    return { ...plan, treinos }
}

// Rascunho de outro formato (versão antiga do app) ou corrompido é
// descartado: montar a tela com um estado de forma desconhecida quebraria.
export function parseBuilderDraft(rawText: string | null): BuilderDraft | null {
    if (rawText === null) {
        return null
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(rawText)
    } catch {
        return null
    }

    const isValidDraft =
        isRecord(parsed) &&
        parsed.formato === DRAFT_FORMAT_VERSION &&
        (parsed.origem === 'novo' || parsed.origem === 'edicao') &&
        typeof parsed.salvoEm === 'string' &&
        looksLikePlan(parsed.plano)
    if (!isValidDraft) {
        return null
    }
    const storedDraft = parsed as BuilderDraft
    const draft = { ...storedDraft, plano: withDefaultGroups(withDefaultRest(storedDraft.plano)) }

    return draft
}

export function serializeBuilderDraft(plan: BuilderPlan, origin: BuilderOrigin, savedAt: Date): string {
    const draft: BuilderDraft = {
        formato: DRAFT_FORMAT_VERSION,
        origem: origin,
        salvoEm: savedAt.toISOString(),
        plano: plan,
    }
    const serialized = JSON.stringify(draft)

    return serialized
}

export function loadBuilderDraft(): BuilderDraft | null {
    try {
        const draft = parseBuilderDraft(window.localStorage.getItem(DRAFT_KEY))
        return draft
    } catch {
        return null
    }
}

export function saveBuilderDraft(plan: BuilderPlan, origin: BuilderOrigin): void {
    try {
        window.localStorage.setItem(DRAFT_KEY, serializeBuilderDraft(plan, origin, new Date()))
    } catch {
        // armazenamento indisponível ou cheio: o montador segue só em memória
    }
}

export function clearBuilderDraft(): void {
    try {
        window.localStorage.removeItem(DRAFT_KEY)
    } catch {
        // sem acesso ao armazenamento não há rascunho para apagar
    }
}
