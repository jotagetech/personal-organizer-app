import type { Database } from '@/lib/databaseTypes'

export type CardioActivityTypeRow = Database['public']['Tables']['cardio_activity_types']['Row']
export type CardioEntryRow = Database['public']['Tables']['cardio_entries']['Row']

export const FEELING_SCALE_OPTIONS = [
    { value: 1, emoji: '😞', label: 'Ruim' },
    { value: 2, emoji: '😕', label: 'Fraco' },
    { value: 3, emoji: '😐', label: 'Neutro' },
    { value: 4, emoji: '🙂', label: 'Bom' },
    { value: 5, emoji: '😄', label: 'Ótimo' },
] as const

export type FeelingScale = (typeof FEELING_SCALE_OPTIONS)[number]['value']
