import { cookies } from 'next/headers'
import { createServerClient } from '@insforge/sdk/ssr'

/**
 * Server InsForge client for Server Components, Route Handlers, and Server Actions.
 * Reads the access-token cookie as the per-request bearer; refresh stays server-owned.
 */
export async function createInsForgeServerClient() {
  return createServerClient({
    cookies: await cookies(),
  })
}
