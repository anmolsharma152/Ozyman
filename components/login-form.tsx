'use client'

import { useActionState, useState } from 'react'
import { signInWithGoogle, signInWithPassword } from '@/app/actions/auth'

const ERROR_COPY: Record<string, string> = {
  oauth_failed: 'Google sign-in didn’t complete. Try again?',
  missing_verifier: 'OAuth session expired. Start sign-in again.',
  exchange_failed: 'Couldn’t finish Google sign-in. Try once more.',
  oauth_init_failed: 'Couldn’t start Google sign-in. Check InsForge OAuth config.',
  misconfigured: 'App URL isn’t configured. Set NEXT_PUBLIC_APP_URL and try again.',
}

const FALLBACK_ERROR = 'Something went wrong signing in. Try again?'

type LoginFormProps = {
  errorCode?: string | null
}

export function LoginForm({ errorCode }: LoginFormProps) {
  const [state, formAction, passwordPending] = useActionState(
    signInWithPassword,
    null,
  )
  // Sticky until navigation — blocks double-submit of Google OAuth init.
  const [oauthPending, setOauthPending] = useState(false)
  const busy = passwordPending || oauthPending

  // Only known opaque codes — never surface raw provider messages from the query string.
  const banner =
    (errorCode && (ERROR_COPY[errorCode] ?? FALLBACK_ERROR)) ||
    state?.error ||
    null

  return (
    <div className="card space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-shell-muted">
          Sign in so Ozyman can work across your accounts (safely).
        </p>
      </div>

      {banner ? (
        <div
          role="alert"
          className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          {banner}
        </div>
      ) : null}

      <form
        action={signInWithGoogle}
        onSubmit={() => {
          setOauthPending(true)
        }}
      >
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          <GoogleIcon />
          {oauthPending ? 'Redirecting to Google…' : 'Continue with Google'}
        </button>
      </form>

      <div className="relative flex items-center gap-3">
        <div className="h-px flex-1 bg-shell-border" />
        <span className="text-xs uppercase tracking-wide text-shell-muted">
          or email
        </span>
        <div className="h-px flex-1 bg-shell-border" />
      </div>

      <form action={formAction} className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-shell-muted">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={busy}
            className="min-h-12 w-full rounded-2xl border border-shell-border bg-shell-surface px-4 text-base text-shell-fg outline-none ring-shell-accent/40 placeholder:text-shell-muted/60 focus:ring-2 disabled:opacity-60"
            placeholder="you@example.com"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-shell-muted">Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
            className="min-h-12 w-full rounded-2xl border border-shell-border bg-shell-surface px-4 text-base text-shell-fg outline-none ring-shell-accent/40 placeholder:text-shell-muted/60 focus:ring-2 disabled:opacity-60"
            placeholder="••••••••"
          />
        </label>
        <button type="submit" className="btn-ghost w-full" disabled={busy}>
          {passwordPending ? 'Signing in…' : 'Sign in with email'}
        </button>
      </form>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden
      className="shrink-0"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  )
}
