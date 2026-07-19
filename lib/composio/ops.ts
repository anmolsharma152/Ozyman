import 'server-only'

import type { SessionUser } from '@/app/lib/auth'
import { ensureProfile } from '@/lib/profile/ensureProfile'
import { executeTool } from './execute'
import {
  fetchLiveConnectionStatus,
  mirrorConnections,
  startToolkitLink,
  isMvpToolkit,
} from './connections'
import { isComposioConfigured } from './client'
import {
  ensureProjectEntityOnProfile,
  persistEntityId,
  resolveEntityId,
} from './entity'
import { getComposioMode, type ComposioModeInfo } from './mode'
import {
  TOOLKIT_LABELS,
  TOOLKIT_SMOKE,
  type MvpToolkit,
  type ToolkitConnection,
} from './types'

/**
 * Shared Composio connection operations used by server actions and HTTP routes.
 * Keeps UI actions and API routes from drifting (review DRY follow-up).
 */

export type ConnectionsSnapshot = {
  configured: boolean
  entityId: string | null
  entitySource: string | null
  connections: ToolkitConnection[]
  configError: string | null
  /** project | user | missing — multi-user ready when project */
  composioMode: ComposioModeInfo['label']
  composioKeyKind: ComposioModeInfo['kind']
  isProjectMode: boolean
  setupHint: string | null
}

export type LinkOpResult = {
  ok: boolean
  redirectUrl?: string | null
  connectionId?: string | null
  error?: string | null
  cliHint?: string
  entityId?: string
  toolkit?: MvpToolkit
}

export type SmokeOpResult = {
  ok: boolean
  error?: string | null
  githubLogin?: string | null
  /** Short human summary of what the smoke returned */
  summary?: string | null
  toolkit?: MvpToolkit
  needsRelink?: boolean
  entityId?: string | null
  entitySource?: string | null
  slug?: string
  cliHint?: string
  connections?: ToolkitConnection[]
  data?: Record<string, unknown> | null
}

function summarizeSmoke(
  toolkit: MvpToolkit,
  data: Record<string, unknown> | null,
): string {
  if (!data) return `${TOOLKIT_LABELS[toolkit]} responded (empty body).`
  if (toolkit === 'github') {
    const login = data.login ?? data.username
    return login
      ? `GitHub OK — signed in as @${login}.`
      : 'GitHub OK — profile returned.'
  }
  if (toolkit === 'gmail') {
    const msgs = Array.isArray(data.messages)
      ? data.messages
      : Array.isArray(data.value)
        ? data.value
        : []
    const first = msgs[0] as Record<string, unknown> | undefined
    const subject = first
      ? String(first.subject ?? first.Subject ?? '')
      : ''
    const n =
      typeof data.returned_count === 'number'
        ? data.returned_count
        : msgs.length
    if (subject) return `Gmail OK — sample: “${subject.slice(0, 60)}”.`
    return `Gmail OK — fetch returned ${n} message(s).`
  }
  // slack
  const channels =
    (Array.isArray(data.channels) && data.channels) ||
    (Array.isArray(data.items) && data.items) ||
    (Array.isArray(data.value) && data.value) ||
    []
  if (channels.length) {
    const name =
      (channels[0] as Record<string, unknown>).name ??
      (channels[0] as Record<string, unknown>).id
    return `Slack OK — saw ${channels.length} channel(s)${name ? ` (e.g. ${name})` : ''}.`
  }
  return 'Slack OK — tool returned data.'
}

/** Cap / sanitize error text before it reaches the browser (no stack dumps). */
export function publicErrorMessage(
  err: unknown,
  fallback = 'Something went wrong',
): string {
  let raw: string
  if (typeof err === 'string') raw = err
  else if (err instanceof Error) raw = err.message
  else if (err && typeof err === 'object' && 'message' in err) {
    raw = String((err as { message: unknown }).message)
  } else raw = fallback

  // Strip accidental secret-looking tokens and truncate
  const scrubbed = raw
    .replace(/composio[_-]?api[_-]?key[=:\s]+\S+/gi, '[redacted]')
    .replace(/\buak_[A-Za-z0-9_*]+/g, 'uak_***')
    .replace(/\bak_[A-Za-z0-9_*]+/g, 'ak_***')
    .replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, '[redacted]')
    .replace(/\n[\s\S]*/, '') // first line only
    .trim()

  if (!scrubbed) return fallback
  return scrubbed.length > 280 ? `${scrubbed.slice(0, 277)}…` : scrubbed
}

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    'http://localhost:3000'
  )
}

export async function getConnectionsSnapshot(
  user: SessionUser,
): Promise<ConnectionsSnapshot> {
  const mode = getComposioMode()
  if (!isComposioConfigured()) {
    return {
      configured: false,
      entityId: null,
      entitySource: null,
      connections: [],
      configError:
        'COMPOSIO_API_KEY is not set. Use a project API key from https://dashboard.composio.dev/settings (server only, never NEXT_PUBLIC_*).',
      composioMode: mode.label,
      composioKeyKind: mode.kind,
      isProjectMode: false,
      setupHint: mode.setupHint,
    }
  }

  // Profile may be null when InsForge is slow/down — still resolve per-user entity
  const profile = await ensureProfile(user)
  const { entityId, source } = resolveEntityId(profile, user.id)
  if (mode.isProjectMode && source === 'project_user' && profile) {
    void persistEntityId(user.id, entityId, { force: true })
  }

  // Bound connection list so Settings doesn't hang if Composio/CLI stalls
  const { withTimeout } = await import('@/lib/errors')
  const connections = await withTimeout(
    fetchLiveConnectionStatus(entityId),
    12_000,
    () =>
      (Object.keys(TOOLKIT_LABELS) as MvpToolkit[]).map((toolkit) => ({
        toolkit,
        label: TOOLKIT_LABELS[toolkit],
        status: 'error' as const,
        composioAccountId: null,
        alias: null,
        lastCheckedAt: new Date().toISOString(),
        detail: 'Status check timed out — open Manage apps to retry.',
      })),
  )
  void mirrorConnections(user.id, connections)

  return {
    configured: true,
    entityId,
    entitySource: source,
    connections,
    configError: null,
    composioMode: mode.label,
    composioKeyKind: mode.kind,
    isProjectMode: mode.isProjectMode,
    setupHint: mode.setupHint,
  }
}

export async function linkToolkitForUser(
  user: SessionUser,
  toolkitRaw: string,
): Promise<LinkOpResult> {
  const toolkit = toolkitRaw.toLowerCase()
  if (!isMvpToolkit(toolkit)) {
    return { ok: false, error: 'Unknown toolkit. Use gmail, github, or slack.' }
  }

  if (!isComposioConfigured()) {
    return {
      ok: false,
      error: 'COMPOSIO_API_KEY is not configured on the server',
      cliHint: `composio link ${toolkit}`,
    }
  }

  const profile = await ensureProfile(user)
  const mode = getComposioMode()
  // Multi-user: always OAuth under this user's project entity
  const entityId = mode.isProjectMode
    ? await ensureProjectEntityOnProfile(user.id)
    : resolveEntityId(profile, user.id).entityId
  if (!mode.isProjectMode) {
    const resolved = resolveEntityId(profile, user.id)
    await persistEntityId(user.id, resolved.entityId, {
      force:
        resolved.source === 'user_id' || resolved.source === 'env_default',
    })
  }

  const callbackUrl = `${appOrigin()}/settings?linked=${toolkit}`
  const result = await startToolkitLink(entityId, toolkit, callbackUrl)

  const linkHint = mode.isProjectMode
    ? 'Retry Link in Apps. Project mode requires in-app OAuth per user.'
    : `composio link ${toolkit}`

  if (!result.redirectUrl) {
    return {
      ok: false,
      error: publicErrorMessage(
        result.error,
        mode.isProjectMode
          ? 'No OAuth URL from Composio. Check project API key and auth configs.'
          : 'No OAuth URL from Composio. Use the CLI hint below.',
      ),
      cliHint: linkHint,
      entityId,
      toolkit,
      connectionId: result.connectionId,
    }
  }

  return {
    ok: true,
    redirectUrl: result.redirectUrl,
    connectionId: result.connectionId,
    entityId,
    toolkit,
    cliHint: linkHint,
  }
}

/**
 * Read-only smoke for any MVP toolkit (Gmail / GitHub / Slack).
 * Proves the linked account can execute a real tool for this entity.
 */
export async function runToolkitSmokeForUser(
  user: SessionUser,
  toolkitRaw: string,
): Promise<SmokeOpResult> {
  const toolkit = toolkitRaw.toLowerCase()
  if (!isMvpToolkit(toolkit)) {
    return {
      ok: false,
      error: 'Unknown toolkit. Use gmail, github, or slack.',
      needsRelink: true,
    }
  }

  if (!isComposioConfigured()) {
    return {
      ok: false,
      error: 'COMPOSIO_API_KEY is not configured on the server',
      needsRelink: true,
      toolkit,
      cliHint: `composio link ${toolkit}`,
    }
  }

  const smoke = TOOLKIT_SMOKE[toolkit]
  const profile = await ensureProfile(user)
  const mode = getComposioMode()
  const resolved = resolveEntityId(profile, user.id)
  const entityId = mode.isProjectMode
    ? await ensureProjectEntityOnProfile(user.id)
    : resolved.entityId
  if (!mode.isProjectMode) {
    await persistEntityId(user.id, entityId, {
      force:
        resolved.source === 'env_default' || resolved.source === 'user_id',
    })
  }

  const result = await executeTool(smoke.slug, entityId, smoke.args)
  // Normalize so Gmail counts survive large CLI payloads
  let data = result.data
  if (result.successful && data) {
    try {
      const { normalizeToolData } = await import('./normalize')
      data = normalizeToolData(smoke.slug, data) ?? data
    } catch {
      // keep raw
    }
  }

  const connections = await fetchLiveConnectionStatus(entityId)
  void mirrorConnections(user.id, connections)

  const entitySource = mode.isProjectMode
    ? 'project_user'
    : resolved.source

  if (result.successful) {
    await persistEntityId(user.id, entityId, { force: true })
    const login =
      toolkit === 'github'
        ? (data?.login as string | undefined) ||
          (data?.username as string | undefined) ||
          null
        : null
    return {
      ok: true,
      toolkit,
      githubLogin: login,
      summary: summarizeSmoke(toolkit, data),
      needsRelink: false,
      entityId,
      entitySource,
      slug: smoke.slug,
      connections,
      data,
    }
  }

  return {
    ok: false,
    toolkit,
    error: publicErrorMessage(
      result.error,
      `${TOOLKIT_LABELS[toolkit]} smoke failed`,
    ),
    needsRelink: true,
    entityId,
    entitySource,
    slug: smoke.slug,
    cliHint: mode.isProjectMode
      ? `Re-link ${toolkit} in Apps (project mode — each user OAuths their own account).`
      : `composio link ${toolkit}`,
    connections,
  }
}

/** @deprecated Prefer runToolkitSmokeForUser(user, 'github') */
export async function runGithubSmokeForUser(
  user: SessionUser,
): Promise<SmokeOpResult> {
  return runToolkitSmokeForUser(user, 'github')
}

/** Friendly label for post-OAuth toast (e.g. "Gmail"). */
export function toolkitLabel(toolkit: string): string {
  const t = toolkit.toLowerCase()
  if (isMvpToolkit(t)) return TOOLKIT_LABELS[t]
  return toolkit
}
