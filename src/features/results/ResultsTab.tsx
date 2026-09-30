import { EVOLUTION_SECTIONS } from '@/features/evolution/sections/evolutionSections'

export function ResultsTab() {
    return (
        <div>
            {EVOLUTION_SECTIONS.map(({ id, Component }) => (
                <Component key={id} />
            ))}
        </div>
    )
}
