import { NextResponse, type NextRequest } from 'next/server'
import {
  updateSession,
  type CookieStore,
} from '@insforge/sdk/ssr/middleware'

/**
 * Refresh InsForge session cookies before Server Components render.
 * Keep this import on the /ssr/middleware entry so the middleware bundle
 * does not pull the full SDK client.
 *
 * Auth API routes are excluded from the matcher: /api/auth/refresh already
 * refreshes tokens, and dual refresh can race if the refresh token rotates.
 * OAuth callback has no session yet and does not need updateSession.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request })

  // Next.js RequestCookies/ResponseCookies are structurally compatible at
  // runtime; CookieStore's set signature is slightly stricter in types.
  await updateSession({
    requestCookies: request.cookies as unknown as CookieStore,
    responseCookies: response.cookies as unknown as CookieStore,
  })

  return response
}

export const config = {
  matcher: [
    /*
     * All paths except static assets, image optimization, and auth API
     * (refresh + OAuth callback own their cookie lifecycle).
     */
    '/((?!_next/static|_next/image|favicon.ico|api/auth/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
