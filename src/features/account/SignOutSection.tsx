import { LogOut } from 'lucide-react'
import { useState } from 'react'

import { signOutFromDevice } from '@/features/account/signOutFromDevice'
import { useAuth } from '@/contexts/AuthContext'
import { useOutbox } from '@/contexts/OutboxContext'

const BUTTON_ICON_SIZE = 18

export function SignOutSection() {
    const { session, signOut } = useAuth()
    const { pendingCount, failedCount } = useOutbox()
    const [isConfirming, setIsConfirming] = useState(false)
    const [isSigningOut, setIsSigningOut] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    // A fila local não é separada por conta: sair com algo nela mandaria os
    // registros com a sessão de quem entrar depois, ou os perderia.
    const unsentCount = pendingCount + failedCount

    async function handleSignOut() {
        setIsSigningOut(true)
        setErrorMessage(null)
        try {
            await signOutFromDevice(signOut)
        } catch (signOutError) {
            const message = signOutError instanceof Error ? signOutError.message : 'Falha ao sair da conta'
            setErrorMessage(message)
            setIsSigningOut(false)
        }
    }

    return (
        <section className="menu-section">
            <div className="menu-section__header">
                <h3 className="section-title">Conta</h3>
                {session?.user.email && <p className="menu-section__subtitle">{session.user.email}</p>}
            </div>
            <div className="card push-settings">
                {unsentCount > 0 ? (
                    <p className="push-settings__status">
                        {unsentCount === 1 ? 'Há 1 registro do treino' : `Há ${unsentCount} registros do treino`} ainda
                        não enviados. Espere a sincronização terminar (ou descarte o que falhou no status de
                        sincronização) para sair da conta.
                    </p>
                ) : isConfirming ? (
                    <div className="overflow-menu__confirm">
                        <span>Sair da conta neste aparelho? As notificações daqui são desligadas.</span>
                        <div className="form-actions">
                            <button
                                type="button"
                                className="secondary-button"
                                disabled={isSigningOut}
                                onClick={() => setIsConfirming(false)}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="primary-button overflow-menu__confirm-danger"
                                disabled={isSigningOut}
                                onClick={handleSignOut}
                            >
                                Sair
                            </button>
                        </div>
                    </div>
                ) : (
                    <button type="button" className="secondary-button" onClick={() => setIsConfirming(true)}>
                        <LogOut size={BUTTON_ICON_SIZE} aria-hidden="true" />
                        Sair da conta
                    </button>
                )}
                {errorMessage && <p className="error-list">{errorMessage}</p>}
            </div>
        </section>
    )
}
