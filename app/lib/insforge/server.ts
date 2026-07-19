import { cookies } from 'next/headers'
import { createServerClient } from '@insforge/sdk/ssr'

/**
 * Server InsForge client for Server Components, Route Handlers, and Server Actions.
 * Reads the access-token cookie as the per-request bearer; refresh stays server-owned.
 * baseUrl/anonKey are passed explicitly so misconfigured env fails fast and clearly.
 */
export async function createInsForgeServerClient() {
  const baseUrl =
    process.env.NEXT_PUBLIC_INSFORGE_URL?.trim() ||
    process.env.INSFORGE_URL?.trim() ||
    undefined
  const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY?.trim() || undefined

  return createServerClient({
    cookies: await cookies(),
    ...(baseUrl ? { baseUrl } : {}),
    ...(anonKey ? { anonKey } : {}),
  })
}
