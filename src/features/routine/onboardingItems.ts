import type { RoutineLinkKind } from '@/features/routine/types'
import { WEEKDAYS, type Weekday, type WorkoutPlan } from '@/lib/workoutPlanSchema'

export const MAX_ONBOARDING_CHOICES = 3

const BUSINESS_DAYS: Weekday[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta']

export type OnboardingPresetId =
    | 'workout'
    | 'body_weight'
    | 'sleep'
    | 'creatine'
    | 'water'
    | 'stretch'
    | 'reading'
    | 'early_bedtime'

export type OnboardingPreset = {
    id: OnboardingPresetId
    title: string
    linkKind: RoutineLinkKind | null
}

export const LINKED_ONBOARDING_PRESETS: OnboardingPreset[] = [
    { id: 'workout', title: 'Academia', linkKind: 'workout_finished' },
    { id: 'body_weight', title: 'Registrar peso', linkKind: 'body_weight' },
    { id: 'sleep', title: 'Registrar sono', linkKind: 'sleep' },
]

export const COMMON_ONBOARDING_PRESETS: OnboardingPreset[] = [
    { id: 'creatine', title: 'Creatina', linkKind: null },
    { id: 'water', title: 'Beber 2 L de água', linkKind: null },
    { id: 'stretch', title: 'Alongar', linkKind: null },
    { id: 'reading', title: 'Ler 10 minutos', linkKind: null },
    { id: 'early_bedtime', title: 'Dormir antes da meia-noite', linkKind: null },
]

export type OnboardingChoice = { kind: 'preset'; presetId: OnboardingPresetId } | { kind: 'custom'; title: string }

export type OnboardingContext = {
    workoutWeekdays: Weekday[]
}

export type OnboardingItemRow = {
    title: string
    link_kind: RoutineLinkKind | null
    weekdays: Weekday[]
    sort_order: number
}

// Dias de treino do plano ativo, na ordem da semana. Plano sem dias
// declarados (ou sem plano) cai em segunda a sexta.
export function workoutWeekdaysFromPlan(plan: WorkoutPlan | null): Weekday[] {
    const declaredDays = new Set((plan?.treinos ?? []).flatMap((workout) => workout.dias_semana ?? []))
    const orderedDays = WEEKDAYS.filter((weekday) => declaredDays.has(weekday))
    const workoutWeekdays = orderedDays.length > 0 ? orderedDays : [...BUSINESS_DAYS]
    return workoutWeekdays
}

function presetWeekdays(preset: OnboardingPreset, context: OnboardingContext): Weekday[] {
    if (preset.id === 'workout') {
        return [...context.workoutWeekdays]
    }
    if (preset.id === 'body_weight') {
        return ['segunda']
    }
    return [...WEEKDAYS]
}

export function findOnboardingPreset(presetId: OnboardingPresetId): OnboardingPreset {
    const preset = [...LINKED_ONBOARDING_PRESETS, ...COMMON_ONBOARDING_PRESETS].find(
        (candidate) => candidate.id === presetId,
    )
    if (!preset) {
        throw new Error(`Item inicial desconhecido: ${presetId}`)
    }
    return preset
}

function buildRow(choice: OnboardingChoice, index: number, context: OnboardingContext): OnboardingItemRow {
    if (choice.kind === 'custom') {
        return { title: choice.title.trim(), link_kind: null, weekdays: [...WEEKDAYS], sort_order: index }
    }
    const preset = findOnboardingPreset(choice.presetId)
    return {
        title: preset.title,
        link_kind: preset.linkKind,
        weekdays: presetWeekdays(preset, context),
        sort_order: index,
    }
}

// Transforma as escolhas da primeira vez nas linhas de insert, na ordem
// escolhida. Recusa mais que o limite para a regra valer fora da tela também.
export function buildOnboardingItems(choices: OnboardingChoice[], context: OnboardingContext): OnboardingItemRow[] {
    if (choices.length > MAX_ONBOARDING_CHOICES) {
        throw new Error(`Escolha no máximo ${MAX_ONBOARDING_CHOICES} itens`)
    }
    const rows = choices.map((choice, index) => buildRow(choice, index, context))
    return rows
}

// Nome de saudação: parte do e-mail antes do @, com a primeira letra
// maiúscula. Sem e-mail utilizável devolve null.
export function greetingNameFromEmail(email: string | null | undefined): string | null {
    const localPart = (email ?? '').split('@')[0].trim()
    if (localPart === '') {
        return null
    }
    const greetingName = localPart.charAt(0).toUpperCase() + localPart.slice(1)
    return greetingName
}
