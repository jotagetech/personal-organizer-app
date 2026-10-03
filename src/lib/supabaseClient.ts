import { createClient } from '@supabase/supabase-js'

import { createClockSkewRetryFetch } from '@/lib/clockSkewRetryFetch'
import type { Database } from '@/lib/databaseTypes'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
        'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY precisam estar definidas (ver .env.example)',
    )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: { fetch: createClockSkewRetryFetch() },
})
