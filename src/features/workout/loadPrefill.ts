// Carga que já vem escrita no campo de uma série ainda sem registro: a última
// usada no exercício. Uma série concluída mais cedo no mesmo treino vale antes
// da sessão anterior, porque uma carga trocada no meio do treino é a mais
// recente e é a que a próxima série tende a repetir.

import { lastTimeForSet, type LastTime } from '@/features/evolution/metrics/lastTime'
import { setStatusOf } from '@/features/workout/sessionProgress'
import { setKey, type WorkoutSetRow } from '@/features/workout/types'

export type LoadPrefillSource = {
    exerciseKey: string
    setIndex: number
    setsByKey: Map<string, WorkoutSetRow>
    lastTime: LastTime | null
}

// Carga zero (peso corporal sem lastro) não vira texto no campo: o
// placeholder "sem lastro" já diz isso melhor que um "0" a apagar.
function asPrefill(loadKg: number | null | undefined): number | null {
    const prefillLoadKg = loadKg != null && loadKg > 0 ? loadKg : null

    return prefillLoadKg
}

function earlierLoadToday(source: LoadPrefillSource): number | null {
    for (let earlierIndex = source.setIndex - 1; earlierIndex >= 0; earlierIndex -= 1) {
        const earlierSet = source.setsByKey.get(setKey(source.exerciseKey, earlierIndex))
        const earlierLoadKg = asPrefill(earlierSet?.load_kg)
        if (setStatusOf(earlierSet) === 'completed' && earlierLoadKg !== null) {
            return earlierLoadKg
        }
    }

    return null
}

export function prefillLoadKgOf(source: LoadPrefillSource): number | null {
    const lastTimeLoadKg = asPrefill(lastTimeForSet(source.lastTime, source.setIndex)?.loadKg)
    const prefillLoadKg = earlierLoadToday(source) ?? lastTimeLoadKg

    return prefillLoadKg
}
