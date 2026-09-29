import { Moon, Scale } from 'lucide-react'

import {
    deleteBodyWeightEntry,
    deleteSleepEntry,
    getBodyWeightForDate,
    getSleepForDate,
    listRecentBodyWeightEntries,
    listRecentSleepEntries,
    upsertBodyWeightEntry,
    upsertSleepEntry,
} from '@/features/bodyMetrics/api'
import { QuickMetricLog } from '@/features/bodyMetrics/QuickMetricLog'

const SLEEP_MAX_HOURS = 24

type BodyMetricLogProps = {
    entryDate: string
    onChanged?: () => void
}

export function BodyWeightLog({ entryDate, onChanged }: BodyMetricLogProps) {
    return (
        <QuickMetricLog
            title="Peso corporal"
            icon={Scale}
            unitLabel="kg"
            placeholder="ex: 78.5"
            entryDate={entryDate}
            onChanged={onChanged}
            listRecent={async () =>
                (await listRecentBodyWeightEntries()).map((entry) => ({
                    id: entry.id,
                    entryDate: entry.entry_date,
                    value: entry.weight_kg,
                }))
            }
            getEntryForDate={async (date) => {
                const entry = await getBodyWeightForDate(date)
                return entry ? { id: entry.id, entryDate: entry.entry_date, value: entry.weight_kg } : null
            }}
            save={async (date, value) => {
                const saved = await upsertBodyWeightEntry(date, value)
                return { id: saved.id, entryDate: saved.entry_date, value: saved.weight_kg }
            }}
            deleteEntry={deleteBodyWeightEntry}
        />
    )
}

export function SleepLog({ entryDate, onChanged }: BodyMetricLogProps) {
    return (
        <QuickMetricLog
            title="Sono (horas)"
            icon={Moon}
            unitLabel="horas"
            placeholder="ex: 7.5"
            entryDate={entryDate}
            maxValue={SLEEP_MAX_HOURS}
            onChanged={onChanged}
            listRecent={async () =>
                (await listRecentSleepEntries()).map((entry) => ({
                    id: entry.id,
                    entryDate: entry.entry_date,
                    value: entry.hours,
                }))
            }
            getEntryForDate={async (date) => {
                const entry = await getSleepForDate(date)
                return entry ? { id: entry.id, entryDate: entry.entry_date, value: entry.hours } : null
            }}
            save={async (date, value) => {
                const saved = await upsertSleepEntry(date, value)
                return { id: saved.id, entryDate: saved.entry_date, value: saved.hours }
            }}
            deleteEntry={deleteSleepEntry}
        />
    )
}
