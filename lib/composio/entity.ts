import 'server-only'

import type { Profile } from '@/lib/profile/ensureProfile'
import { createInsForgeServerClient } from '@/app/lib/insforge/server'
import { composioUserEntityId, getComposioMode } from './mode'

/**
 * Composio identity resolution (Key Decision 17 + multi-user project mode).
 *
 * Project API key (cloud / multi-user) — production path:
 *   1. profiles.composio_entity_id if set to this user's entity
 *   2. else stable per-user id: ozyman:<insforge_user_id>
 *   Never share COMPOSIO_DEFAULT_ENTITY_ID across users.
 *
 * User key / local sole-operator (dev only):
 *   1. profile
 *   2. COMPOSIO_DEFAULT_ENTITY_ID (CLI consumer seed)
 *   3. raw user id
 */

export type EntityResolution = {
  entityId: string
  source: 'profile' | 'env_default' | 'user_id' | 'project_user'
}

export function resolveEntityId(
  profile: Pick<Profile, 'composio_entity_id'> | null,
  userId: string,
): EntityResolution {
  const mode = getComposioMode()
  const fromProfile = profile?.composio_entity_id?.trim()

  if (mode.isProjectMode) {
    // Multi-user: profile only if it already matches this user's project entity
    // or is a non-empty explicit override the user linked under.
    // Prefer stable project entity so new users never inherit a shared seed.
    const projectEntity = composioUserEntityId(userId)
    if (fromProfile) {
      // If profile still holds a shared CLI consumer id while project mode is on,
      // re-home to project entity unless operator explicitly allows shared seed
      // and profile equals the env default (legacy sole-operator).
      const envDefault = process.env.COMPOSIO_DEFAULT_ENTITY_ID?.trim()
      if (
        mode.allowSharedEntitySeed &&
        envDefault &&
        fromProfile === envDefault
      ) {
        return { entityId: fromProfile, source: 'profile' }
      }
      // Profile set from successful in-app link under project mode — keep it
      if (
        fromProfile === projectEntity ||
        fromProfile === userId ||
        fromProfile.startsWith('ozyman:')
      ) {
        return { entityId: fromProfile, source: 'profile' }
      }
      // Stale CLI consumer entity on profile — switch to project user entity
      return { entityId: projectEntity, source: 'project_user' }
    }
    return { entityId: projectEntity, source: 'project_user' }
  }

  // Local / user-key path
  if (fromProfile) {
    return { entityId: fromProfile, source: 'profile' }
  }

  if (mode.allowSharedEntitySeed) {
    const fromEnv = process.env.COMPOSIO_DEFAULT_ENTITY_ID?.trim()
    if (fromEnv) {
      return { entityId: fromEnv, source: 'env_default' }
    }
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

/**
 * On successful link/smoke under project mode, force profile to the
 * multi-user-safe entity for this InsForge user.
 */
export async function ensureProjectEntityOnProfile(
  userId: string,
): Promise<string> {
  const entityId = composioUserEntityId(userId)
  await persistEntityId(userId, entityId, { force: true })
  return entityId
}
