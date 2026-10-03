import { useEffect, useState } from 'react'

import { useProfile } from '@/contexts/ProfileContext'
import {
    FULL_NAME_MAX_LENGTH,
    greetingText,
    NICKNAME_MAX_LENGTH,
    toNullableText,
} from '@/features/account/profileGreeting'
import { useCurrentHour } from '@/features/account/useCurrentHour'

const SAVE_ERROR_MESSAGE = 'Não foi possível salvar agora. O que você digitou continua aqui, tente de novo.'

export function ProfileSection() {
    const { fullName, nickname, displayName, saveProfile, isLoading } = useProfile()
    const currentHour = useCurrentHour()
    const [fullNameDraft, setFullNameDraft] = useState('')
    const [nicknameDraft, setNicknameDraft] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [isSaved, setIsSaved] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    useEffect(() => {
        setFullNameDraft(fullName ?? '')
        setNicknameDraft(nickname ?? '')
    }, [fullName, nickname])

    const hasChanges = toNullableText(fullNameDraft) !== fullName || toNullableText(nicknameDraft) !== nickname

    function handleFullNameChange(value: string) {
        setFullNameDraft(value)
        setIsSaved(false)
    }

    function handleNicknameChange(value: string) {
        setNicknameDraft(value)
        setIsSaved(false)
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault()
        setIsSaving(true)
        setErrorMessage(null)
        try {
            await saveProfile(fullNameDraft, nicknameDraft)
            setIsSaved(true)
        } catch {
            setErrorMessage(SAVE_ERROR_MESSAGE)
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <section className="menu-section">
            <div className="menu-section__header">
                <h3 className="section-title">Perfil</h3>
            </div>
            <form className="card profile-section" onSubmit={handleSubmit}>
                <div className="field">
                    <label htmlFor="profile-full-name">Nome</label>
                    <input
                        id="profile-full-name"
                        type="text"
                        autoComplete="name"
                        maxLength={FULL_NAME_MAX_LENGTH}
                        value={fullNameDraft}
                        disabled={isLoading}
                        onChange={(event) => handleFullNameChange(event.target.value)}
                    />
                </div>
                <div className="field">
                    <label htmlFor="profile-nickname">Como quer ser chamado</label>
                    <input
                        id="profile-nickname"
                        type="text"
                        autoComplete="nickname"
                        maxLength={NICKNAME_MAX_LENGTH}
                        value={nicknameDraft}
                        disabled={isLoading}
                        onChange={(event) => handleNicknameChange(event.target.value)}
                    />
                    <p className="profile-section__hint">É assim que o app vai te cumprimentar.</p>
                </div>
                <p className="profile-section__preview">{greetingText(currentHour, displayName)}</p>
                {errorMessage && <p className="error-list">{errorMessage}</p>}
                <div className="profile-section__actions">
                    <button type="submit" className="primary-button" disabled={!hasChanges || isSaving || isLoading}>
                        Salvar
                    </button>
                    {isSaved && !hasChanges && (
                        <span className="save-status" role="status">
                            Salvo
                        </span>
                    )}
                </div>
            </form>
        </section>
    )
}
