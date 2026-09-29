import { cache } from 'react'
import { createClient } from './server'
import type { Database } from '@/lib/types/database.types'

type ProfileRow = Database['public']['Tables']['profiles']['Row']

export type CurrentSession = {
  user: {
    id: string
    email?: string
  }
  profile: ProfileRow | null
  isAdmin: boolean
} | null

/**
 * Returns the current authenticated user and profile, deduplicated across
 * the entire React Server Component tree for the current request lifecycle.
 */
export const getCurrentSession = cache(async (): Promise<CurrentSession> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, username, avatar_url, global_role, created_at')
    .eq('id', user.id)
    .maybeSingle()

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    profile: (profile as ProfileRow) ?? null,
    isAdmin: profile?.global_role === 'admin',
  }
})
