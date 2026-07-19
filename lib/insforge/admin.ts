import 'server-only'

import { createAdminClient } from '@insforge/sdk'

/**
 * Privileged InsForge client (API key = admin/service role).
 * Server-only — never import from client components.
 */
export function createInsForgeAdminClient() {
  const baseUrl =
    process.env.INSFORGE_URL?.trim() ||
    process.env.NEXT_PUBLIC_INSFORGE_URL?.trim()
  const apiKey = process.env.INSFORGE_API_KEY?.trim()

  if (!baseUrl || !apiKey) {
    throw new Error(
      'INSFORGE_URL and INSFORGE_API_KEY are required for admin client',
    )
  }

  return createAdminClient({
    baseUrl,
    apiKey,
  })
}

export function hasInsForgeAdmin(): boolean {
  return Boolean(
    process.env.INSFORGE_API_KEY?.trim() &&
      (process.env.INSFORGE_URL?.trim() ||
        process.env.NEXT_PUBLIC_INSFORGE_URL?.trim()),
  )
}
