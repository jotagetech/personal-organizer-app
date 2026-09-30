import { CycleHistoryProvider } from '@/features/evolution/data/CycleHistoryContext'
import { EVOLUTION_SECTIONS } from '@/features/evolution/sections/evolutionSections'

export function ResultsTab() {
    return (
        <CycleHistoryProvider>
            <div>
                {EVOLUTION_SECTIONS.map(({ id, Component }) => (
                    <Component key={id} />
                ))}
            </div>
        </CycleHistoryProvider>
    )
}
