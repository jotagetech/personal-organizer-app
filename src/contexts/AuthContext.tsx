import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { supabase } from '@/lib/supabaseClient'

type AuthContextValue = {
    session: Session | null
    isLoadingSession: boolean
    signInWithPassword: (email: string, password: string) => Promise<string | null>
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null)
    const [isLoadingSession, setIsLoadingSession] = useState(true)

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session)
            setIsLoadingSession(false)
        })

        const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            setSession(nextSession)
        })

        return () => subscription.subscription.unsubscribe()
    }, [])

    async function signInWithPassword(email: string, password: string): Promise<string | null> {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        const errorMessage = error ? error.message : null

        return errorMessage
    }

    async function signOut(): Promise<void> {
        await supabase.auth.signOut()
    }

    const contextValue: AuthContextValue = {
        session,
        isLoadingSession,
        signInWithPassword,
        signOut,
    }

    return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
    const contextValue = useContext(AuthContext)
    if (!contextValue) {
        throw new Error('useAuth precisa estar dentro de um AuthProvider')
    }

    return contextValue
}
