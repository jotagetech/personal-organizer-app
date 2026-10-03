import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { useAuth } from '@/contexts/AuthContext'
import { displayNameOf, toNullableText } from '@/features/account/profileGreeting'
import { supabase } from '@/lib/supabaseClient'

type ProfileContextValue = {
    fullName: string | null
    nickname: string | null
    displayName: string | null
    saveProfile: (fullName: string, nickname: string) => Promise<void>
    isLoading: boolean
}

type StoredProfile = {
    fullName: string | null
    nickname: string | null
}

const EMPTY_PROFILE: StoredProfile = { fullName: null, nickname: null }

const ProfileContext = createContext<ProfileContextValue | null>(null)

async function fetchProfile(userId: string): Promise<StoredProfile> {
    const { data, error } = await supabase
        .from('user_settings')
        .select('full_name, nickname')
        .eq('user_id', userId)
        .maybeSingle()

    if (error) {
        throw new Error(error.message)
    }
    const profile: StoredProfile = { fullName: data?.full_name ?? null, nickname: data?.nickname ?? null }
    return profile
}

export function ProfileProvider({ children }: { children: ReactNode }) {
    const { session } = useAuth()
    const userId = session?.user.id ?? null
    const email = session?.user.email ?? null
    const [profile, setProfile] = useState<StoredProfile>(EMPTY_PROFILE)
    const [isLoading, setIsLoading] = useState(userId !== null)

    useEffect(() => {
        let isCancelled = false
        setProfile(EMPTY_PROFILE)
        if (userId === null) {
            setIsLoading(false)
            return
        }
        setIsLoading(true)
        fetchProfile(userId)
            .then((loadedProfile) => {
                if (!isCancelled) {
                    setProfile(loadedProfile)
                }
            })
            .catch(() => {
                // Sem o perfil, a saudação cai no e-mail.
            })
            .finally(() => {
                if (!isCancelled) {
                    setIsLoading(false)
                }
            })
        return () => {
            isCancelled = true
        }
    }, [userId])

    const saveProfile = useCallback(
        async (fullName: string, nickname: string) => {
            if (userId === null) {
                throw new Error('Entre na conta para salvar o perfil')
            }
            const nextProfile: StoredProfile = {
                fullName: toNullableText(fullName),
                nickname: toNullableText(nickname),
            }
            const { error } = await supabase
                .from('user_settings')
                .update({ full_name: nextProfile.fullName, nickname: nextProfile.nickname })
                .eq('user_id', userId)

            if (error) {
                throw new Error(error.message)
            }
            setProfile(nextProfile)
        },
        [userId],
    )

    const contextValue = useMemo<ProfileContextValue>(
        () => ({
            fullName: profile.fullName,
            nickname: profile.nickname,
            displayName: displayNameOf({ nickname: profile.nickname, fullName: profile.fullName, email }),
            saveProfile,
            isLoading,
        }),
        [profile, email, saveProfile, isLoading],
    )

    return <ProfileContext.Provider value={contextValue}>{children}</ProfileContext.Provider>
}

export function useProfile(): ProfileContextValue {
    const contextValue = useContext(ProfileContext)
    if (!contextValue) {
        throw new Error('useProfile precisa estar dentro de um ProfileProvider')
    }

    return contextValue
}
