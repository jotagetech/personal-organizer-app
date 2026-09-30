import { buildCycleBadgeText } from '@/features/cycle/cycleStatusText'
import type { WorkoutCycleRow } from '@/features/cycle/types'
import { todayInTimezone, type IsoDate } from '@/lib/dateUtils'

type CycleStatusBadgeProps = {
    cycles: readonly WorkoutCycleRow[]
    referenceDate: IsoDate
}

export function CycleStatusBadge({ cycles, referenceDate }: CycleStatusBadgeProps) {
    const label = buildCycleBadgeText(cycles, referenceDate, todayInTimezone())
    if (label === null) {
        return null
    }

    return <span className="cycle-badge">{label}</span>
}
