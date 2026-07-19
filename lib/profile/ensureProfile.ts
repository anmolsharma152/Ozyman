import { cache } from 'react'
import type { SessionUser } from '@/app/lib/auth'
import { createInsForgeServerClient } from '@/app/lib/insforge/server'
import { formatUnknownError, withTimeout } from '@/lib/errors'

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

/** Don't block page navigation for a full InsForge 30s SDK timeout. */
const PROFILE_SOFT_MS = 8_000

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
    // Soft-fail: warn with readable text (console.error becomes Next overlay spam)
    console.warn(
      '[ensureProfile] update failed:',
      formatUnknownError(updateError),
    )
    return profile
  }

  return updated ? normalizeProfile(updated as Record<string, unknown>) : profile
}

async function ensureProfileInner(
  user: SessionUser,
): Promise<Profile | null> {
  try {
    const client = await createInsForgeServerClient()
    const allowSharedEntity =
      process.env.COMPOSIO_ALLOW_SHARED_ENTITY === '1' ||
      (process.env.COMPOSIO_API_KEY?.trim() ?? '').startsWith('uak_')
    const seeds: SeedInputs = {
      sessionEmail: user.email?.trim() || null,
      displayName: user.name?.trim() || null,
      defaultEntity: allowSharedEntity
        ? process.env.COMPOSIO_DEFAULT_ENTITY_ID?.trim() || null
        : null,
    }

    const { data: existing, error: selectError } = await client.database
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', user.id)
      .maybeSingle()

    if (selectError) {
      // Use warn + string so Next.js doesn't surface empty `{}` Console Errors
      console.warn(
        '[ensureProfile] select failed:',
        formatUnknownError(selectError),
      )
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
        const { data: raced, error: raceError } = await client.database
          .from('profiles')
          .select(PROFILE_SELECT)
          .eq('id', user.id)
          .maybeSingle()

        if (raceError || !raced) {
          console.warn(
            '[ensureProfile] insert failed:',
            formatUnknownError(insertError),
            raceError ? `| reselect: ${formatUnknownError(raceError)}` : '',
          )
          return null
        }
        return maybeSeedNulls(
          client,
          user.id,
          normalizeProfile(raced as Record<string, unknown>),
          seeds,
        )
      }

      return inserted
        ? normalizeProfile(inserted as Record<string, unknown>)
        : null
    }

    return maybeSeedNulls(
      client,
      user.id,
      normalizeProfile(existing as Record<string, unknown>),
      seeds,
    )
  } catch (err) {
    console.warn('[ensureProfile] unexpected:', formatUnknownError(err))
    return null
  }
}

/**
 * First-login (and every authenticated load) profile bootstrap.
 * Soft-fails to null on DB/timeout so the shell still renders.
 * Soft timeout (8s) avoids waiting the full InsForge ~30s SDK timeout on every nav.
 */
export const ensureProfile = cache(
  async (user: SessionUser): Promise<Profile | null> => {
    return withTimeout(ensureProfileInner(user), PROFILE_SOFT_MS, () => {
      console.warn(
        `[ensureProfile] soft-timeout after ${PROFILE_SOFT_MS}ms — continuing without profile`,
      )
      return null
    })
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
