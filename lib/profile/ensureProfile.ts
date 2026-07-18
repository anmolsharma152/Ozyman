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

const PROFILE_SELECT =
  'id, display_name, timezone, brief_cron_local, brief_email_enabled, digest_email, composio_entity_id, settings, created_at, updated_at'

function defaultSettings(): ProfileSettings {
  return {
    github_repos: [],
    flags: {},
  }
}

/**
 * First-login (and every authenticated load) profile bootstrap.
 *
 * - Inserts a row when missing (id = auth.users id).
 * - Seeds digest_email from session email when column is null (never overwrites user edits).
 * - Seeds composio_entity_id from COMPOSIO_DEFAULT_ENTITY_ID when set and column is null.
 * - Soft-fails (returns null) if tables are missing or RLS/network errors so the shell still renders.
 *
 * Wrapped in React cache() so layout + page share one call per request.
 */
export const ensureProfile = cache(
  async (user: SessionUser): Promise<Profile | null> => {
    try {
      const client = await createInsForgeServerClient()
      const sessionEmail = user.email?.trim() || null
      const displayName = user.name?.trim() || null
      const defaultEntity =
        process.env.COMPOSIO_DEFAULT_ENTITY_ID?.trim() || null

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
              display_name: displayName,
              digest_email: sessionEmail,
              composio_entity_id: defaultEntity,
              settings: defaultSettings(),
            },
          ])
          .select(PROFILE_SELECT)
          .single()

        if (insertError) {
          // Race: concurrent first load may insert first — re-select
          const { data: raced, error: raceError } = await client.database
            .from('profiles')
            .select(PROFILE_SELECT)
            .eq('id', user.id)
            .maybeSingle()

          if (raceError || !raced) {
            console.error('[ensureProfile] insert failed', insertError)
            return null
          }
          return normalizeProfile(raced)
        }

        return inserted ? normalizeProfile(inserted) : null
      }

      const profile = normalizeProfile(existing)
      const patch: Record<string, unknown> = {}

      // Never overwrite a user-edited digest_email with null / a different value
      if (!profile.digest_email && sessionEmail) {
        patch.digest_email = sessionEmail
      }
      if (!profile.composio_entity_id && defaultEntity) {
        patch.composio_entity_id = defaultEntity
      }
      if (!profile.display_name && displayName) {
        patch.display_name = displayName
      }

      if (Object.keys(patch).length === 0) {
        return profile
      }

      const { data: updated, error: updateError } = await client.database
        .from('profiles')
        .update(patch)
        .eq('id', user.id)
        .select(PROFILE_SELECT)
        .single()

      if (updateError) {
        console.error('[ensureProfile] update failed', updateError)
        return profile
      }

      return updated ? normalizeProfile(updated) : profile
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
