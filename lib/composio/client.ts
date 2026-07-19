import 'server-only'

import { Composio } from '@composio/core'

/**
 * Server-only Composio SDK client.
 * COMPOSIO_API_KEY must never be NEXT_PUBLIC_* or imported from client components.
 */

let cached: Composio | null = null

export function getComposioApiKey(): string {
  const key = process.env.COMPOSIO_API_KEY?.trim()
  if (!key) {
    throw new Error(
      'COMPOSIO_API_KEY is not set. Add it to .env.local (server only) or InsForge secrets.',
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
  if (cached) return cached

  cached = new Composio({
    apiKey: getComposioApiKey(),
    // Avoid noisy telemetry in personal-OS / CI
    allowTracking: false,
  })
  return cached
}

/** True when COMPOSIO_API_KEY is present (for soft UI messaging). */
export function isComposioConfigured(): boolean {
  return Boolean(process.env.COMPOSIO_API_KEY?.trim())
}
