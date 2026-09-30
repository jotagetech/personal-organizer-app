import type { ComponentType } from 'react'

import { DaysSection } from '@/features/evolution/sections/DaysSection'

export type EvolutionSection = {
    id: string
    title: string
    Component: ComponentType
}

export const EVOLUTION_SECTIONS: EvolutionSection[] = [{ id: 'days', title: 'Dias', Component: DaysSection }]
