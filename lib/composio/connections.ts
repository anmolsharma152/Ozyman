import 'server-only'

import { createInsForgeServerClient } from '@/app/lib/insforge/server'
import { getComposioClient } from './client'
import {
  isAuthKeyError,
  parseCliJsonObject,
  runComposioCli,
  scrubComposioError,
  shouldPreferComposioCli,
} from './cli'
import {
  MVP_TOOLKITS,
  TOOLKIT_LABELS,
  type ConnectionStatus,
  type MvpToolkit,
  type ToolkitConnection,
} from './types'

/**
 * Map Composio connected-account status → Ozyman mirror status.
 */
export function mapComposioStatus(
  status: string | null | undefined,
): ConnectionStatus {
  if (!status) return 'missing'
  const s = status.toUpperCase()
  if (s === 'ACTIVE') return 'active'
  if (s === 'EXPIRED') return 'expired'
  if (
    s === 'FAILED' ||
    s === 'REVOKED' ||
    s === 'INACTIVE' ||
    s === 'DELETED'
  ) {
    return 'error'
  }
  // INITIALIZING / INITIATED — treat as not ready yet
  if (s === 'INITIALIZING' || s === 'INITIATED') return 'missing'
  return 'error'
}

function emptyConnections(checkedAt: string | null): ToolkitConnection[] {
  return MVP_TOOLKITS.map((toolkit) => ({
    toolkit,
    label: TOOLKIT_LABELS[toolkit],
    status: 'missing' as const,
    composioAccountId: null,
    alias: null,
    lastCheckedAt: checkedAt,
    detail: null,
  }))
}

type CliAccountRow = {
  status?: string
  alias?: string | null
  word_id?: string | null
  id?: string | null
}

/**
 * `composio connections list` → map of toolkit → account rows (ACTIVE preferred).
 * Works with CLI session even when COMPOSIO_API_KEY is a uak_* user key.
 */
async function fetchConnectionsViaCli(
  now: string,
): Promise<ToolkitConnection[]> {
  const base = emptyConnections(now)
  const { stdout, stderr } = await runComposioCli(['connections', 'list'], {
    timeoutMs: 45_000,
  })
  if (stderr?.trim()) {
    console.warn('[composio/connections/cli] stderr', stderr.slice(0, 300))
  }
  const parsed = parseCliJsonObject(stdout) as Record<string, CliAccountRow[]>

  return base.map((row) => {
    const list = Array.isArray(parsed[row.toolkit])
      ? parsed[row.toolkit]
      : []
    if (!list.length) return row

    // Prefer ACTIVE when multiple accounts exist for the same toolkit
    let best = list[0]
    for (const item of list) {
      if (mapComposioStatus(item.status) === 'active') {
        best = item
        break
      }
    }
    const status = mapComposioStatus(best.status)
    return {
      ...row,
      status,
      composioAccountId: best.id ?? best.word_id ?? null,
      alias: best.alias ?? null,
      lastCheckedAt: now,
      detail:
        status === 'active'
          ? null
          : best.status
            ? String(best.status)
            : null,
    }
  })
}

async function fetchConnectionsViaSdk(
  entityId: string,
  now: string,
): Promise<ToolkitConnection[]> {
  const base = emptyConnections(now)
  const composio = getComposioClient()
  const response = await composio.connectedAccounts.list({
    userIds: [entityId],
    toolkitSlugs: [...MVP_TOOLKITS],
  })

  const items = response?.items ?? []
  const byToolkit = new Map<string, (typeof items)[number]>()

  for (const item of items) {
    const slug = (
      item.toolkit?.slug ||
      (item as { toolkitSlug?: string }).toolkitSlug ||
      ''
    )
      .toString()
      .toLowerCase()
    if (!slug) continue
    const existing = byToolkit.get(slug)
    if (!existing || mapComposioStatus(item.status) === 'active') {
      byToolkit.set(slug, item)
    }
  }

  return base.map((row) => {
    const account = byToolkit.get(row.toolkit)
    if (!account) return row

    const status = mapComposioStatus(account.status)
    return {
      ...row,
      status,
      composioAccountId: account.id ?? null,
      alias: (account as { alias?: string | null }).alias ?? null,
      lastCheckedAt: now,
      detail:
        status === 'active'
          ? null
          : (account as { statusReason?: string | null }).statusReason ||
            account.status ||
            null,
    }
  })
}

/**
 * Live status from Composio for the given entity (user_id).
 * Does not require DB — safe when connections table is not applied yet.
 *
 * User API keys (uak_*) fail the SDK with 401 — fall back to
 * `composio connections list` (same session as tool execute CLI fallback).
 */
export async function fetchLiveConnectionStatus(
  entityId: string,
): Promise<ToolkitConnection[]> {
  const now = new Date().toISOString()
  const base = emptyConnections(now)

  if (shouldPreferComposioCli()) {
    try {
      return await fetchConnectionsViaCli(now)
    } catch (err) {
      const message = scrubComposioError(
        err instanceof Error ? err.message : String(err),
      )
      console.error('[composio/connections] CLI list failed', message)
      return base.map((row) => ({
        ...row,
        status: 'error' as const,
        detail: `CLI: ${message}`,
        lastCheckedAt: now,
      }))
    }
  }

  try {
    return await fetchConnectionsViaSdk(entityId, now)
  } catch (err) {
    const message = scrubComposioError(
      err instanceof Error ? err.message : String(err),
    )
    // Only fall back to CLI for user-key local mode — never for project multi-user
    if (isAuthKeyError(err) && shouldPreferComposioCli()) {
      console.warn(
        '[composio/connections] SDK list auth failed — trying CLI fallback',
      )
      try {
        return await fetchConnectionsViaCli(now)
      } catch (cliErr) {
        const cliMsg = scrubComposioError(
          cliErr instanceof Error ? cliErr.message : String(cliErr),
        )
        console.error('[composio/connections] CLI fallback failed', cliMsg)
        return base.map((row) => ({
          ...row,
          status: 'error' as const,
          detail: `Auth/CLI: ${cliMsg}`,
          lastCheckedAt: now,
        }))
      }
    }
    console.error('[composio/connections] list failed', message)
    return base.map((row) => ({
      ...row,
      status: 'error' as const,
      detail: message,
      lastCheckedAt: now,
    }))
  }
}

/**
 * Upsert mirror rows into public.connections (best-effort; soft-fails if
 * migration not applied).
 */
export async function mirrorConnections(
  userId: string,
  connections: ToolkitConnection[],
): Promise<void> {
  try {
    const client = await createInsForgeServerClient()
    const now = new Date().toISOString()

    for (const c of connections) {
      const row = {
        user_id: userId,
        toolkit: c.toolkit,
        status: c.status,
        composio_account_id: c.composioAccountId,
        alias: c.alias,
        last_checked_at: c.lastCheckedAt || now,
        metadata: c.detail ? { detail: c.detail } : {},
      }

      const { error } = await client.database
        .from('connections')
        .upsert([row], { onConflict: 'user_id,toolkit' })

      if (error) {
        // Table missing or RLS — log once style, continue
        console.error(
          '[composio/connections] mirror upsert failed',
          c.toolkit,
          error,
        )
      }
    }
  } catch (err) {
    console.error('[composio/connections] mirror unexpected', err)
  }
}

/**
 * Start OAuth / connect-link for a toolkit under the given entity.
 * Uses toolkits.authorize which creates a managed auth config if needed.
 * Returns a redirect URL the user opens in the browser (never the API key).
 */
export async function startToolkitLink(
  entityId: string,
  toolkit: MvpToolkit,
  callbackUrl?: string,
): Promise<{ redirectUrl: string | null; connectionId: string | null; error: string | null }> {
  try {
    const composio = getComposioClient()

    // Prefer authorize — auto-provisions auth config for the toolkit
    const request = await composio.toolkits.authorize(entityId, toolkit)

    // Some SDK versions expose redirectUrl / redirect_url
    const redirectUrl =
      (request as { redirectUrl?: string | null }).redirectUrl ??
      (request as { redirect_url?: string | null }).redirect_url ??
      null

    const connectionId =
      (request as { id?: string | null }).id ??
      (request as { connectedAccountId?: string | null }).connectedAccountId ??
      null

    // Optional callback is handled by Composio when using link(); authorize
    // may ignore it. Surface URL either way.
    if (!redirectUrl && callbackUrl) {
      // Fall back: try connectedAccounts.link if we can find an auth config
      try {
        const configs = await composio.authConfigs.list({ toolkit })
        const items = configs?.items ?? []
        const authConfigId = items[0]?.id
        if (authConfigId) {
          const linkReq = await composio.connectedAccounts.link(
            entityId,
            authConfigId,
            { callbackUrl },
          )
          return {
            redirectUrl: linkReq.redirectUrl ?? null,
            connectionId: linkReq.id ?? null,
            error: null,
          }
        }
      } catch (linkErr) {
        console.error('[composio/connections] link fallback failed', linkErr)
      }
    }

    if (!redirectUrl) {
      return {
        redirectUrl: null,
        connectionId,
        error:
          'Composio did not return a redirect URL. Try CLI: composio link ' +
          toolkit,
      }
    }

    return { redirectUrl, connectionId, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[composio/connections] authorize failed', toolkit, message)
    return { redirectUrl: null, connectionId: null, error: message }
  }
}

export function isMvpToolkit(value: string): value is MvpToolkit {
  return (MVP_TOOLKITS as readonly string[]).includes(value)
}
