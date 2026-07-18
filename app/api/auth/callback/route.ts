import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { createAuthActions } from '@insforge/sdk/ssr'

/**
 * OAuth callback: exchange insforge_code + PKCE verifier for session cookies.
 * Refresh token lands httpOnly; access token is browser-readable per SSR skill.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('insforge_code')
  const oauthError = request.nextUrl.searchParams.get('error')

  if (oauthError || !code) {
    if (oauthError) {
      console.warn('OAuth callback failed', { error: oauthError })
    }
    return NextResponse.redirect(
      new URL('/login?error=oauth_failed', request.url),
    )
  }

  const cookieStore = await cookies()
  const codeVerifier = cookieStore.get('insforge_code_verifier')?.value
  if (!codeVerifier) {
    return NextResponse.redirect(
      new URL('/login?error=missing_verifier', request.url),
    )
  }

  const response = NextResponse.redirect(new URL('/', request.url))
  const auth = createAuthActions({
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  })
  const { data, error } = await auth.exchangeOAuthCode(code, codeVerifier)

  // createAuthActions strips tokens from the return value (cookies already set).
  if (error || !data?.user) {
    if (error) {
      console.error('OAuth code exchange failed', error)
    }
    return NextResponse.redirect(
      new URL('/login?error=exchange_failed', request.url),
    )
  }

  // Mirror set options from signInWithGoogle (path: '/') so the cookie clears.
  response.cookies.set('insforge_code_verifier', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}
