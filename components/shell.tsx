import Link from 'next/link'
import type { SessionUser } from '@/app/lib/auth'
import { signOut } from '@/app/actions/auth'

type ShellProps = {
  user: SessionUser | null
  children: React.ReactNode
}

export function Shell({ user, children }: ShellProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-8 pt-2">
      <header className="flex items-center justify-between gap-3 py-4">
        <Link href="/" className="flex items-center gap-2.5 min-h-11">
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-2xl bg-shell-accent/15 text-lg ring-1 ring-shell-accent/30"
          >
            ◎
          </span>
          <span className="text-base font-semibold tracking-tight text-shell-fg">
            Ozyman
          </span>
        </Link>

        <nav className="flex items-center gap-2">
          {user ? (
            <form action={signOut}>
              <button type="submit" className="btn-ghost min-h-11 px-3 text-shell-muted">
                Sign out
              </button>
            </form>
          ) : (
            <Link href="/login" className="btn-ghost min-h-11 px-3">
              Sign in
            </Link>
          )}
        </nav>
      </header>

      <main className="flex flex-1 flex-col gap-5">{children}</main>

      <footer className="mt-8 text-center text-xs text-shell-muted/70">
        Your operator buddy · private to you
      </footer>
    </div>
  )
}
