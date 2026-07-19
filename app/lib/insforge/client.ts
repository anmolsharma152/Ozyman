import { createBrowserClient } from '@insforge/sdk/ssr'

/**
 * Browser InsForge client (Client Components only).
 * Auth surface is read-only — sign-in/out/OAuth run via server createAuthActions().
 */
export const insforge = createBrowserClient()
