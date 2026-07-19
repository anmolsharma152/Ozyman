import { cache } from 'react'
import { createInsForgeServerClient } from '@/app/lib/insforge/server'

export type SessionUser = {
  id: string
  email?: string | null
  name?: string | null
}

/**
 * Best-effort current user for Server Components. Null when signed out.
 * Wrapped in React cache() so layout + page share one getCurrentUser() call per request.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const client = await createInsForgeServerClient()
    const { data, error } = await client.auth.getCurrentUser()
    if (error || !data?.user) return null

    const user = data.user
    const name =
      user.profile?.name ||
      (typeof user.metadata?.full_name === 'string'
        ? user.metadata.full_name
        : null) ||
      (typeof user.metadata?.name === 'string' ? user.metadata.name : null) ||
      null

    return {
      id: user.id,
      email: user.email ?? null,
      name,
    }
  } catch {
    return null
  }
})
