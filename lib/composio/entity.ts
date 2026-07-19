import 'server-only'

import type { Profile } from '@/lib/profile/ensureProfile'
import { createInsForgeServerClient } from '@/app/lib/insforge/server'

/**
 * Composio identity resolution (Key Decision 17).
 *
 * Priority:
 * 1. profiles.composio_entity_id (persisted after seed or successful re-link)
 * 2. COMPOSIO_DEFAULT_ENTITY_ID (best-effort CLI consumer seed)
 * 3. InsForge auth user id (fallback entity for in-app OAuth re-link)
 *
 * CLI ACTIVE connections bind to the consumer entity — they are NOT
 * automatically visible to the server API key. Re-link is a first-class path.
 */

export type EntityResolution = {
  entityId: string
  source: 'profile' | 'env_default' | 'user_id'
}

export function resolveEntityId(
  profile: Pick<Profile, 'composio_entity_id'> | null,
  userId: string,
): EntityResolution {
  const fromProfile = profile?.composio_entity_id?.trim()
  if (fromProfile) {
    return { entityId: fromProfile, source: 'profile' }
  }

  const fromEnv = process.env.COMPOSIO_DEFAULT_ENTITY_ID?.trim()
  if (fromEnv) {
    return { entityId: fromEnv, source: 'env_default' }
  }

  return { entityId: userId, source: 'user_id' }
}

/**
 * Persist a working entity id on the profile when missing or when re-link
 * proves a different entity. Never overwrites a non-null profile value unless
 * `force` is true (used after successful re-link under a new entity).
 */
export async function persistEntityId(
  userId: string,
  entityId: string,
  options?: { force?: boolean },
): Promise<void> {
  const id = entityId.trim()
  if (!id) return

  try {
    const client = await createInsForgeServerClient()
    if (options?.force) {
      const { error } = await client.database
        .from('profiles')
        .update({ composio_entity_id: id })
        .eq('id', userId)
      if (error) {
        console.error('[composio/entity] force persist failed', error)
      }
      return
    }

    // Only fill null — matches ensureProfile seed semantics
    const { data: row } = await client.database
      .from('profiles')
      .select('composio_entity_id')
      .eq('id', userId)
      .maybeSingle()

    if (row && !row.composio_entity_id) {
      const { error } = await client.database
        .from('profiles')
        .update({ composio_entity_id: id })
        .eq('id', userId)
      if (error) {
        console.error('[composio/entity] seed persist failed', error)
      }
    }
  } catch (err) {
    console.error('[composio/entity] persist unexpected', err)
  }
}
