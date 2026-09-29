import { Bell, BellOff } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
    currentPushAvailability,
    disablePushNotifications,
    enablePushNotifications,
    getActivePushSubscription,
    syncPushSubscription,
} from '@/features/notifications/pushApi'
import type { PushAvailability } from '@/features/notifications/pushSupport'

const BUTTON_ICON_SIZE = 18

const UNAVAILABLE_MESSAGE: Record<Exclude<PushAvailability, 'disponivel'>, string> = {
    nao_suportado:
        'Este navegador não recebe notificações. No iPhone, precisa do iOS 16.4 ou mais novo, com o app aberto pelo ícone da tela de início.',
    abrir_pela_tela_de_inicio:
        'No iPhone, as notificações só funcionam com o app aberto pelo ícone da tela de início. No Safari, toque em Compartilhar, depois em Adicionar à Tela de Início, e abra o app por esse ícone.',
    bloqueado:
        'Notificações bloqueadas neste aparelho. Libere em Ajustes, Notificações, Organizer, e volte aqui.',
}

export function PushNotificationsSection() {
    const [availability, setAvailability] = useState<PushAvailability>(() => currentPushAvailability())
    const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null)
    const [isBusy, setIsBusy] = useState(false)
    const [statusMessage, setStatusMessage] = useState<string | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    useEffect(() => {
        let isCancelled = false

        async function loadSubscription() {
            const subscription = await getActivePushSubscription()
            if (isCancelled) {
                return
            }
            setIsSubscribed(subscription !== null)
            if (subscription) {
                void syncPushSubscription()
            }
        }

        void loadSubscription()
        return () => {
            isCancelled = true
        }
    }, [])

    async function handleEnable() {
        setIsBusy(true)
        setErrorMessage(null)
        setStatusMessage(null)
        try {
            const result = await enablePushNotifications()
            setAvailability(currentPushAvailability())
            setIsSubscribed(result === 'ativadas')
            if (result === 'sem_resposta') {
                setStatusMessage('A permissão não foi concedida. Toque de novo para tentar.')
            }
        } catch (enableError) {
            const message = enableError instanceof Error ? enableError.message : 'Falha ao ativar notificações'
            setErrorMessage(message)
        } finally {
            setIsBusy(false)
        }
    }

    async function handleDisable() {
        setIsBusy(true)
        setErrorMessage(null)
        setStatusMessage(null)
        try {
            await disablePushNotifications()
            setIsSubscribed(false)
        } catch (disableError) {
            const message = disableError instanceof Error ? disableError.message : 'Falha ao desativar notificações'
            setErrorMessage(message)
        } finally {
            setIsBusy(false)
        }
    }

    return (
        <section className="menu-section">
            <div className="menu-section__header">
                <h3 className="section-title">Notificações</h3>
                <p className="menu-section__subtitle">Aviso no fim do descanso entre séries, mesmo com a tela bloqueada</p>
            </div>
            <div className="card push-settings">
                {availability !== 'disponivel' ? (
                    <p className="push-settings__status">{UNAVAILABLE_MESSAGE[availability]}</p>
                ) : isSubscribed === null ? (
                    <p className="push-settings__status text-muted">Verificando...</p>
                ) : isSubscribed ? (
                    <>
                        <p className="push-settings__status">Ativadas neste aparelho.</p>
                        <button type="button" className="secondary-button" disabled={isBusy} onClick={handleDisable}>
                            <BellOff size={BUTTON_ICON_SIZE} aria-hidden="true" />
                            Desativar
                        </button>
                    </>
                ) : (
                    <>
                        <p className="push-settings__status">Desativadas neste aparelho.</p>
                        <button type="button" className="primary-button" disabled={isBusy} onClick={handleEnable}>
                            <Bell size={BUTTON_ICON_SIZE} aria-hidden="true" />
                            Ativar notificações
                        </button>
                    </>
                )}
                {statusMessage && <p className="save-status">{statusMessage}</p>}
                {errorMessage && <p className="save-status save-status--error">{errorMessage}</p>}
            </div>
        </section>
    )
}
