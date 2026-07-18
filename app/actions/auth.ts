'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAuthActions } from '@insforge/sdk/ssr'

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    'http://localhost:3000'
  )
}

/** Start Google OAuth; stores PKCE verifier and redirects to provider. */
export async function signInWithGoogle() {
  const cookieStore = await cookies()
  const auth = createAuthActions({ cookies: cookieStore })
  const { data, error } = await auth.signInWithOAuth('google', {
    redirectTo: new URL('/api/auth/callback', appOrigin()).toString(),
    skipBrowserRedirect: true,
  })

  if (error || !data?.url || !data?.codeVerifier) {
    redirect(
      `/login?error=${encodeURIComponent(error?.message ?? 'oauth_init_failed')}`,
    )
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
