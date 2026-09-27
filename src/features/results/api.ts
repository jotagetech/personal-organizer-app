import { supabase } from '@/lib/supabaseClient'
import type { IsoDate } from '@/lib/dateUtils'

export async function listFinishedSessionDates(sinceDate: IsoDate): Promise<IsoDate[]> {
    const { data, error } = await supabase
        .from('workout_sessions')
        .select('session_date')
        .not('finished_at', 'is', null)
        .gte('session_date', sinceDate)
        .order('session_date', { ascending: true })

    if (error) {
        throw new Error(error.message)
    }

    const sessionDates = (data ?? []).map((row) => row.session_date)
    return sessionDates
}
