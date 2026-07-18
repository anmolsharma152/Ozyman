import { cache } from 'react'
import type { SessionUser } from '@/app/lib/auth'
import { createInsForgeServerClient } from '@/app/lib/insforge/server'

export type ProfileSettings = {
  github_repos?: Array<{ owner: string; repo: string }>
  flags?: Record<string, unknown>
  quiet_hours?: unknown
  persona?: unknown
  [key: string]: unknown
}

export type Profile = {
  id: string
  display_name: string | null
  timezone: string
  brief_cron_local: string | null
  brief_email_enabled: boolean
  digest_email: string | null
  composio_entity_id: string | null
  settings: ProfileSettings
  created_at: string
  updated_at: string
}

type ProfileClient = Awaited<ReturnType<typeof createInsForgeServerClient>>

const PROFILE_SELECT =
  'id, display_name, timezone, brief_cron_local, brief_email_enabled, digest_email, composio_entity_id, settings, created_at, updated_at'

function defaultSettings(): ProfileSettings {
  return {
    github_repos: [],
    flags: {},
  }
}

type SeedInputs = {
  sessionEmail: string | null
  displayName: string | null
  defaultEntity: string | null
}

/**
 * Build a patch that only fills null seed fields (never overwrites user edits).
 */
function buildNullSeedPatch(
  profile: Profile,
  seeds: SeedInputs,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (!profile.digest_email && seeds.sessionEmail) {
    patch.digest_email = seeds.sessionEmail
  }
  if (!profile.composio_entity_id && seeds.defaultEntity) {
    patch.composio_entity_id = seeds.defaultEntity
  }
  if (!profile.display_name && seeds.displayName) {
    patch.display_name = seeds.displayName
  }
  return patch
}

/**
 * Apply null-seed patch when present; otherwise return profile unchanged.
 * Used for both the existing-row path and concurrent-insert race re-select.
 */
async function maybeSeedNulls(
  client: ProfileClient,
  userId: string,
  profile: Profile,
  seeds: SeedInputs,
): Promise<Profile> {
  const patch = buildNullSeedPatch(profile, seeds)
  if (Object.keys(patch).length === 0) {
    return profile
  }

  const { data: updated, error: updateError } = await client.database
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select(PROFILE_SELECT)
    .single()

  if (updateError) {
    console.error('[ensureProfile] update failed', updateError)
    return profile
  }

  return updated ? normalizeProfile(updated) : profile
}

/**
 * First-login (and every authenticated load) profile bootstrap.
 *
 * - Inserts a row when missing (id = auth.users id).
 * - Seeds digest_email from session email when column is null (never overwrites user edits).
 * - Seeds composio_entity_id from COMPOSIO_DEFAULT_ENTITY_ID when set and column is null.
 * - Soft-fails (returns null) if tables are missing or RLS/network errors so the shell still renders.
 *
 * Pattern: select → insert-if-missing (race-safe re-select) → fill null seed fields.
 * Wrapped in React cache() so layout + page share one call per request.
 */
export const ensureProfile = cache(
  async (user: SessionUser): Promise<Profile | null> => {
    try {
      const client = await createInsForgeServerClient()
      const seeds: SeedInputs = {
        sessionEmail: user.email?.trim() || null,
        displayName: user.name?.trim() || null,
        defaultEntity: process.env.COMPOSIO_DEFAULT_ENTITY_ID?.trim() || null,
      }

      const { data: existing, error: selectError } = await client.database
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('id', user.id)
        .maybeSingle()

      if (selectError) {
        console.error('[ensureProfile] select failed', selectError)
        return null
      }

      if (!existing) {
        const { data: inserted, error: insertError } = await client.database
          .from('profiles')
          .insert([
            {
              id: user.id,
              display_name: seeds.displayName,
              digest_email: seeds.sessionEmail,
              composio_entity_id: seeds.defaultEntity,
              settings: defaultSettings(),
            },
          ])
          .select(PROFILE_SELECT)
          .single()

        if (insertError) {
          // Race: concurrent first load may insert first — re-select then seed nulls
          const { data: raced, error: raceError } = await client.database
            .from('profiles')
            .select(PROFILE_SELECT)
            .eq('id', user.id)
            .maybeSingle()

          if (raceError || !raced) {
            console.error('[ensureProfile] insert failed', insertError)
            return null
          }
          return maybeSeedNulls(
            client,
            user.id,
            normalizeProfile(raced),
            seeds,
          )
        }

        return inserted ? normalizeProfile(inserted) : null
      }

      return maybeSeedNulls(client, user.id, normalizeProfile(existing), seeds)
    } catch (err) {
      console.error('[ensureProfile] unexpected error', err)
      return null
    }
  },
)

function normalizeProfile(row: Record<string, unknown>): Profile {
  const settings =
    row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings)
      ? (row.settings as ProfileSettings)
      : defaultSettings()

  return {
    id: String(row.id),
    display_name: (row.display_name as string | null) ?? null,
    timezone: (row.timezone as string) || 'Asia/Kolkata',
    brief_cron_local: (row.brief_cron_local as string | null) ?? null,
    brief_email_enabled: row.brief_email_enabled !== false,
    digest_email: (row.digest_email as string | null) ?? null,
    composio_entity_id: (row.composio_entity_id as string | null) ?? null,
    settings,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}
