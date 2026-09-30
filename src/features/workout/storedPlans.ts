import type { StoredPlansListing } from '@/features/workout/api'

export type StoredPlanEntry = {
    id: string
    name: string
    importedAt: string
    isActive: boolean
    versionLabel: string | null
}

// O montador salva cada edição como um plano novo com o mesmo nome; numerar
// as versões pela ordem de importação deixa distinguir uma da outra na lista.
export function describeStoredPlans(listing: StoredPlansListing): StoredPlanEntry[] {
    const plansOldestFirst = [...listing.plans].sort((first, second) =>
        first.importedAt.localeCompare(second.importedAt),
    )
    const totalByName = new Map<string, number>()
    plansOldestFirst.forEach((plan) => totalByName.set(plan.name, (totalByName.get(plan.name) ?? 0) + 1))

    const seenByName = new Map<string, number>()
    const entriesOldestFirst = plansOldestFirst.map((plan) => {
        const versionNumber = (seenByName.get(plan.name) ?? 0) + 1
        seenByName.set(plan.name, versionNumber)
        const totalVersions = totalByName.get(plan.name) ?? 1
        const versionLabel = totalVersions > 1 ? `versão ${versionNumber} de ${totalVersions}` : null

        return {
            id: plan.id,
            name: plan.name,
            importedAt: plan.importedAt,
            isActive: plan.id === listing.activePlanId,
            versionLabel,
        }
    })

    const entriesNewestFirst = entriesOldestFirst.reverse()
    return entriesNewestFirst
}

export function storedPlanDisplayName(entry: StoredPlanEntry): string {
    const displayName = entry.versionLabel ? `${entry.name} (${entry.versionLabel})` : entry.name

    return displayName
}

export function formatPlanImportedAt(isoTimestamp: string): string {
    const formatted = new Date(isoTimestamp).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })

    return formatted
}
