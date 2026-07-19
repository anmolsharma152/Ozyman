import 'server-only'

import { Composio } from '@composio/core'
import { getComposioKeyKind, getComposioMode } from './mode'

/**
 * Server-only Composio SDK client.
 * COMPOSIO_API_KEY must never be NEXT_PUBLIC_* or imported from client components.
 *
 * Production: use a **project** API key from
 * https://dashboard.composio.dev/settings (typically `ak_…`).
 * User keys (`uak_…`) are local-CLI only and are rejected for multi-user deploys.
 */

let cached: Composio | null = null
let cachedKey: string | null = null

export function getComposioApiKey(): string {
  const key = process.env.COMPOSIO_API_KEY?.trim()
  if (!key) {
    throw new Error(
      'COMPOSIO_API_KEY is not set. Add a project API key from https://dashboard.composio.dev/settings to .env.local or InsForge secrets (server only).',
    )
  }
  return key
}

/**
 * Lazy singleton Composio client for Next server routes / actions.
 * Not safe for Deno edge — edge functions should construct their own client
 * with Deno.env.get('COMPOSIO_API_KEY').
 */
export function getComposioClient(): Composio {
  const key = getComposioApiKey()
  if (cached && cachedKey === key) return cached

  if (getComposioKeyKind() === 'user') {
    console.warn(
      '[composio/client] COMPOSIO_API_KEY is a user key (uak_*). SDK calls often 401; use a project key (ak_*) for multi-user / cloud.',
    )
  }

  cached = new Composio({
    apiKey: key,
    allowTracking: false,
  })
  cachedKey = key
  return cached
}

/** True when COMPOSIO_API_KEY is present (for soft UI messaging). */
export function isComposioConfigured(): boolean {
  return Boolean(process.env.COMPOSIO_API_KEY?.trim())
}

/** True when key looks like a deployable project key (not uak_). */
export function isComposioProjectReady(): boolean {
  const mode = getComposioMode()
  return mode.isProjectMode && mode.kind !== 'missing'
}

/** Reset client (tests / after env change in same process). */
export function resetComposioClient(): void {
  cached = null
  cachedKey = null
}
