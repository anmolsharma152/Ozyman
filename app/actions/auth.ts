'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAuthActions } from '@insforge/sdk/ssr'

/**
 * Public app origin for OAuth redirectTo.
 * Prefer NEXT_PUBLIC_APP_URL; in dev fall back to the request Host so any
 * local port (3000, 3456, …) works without misrouting the callback.
 */
async function appOrigin(): Promise<string> {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  if (raw) return raw

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_APP_URL is required in production for OAuth redirects',
    )
  }

  try {
    const h = await headers()
    const host = h.get('x-forwarded-host') ?? h.get('host')
    const proto = h.get('x-forwarded-proto') ?? 'http'
    if (host) return `${proto}://${host}`
  } catch {
    // headers() unavailable outside a request — fall through
  }

  return 'http://localhost:3000'
}

/** Start Google OAuth; stores PKCE verifier and redirects to provider. */
export async function signInWithGoogle() {
  let origin: string
  try {
    origin = await appOrigin()
  } catch (err) {
    console.error('OAuth misconfigured', err)
    redirect('/login?error=misconfigured')
  }

  const cookieStore = await cookies()
  const auth = createAuthActions({ cookies: cookieStore })
  const { data, error } = await auth.signInWithOAuth('google', {
    redirectTo: new URL('/api/auth/callback', origin).toString(),
    skipBrowserRedirect: true,
  })

  if (error || !data?.url || !data?.codeVerifier) {
    // Opaque code only — never put provider messages in the query string.
    console.error('OAuth init failed', error?.message ?? 'missing url/codeVerifier')
    redirect('/login?error=oauth_init_failed')
  }

  cookieStore.set('insforge_code_verifier', data.codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })

  redirect(data.url)
}

/** Email/password sign-in (optional fallback). */
export async function signInWithPassword(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  const auth = createAuthActions({ cookies: await cookies() })
  const { data, error } = await auth.signInWithPassword({ email, password })

  if (error || !data?.user) {
    return {
      error: error?.message ?? 'Sign in failed. Check your email and password.',
    }
  }

  redirect('/')
}

export async function signOut() {
  const auth = createAuthActions({ cookies: await cookies() })
  await auth.signOut()
  redirect('/login')
}
