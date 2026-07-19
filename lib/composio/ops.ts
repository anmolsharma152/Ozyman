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
import { persistEntityId, resolveEntityId } from './entity'
import {
  GITHUB_SMOKE_SLUG,
  TOOLKIT_LABELS,
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
  needsRelink?: boolean
  entityId?: string | null
  entitySource?: string | null
  slug?: string
  cliHint?: string
  connections?: ToolkitConnection[]
  data?: { login: unknown; name: unknown; id: unknown } | null
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
  if (!isComposioConfigured()) {
    return {
      configured: false,
      entityId: null,
      entitySource: null,
      connections: [],
      configError:
        'COMPOSIO_API_KEY is not set on the server. Add it to .env.local (never NEXT_PUBLIC_*).',
    }
  }

  const profile = await ensureProfile(user)
  const { entityId, source } = resolveEntityId(profile, user.id)
  const connections = await fetchLiveConnectionStatus(entityId)
  void mirrorConnections(user.id, connections)

  return {
    configured: true,
    entityId,
    entitySource: source,
    connections,
    configError: null,
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
  const { entityId, source } = resolveEntityId(profile, user.id)
  await persistEntityId(user.id, entityId, {
    force: source === 'user_id' || source === 'env_default',
  })

  const callbackUrl = `${appOrigin()}/connections?linked=${toolkit}`
  const result = await startToolkitLink(entityId, toolkit, callbackUrl)

  if (!result.redirectUrl) {
    return {
      ok: false,
      error: publicErrorMessage(
        result.error,
        'No OAuth URL from Composio. Use the CLI hint below.',
      ),
      cliHint: `composio link ${toolkit}`,
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
    cliHint: `composio link ${toolkit}`,
  }
}

export async function runGithubSmokeForUser(
  user: SessionUser,
): Promise<SmokeOpResult> {
  if (!isComposioConfigured()) {
    return {
      ok: false,
      error: 'COMPOSIO_API_KEY is not configured on the server',
      needsRelink: true,
      cliHint: 'composio link github',
    }
  }

  const profile = await ensureProfile(user)
  const { entityId, source } = resolveEntityId(profile, user.id)
  await persistEntityId(user.id, entityId, {
    force: source === 'env_default' || source === 'user_id',
  })

  const result = await executeTool(GITHUB_SMOKE_SLUG, entityId, {})
  const connections = await fetchLiveConnectionStatus(entityId)
  void mirrorConnections(user.id, connections)

  if (result.successful) {
    await persistEntityId(user.id, entityId, { force: true })
    const login =
      (result.data?.login as string | undefined) ||
      (result.data?.username as string | undefined) ||
      null
    return {
      ok: true,
      githubLogin: login,
      needsRelink: false,
      entityId,
      entitySource: source,
      slug: GITHUB_SMOKE_SLUG,
      connections,
      data: result.data
        ? {
            login: result.data.login ?? null,
            name: result.data.name ?? null,
            id: result.data.id ?? null,
          }
        : null,
    }
  }

  return {
    ok: false,
    error: publicErrorMessage(result.error, 'GitHub smoke failed'),
    needsRelink: true,
    entityId,
    entitySource: source,
    slug: GITHUB_SMOKE_SLUG,
    cliHint: 'composio link github',
    connections,
  }
}

/** Friendly label for post-OAuth toast (e.g. "Gmail"). */
export function toolkitLabel(toolkit: string): string {
  const t = toolkit.toLowerCase()
  if (isMvpToolkit(t)) return TOOLKIT_LABELS[t]
  return toolkit
}
