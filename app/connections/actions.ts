'use server'

import { getSessionUser } from '@/app/lib/auth'
import { ensureProfile } from '@/lib/profile/ensureProfile'
import {
  executeTool,
  fetchLiveConnectionStatus,
  GITHUB_SMOKE_SLUG,
  isComposioConfigured,
  isMvpToolkit,
  mirrorConnections,
  persistEntityId,
  resolveEntityId,
  startToolkitLink,
  type ToolkitConnection,
} from '@/lib/composio'

export type ConnectionsPageData = {
  configured: boolean
  entityId: string | null
  entitySource: string | null
  connections: ToolkitConnection[]
  configError: string | null
}

export async function loadConnectionsData(): Promise<ConnectionsPageData> {
  const user = await getSessionUser()
  if (!user) {
    return {
      configured: false,
      entityId: null,
      entitySource: null,
      connections: [],
      configError: 'Sign in to manage connections.',
    }
  }

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

export type LinkResult = {
  ok: boolean
  redirectUrl?: string | null
  error?: string | null
  cliHint?: string
  entityId?: string
}

export async function linkToolkitAction(toolkit: string): Promise<LinkResult> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: 'Unauthorized' }

  const t = toolkit.toLowerCase()
  if (!isMvpToolkit(t)) {
    return { ok: false, error: 'Unknown toolkit' }
  }

  if (!isComposioConfigured()) {
    return {
      ok: false,
      error: 'COMPOSIO_API_KEY is not configured',
      cliHint: `composio link ${t}`,
    }
  }

  const profile = await ensureProfile(user)
  const { entityId, source } = resolveEntityId(profile, user.id)
  await persistEntityId(user.id, entityId, {
    force: source === 'user_id' || source === 'env_default',
  })

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    'http://localhost:3000'
  const callbackUrl = `${appUrl}/connections?linked=${t}`

  const result = await startToolkitLink(entityId, t, callbackUrl)

  if (!result.redirectUrl) {
    return {
      ok: false,
      error:
        result.error ||
        'No OAuth URL from Composio. Use the CLI hint below.',
      cliHint: `composio link ${t}`,
      entityId,
    }
  }

  return {
    ok: true,
    redirectUrl: result.redirectUrl,
    entityId,
    cliHint: `composio link ${t}`,
  }
}

export type SmokeResult = {
  ok: boolean
  error?: string | null
  githubLogin?: string | null
  needsRelink?: boolean
  entityId?: string | null
  cliHint?: string
  connections?: ToolkitConnection[]
}

export async function verifyGithubAction(): Promise<SmokeResult> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: 'Unauthorized', needsRelink: true }

  if (!isComposioConfigured()) {
    return {
      ok: false,
      error: 'COMPOSIO_API_KEY is not configured',
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
      connections,
    }
  }

  return {
    ok: false,
    error: result.error || 'GitHub smoke failed',
    needsRelink: true,
    entityId,
    cliHint: 'composio link github',
    connections,
  }
}
