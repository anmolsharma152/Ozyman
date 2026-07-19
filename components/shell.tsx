'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { SessionUser } from '@/app/lib/auth'

type ShellProps = {
  user: SessionUser | null
  children: React.ReactNode
}

const NAV = [
  { href: '/chat', label: 'Chat' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/settings', label: 'Settings' },
] as const

function navClass(active: boolean): string {
  return active
    ? 'min-h-11 rounded-xl px-3 text-sm font-semibold text-shell-accent'
    : 'min-h-11 rounded-xl px-3 text-sm font-medium text-shell-muted transition hover:text-shell-fg'
}

export function Shell({ user, children }: ShellProps) {
  const pathname = usePathname() || '/'
  const router = useRouter()
  const onHome = pathname === '/'

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-8 pt-2">
      <header className="relative z-20 flex items-center justify-between gap-3 py-4">
        {/*
          Prefer a real document navigation for the brand mark so Home still
          works when a soft RSC transition is stuck on a slow server call.
        */}
        <a
          href="/"
          aria-label="Ozyman home"
          className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl outline-none ring-shell-accent/40 focus-visible:ring-2"
          onClick={(e) => {
            // If already home, force a full reload so a stuck soft-nav recovers
            if (onHome) {
              e.preventDefault()
              window.location.assign('/')
              return
            }
            // Fast client nav when possible
            if (
              e.button === 0 &&
              !e.metaKey &&
              !e.ctrlKey &&
              !e.shiftKey &&
              !e.altKey
            ) {
              e.preventDefault()
              router.push('/')
            }
          }}
        >
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-2xl bg-shell-accent/15 text-lg ring-1 ring-shell-accent/30"
          >
            ◎
          </span>
          <span className="text-base font-semibold tracking-tight text-shell-fg">
            Ozyman
          </span>
        </a>

        <nav className="flex items-center gap-0.5" aria-label="Main">
          {user ? (
            NAV.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={navClass(active)}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              )
            })
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
