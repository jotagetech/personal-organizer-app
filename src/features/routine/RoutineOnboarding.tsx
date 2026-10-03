import { Check, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useAuth } from '@/contexts/AuthContext'
import { createOnboardingRoutineItems, markRoutineOnboarded } from '@/features/routine/api'
import {
    buildOnboardingItems,
    COMMON_ONBOARDING_PRESETS,
    greetingNameFromEmail,
    LINKED_ONBOARDING_PRESETS,
    MAX_ONBOARDING_CHOICES,
    workoutWeekdaysFromPlan,
    type OnboardingChoice,
    type OnboardingPreset,
    type OnboardingPresetId,
} from '@/features/routine/onboardingItems'
import { getActivePlan } from '@/features/workout/api'
import type { Weekday } from '@/lib/workoutPlanSchema'

const CHECK_ICON_SIZE = 16
const CHECK_ICON_STROKE = 3
const BUTTON_ICON_SIZE = 18
const SAVE_ERROR_MESSAGE = 'Não foi possível salvar agora. Suas escolhas continuam aqui, tente de novo.'

type RoutineOnboardingProps = {
    onFinished: () => Promise<void>
}

export function RoutineOnboarding({ onFinished }: RoutineOnboardingProps) {
    const { session } = useAuth()
    const [choices, setChoices] = useState<OnboardingChoice[]>([])
    const [customTitle, setCustomTitle] = useState('')
    const [workoutWeekdays, setWorkoutWeekdays] = useState<Weekday[]>(() => workoutWeekdaysFromPlan(null))
    const [areItemsSaved, setAreItemsSaved] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    useEffect(() => {
        let isCancelled = false
        getActivePlan()
            .then((activePlan) => {
                if (!isCancelled) {
                    setWorkoutWeekdays(workoutWeekdaysFromPlan(activePlan?.plan ?? null))
                }
            })
            .catch(() => {
                // Sem o plano, a Academia fica em segunda a sexta.
            })
        return () => {
            isCancelled = true
        }
    }, [])

    const greetingName = greetingNameFromEmail(session?.user.email)
    const isAtLimit = choices.length >= MAX_ONBOARDING_CHOICES
    const customChoices = choices.filter((choice) => choice.kind === 'custom')

    function isPresetChosen(presetId: OnboardingPresetId): boolean {
        return choices.some((choice) => choice.kind === 'preset' && choice.presetId === presetId)
    }

    function togglePreset(presetId: OnboardingPresetId) {
        setChoices((previous) =>
            previous.some((choice) => choice.kind === 'preset' && choice.presetId === presetId)
                ? previous.filter((choice) => !(choice.kind === 'preset' && choice.presetId === presetId))
                : [...previous, { kind: 'preset', presetId }],
        )
    }

    function removeCustom(title: string) {
        setChoices((previous) => previous.filter((choice) => !(choice.kind === 'custom' && choice.title === title)))
    }

    function handleAddCustom(event: React.FormEvent) {
        event.preventDefault()
        const title = customTitle.trim()
        const isDuplicate = customChoices.some((choice) => choice.title.toLowerCase() === title.toLowerCase())
        if (title === '' || isAtLimit || isDuplicate) {
            return
        }
        setChoices((previous) => [...previous, { kind: 'custom', title }])
        setCustomTitle('')
    }

    async function handleStart() {
        setErrorMessage(null)
        setIsSaving(true)
        try {
            if (!areItemsSaved) {
                await createOnboardingRoutineItems(buildOnboardingItems(choices, { workoutWeekdays }))
                setAreItemsSaved(true)
            }
            await markRoutineOnboarded()
            await onFinished()
        } catch {
            setErrorMessage(SAVE_ERROR_MESSAGE)
        } finally {
            setIsSaving(false)
        }
    }

    async function handleSkip() {
        setErrorMessage(null)
        setIsSaving(true)
        try {
            await markRoutineOnboarded()
            await onFinished()
        } catch {
            setErrorMessage(SAVE_ERROR_MESSAGE)
        } finally {
            setIsSaving(false)
        }
    }

    function renderPresetChip(preset: OnboardingPreset) {
        const isChosen = isPresetChosen(preset.id)
        return (
            <OnboardingChip
                key={preset.id}
                label={preset.title}
                isChosen={isChosen}
                isDisabled={isSaving || areItemsSaved || (isAtLimit && !isChosen)}
                onToggle={() => togglePreset(preset.id)}
            />
        )
    }

    return (
        <div className="routine-onboarding">
            <div className="card">
                <p className="routine-onboarding__eyebrow">Sua rotina começa pequena</p>
                <h2 className="page-title routine-onboarding__title">
                    {greetingName ? `Oi, ${greetingName}.` : 'Oi.'} Escolha até {MAX_ONBOARDING_CHOICES} coisas para
                    começar.
                </h2>
                <p className="text-secondary routine-onboarding__lead">
                    Não precisa montar tudo hoje. Conforme as coisas aparecerem no seu dia, adicione aqui.
                </p>
            </div>

            <div className="card">
                <h3 className="routine-onboarding__group-title">Já ligadas ao app (se marcam sozinhas)</h3>
                <div className="routine-onboarding__chips">{LINKED_ONBOARDING_PRESETS.map(renderPresetChip)}</div>
            </div>

            <div className="card">
                <h3 className="routine-onboarding__group-title">Hábitos comuns</h3>
                <div className="routine-onboarding__chips">{COMMON_ONBOARDING_PRESETS.map(renderPresetChip)}</div>
            </div>

            <form className="card" onSubmit={handleAddCustom}>
                <div className="field field--last">
                    <label htmlFor="routine-onboarding-custom">Ou escreva a sua</label>
                    <div className="routine-onboarding__custom-row">
                        <input
                            id="routine-onboarding-custom"
                            type="text"
                            value={customTitle}
                            maxLength={80}
                            disabled={isSaving || areItemsSaved || isAtLimit}
                            onChange={(event) => setCustomTitle(event.target.value)}
                        />
                        <button
                            type="submit"
                            className="secondary-button"
                            disabled={isSaving || areItemsSaved || isAtLimit || customTitle.trim() === ''}
                        >
                            <Plus size={BUTTON_ICON_SIZE} aria-hidden="true" />
                            Acrescentar
                        </button>
                    </div>
                </div>
                {customChoices.length > 0 && (
                    <div className="routine-onboarding__chips routine-onboarding__chips--custom">
                        {customChoices.map((choice) => (
                            <OnboardingChip
                                key={choice.title}
                                label={choice.title}
                                isChosen
                                isDisabled={isSaving || areItemsSaved}
                                onToggle={() => removeCustom(choice.title)}
                            />
                        ))}
                    </div>
                )}
            </form>

            {errorMessage && <div className="error-list">{errorMessage}</div>}

            <div className="routine-onboarding__footer">
                <p className="routine-onboarding__count">
                    {choices.length} de {MAX_ONBOARDING_CHOICES} escolhidas
                </p>
                <button
                    type="button"
                    className="primary-button"
                    disabled={isSaving || (choices.length === 0 && !areItemsSaved)}
                    onClick={handleStart}
                >
                    {isSaving ? 'Salvando...' : 'Começar minha rotina'}
                </button>
                <button type="button" className="secondary-button" disabled={isSaving || areItemsSaved} onClick={handleSkip}>
                    Pular por agora
                </button>
            </div>
        </div>
    )
}

type OnboardingChipProps = {
    label: string
    isChosen: boolean
    isDisabled: boolean
    onToggle: () => void
}

function OnboardingChip({ label, isChosen, isDisabled, onToggle }: OnboardingChipProps) {
    const className = isChosen
        ? 'routine-onboarding__chip routine-onboarding__chip--chosen'
        : 'routine-onboarding__chip'
    return (
        <button type="button" className={className} aria-pressed={isChosen} disabled={isDisabled} onClick={onToggle}>
            {isChosen && <Check size={CHECK_ICON_SIZE} strokeWidth={CHECK_ICON_STROKE} aria-hidden="true" />}
            {label}
        </button>
    )
}
