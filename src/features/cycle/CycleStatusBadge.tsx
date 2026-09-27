import { cycleStatusOn } from '@/features/cycle/cycleProgress'
import type { WorkoutCycleRow } from '@/features/cycle/types'
import type { IsoDate } from '@/lib/dateUtils'

type CycleStatusBadgeProps = {
    cycle: WorkoutCycleRow | null
    referenceDate: IsoDate
}

export function CycleStatusBadge({ cycle, referenceDate }: CycleStatusBadgeProps) {
    if (!cycle) {
        return null
    }

    const status = cycleStatusOn(cycle.start_date, referenceDate)
    const label =
        status.kind === 'in_progress'
            ? `Dia ${status.dayNumber} do ciclo`
            : `Ciclo começa em ${status.daysUntilStart} dia${status.daysUntilStart === 1 ? '' : 's'}`

    return <span className="cycle-badge">{label}</span>
}
