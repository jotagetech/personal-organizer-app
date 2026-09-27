import { useState } from 'react'

import { useAuth } from '@/contexts/AuthContext'

export function LoginPage() {
    const { signInWithPassword } = useAuth()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault()
        setIsSubmitting(true)
        setErrorMessage(null)

        const signInError = await signInWithPassword(email, password)

        setIsSubmitting(false)
        if (signInError) {
            setErrorMessage(signInError)
        }
    }

    return (
        <div className="app-content">
            <h1>Entrar</h1>
            {errorMessage && <div className="error-list">{errorMessage}</div>}
            <form onSubmit={handleSubmit}>
                <div className="field">
                    <label htmlFor="email">E-mail</label>
                    <input
                        id="email"
                        type="email"
                        autoComplete="username"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                    />
                </div>
                <div className="field">
                    <label htmlFor="password">Senha</label>
                    <input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                    />
                </div>
                <button type="submit" className="primary-button" disabled={isSubmitting}>
                    {isSubmitting ? 'Entrando...' : 'Entrar'}
                </button>
            </form>
        </div>
    )
}
