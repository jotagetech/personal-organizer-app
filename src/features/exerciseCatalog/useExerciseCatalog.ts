import { useCallback, useEffect, useMemo, useState } from 'react'

import { useAuth } from '@/contexts/AuthContext'
import { loadExerciseCatalog } from '@/features/exerciseCatalog/api'
import { buildCatalogIndex, type CatalogIndex } from '@/features/exerciseCatalog/catalogSearch'
import type { ExerciseCatalogData } from '@/features/exerciseCatalog/types'

export type ExerciseCatalogState = {
    catalog: ExerciseCatalogData | null
    index: CatalogIndex | null
    isLoading: boolean
    errorMessage: string | null
    reload: () => Promise<void>
}

// Um carregamento por sessão do app, dividido entre montador e Menu. Trocar
// de conta invalida, porque privados e apelidos são da conta.
let cachedCatalog: { userId: string; promise: Promise<ExerciseCatalogData> } | null = null

function catalogFor(userId: string, forceReload: boolean): Promise<ExerciseCatalogData> {
    const isCached = cachedCatalog !== null && cachedCatalog.userId === userId && !forceReload
    if (!isCached) {
        const promise = loadExerciseCatalog()
        promise.catch(() => {
            cachedCatalog = null
        })
        cachedCatalog = { userId, promise }
    }

    return cachedCatalog!.promise
}

export function useExerciseCatalog(): ExerciseCatalogState {
    const { session } = useAuth()
    const userId = session?.user.id ?? null
    const [catalog, setCatalog] = useState<ExerciseCatalogData | null>(null)
    const [isLoading, setIsLoading] = useState(userId !== null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    const load = useCallback(
        async (forceReload: boolean, isCurrent: () => boolean) => {
            if (userId === null) {
                return
            }
            setIsLoading(true)
            try {
                const loadedCatalog = await catalogFor(userId, forceReload)
                if (isCurrent()) {
                    setCatalog(loadedCatalog)
                    setErrorMessage(null)
                }
            } catch (loadError) {
                if (isCurrent()) {
                    setErrorMessage(loadError instanceof Error ? loadError.message : 'Falha ao carregar o catálogo')
                }
            } finally {
                if (isCurrent()) {
                    setIsLoading(false)
                }
            }
        },
        [userId],
    )

    useEffect(() => {
        let isMounted = true
        void load(false, () => isMounted)
        return () => {
            isMounted = false
        }
    }, [load])

    const reload = useCallback(() => load(true, () => true), [load])
    const index = useMemo(() => (catalog ? buildCatalogIndex(catalog, userId) : null), [catalog, userId])
    const state = { catalog, index, isLoading, errorMessage, reload }

    return state
}
