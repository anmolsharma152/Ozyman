import { NextResponse, type NextRequest } from 'next/server'
import {
  updateSession,
  type CookieStore,
} from '@insforge/sdk/ssr/middleware'

/**
 * Refresh InsForge session cookies before Server Components render.
 * Keep this import on the /ssr/middleware entry so the middleware bundle
 * does not pull the full SDK client.
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
     * Match all request paths except static assets and image optimization.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
