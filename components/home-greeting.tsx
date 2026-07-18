import Link from 'next/link'
import type { SessionUser } from '@/app/lib/auth'

function timeGreeting(): string {
  // IST-ish default for personal OS; fine for placeholder until profiles.timezone
  const hour = new Date().getHours()
  if (hour < 12) return 'Morning'
  if (hour < 17) return 'Afternoon'
  return 'Evening'
}

type HomeGreetingProps = {
  user: SessionUser | null
}

export function HomeGreeting({ user }: HomeGreetingProps) {
  const displayName =
    user?.name?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    null

  return (
    <section className="space-y-2 pt-2">
      <p className="text-sm font-medium uppercase tracking-wider text-shell-accent">
        {user ? timeGreeting() : 'Hey'}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-shell-fg sm:text-4xl">
        {user ? (
          <>
            {timeGreeting()}.
            {displayName ? (
              <>
                {' '}
                <span className="text-shell-accent">{displayName}</span>.
              </>
            ) : null}
          </>
        ) : (
          <>
            Hey — I&apos;m{' '}
            <span className="text-shell-accent">Ozyman</span>
          </>
        )}
      </h1>
      <p className="max-w-prose text-base leading-relaxed text-shell-muted">
        {user
          ? "I'm in your corner. Here's what actually matters today — once we have a brief."
          : 'Your private career + life operator buddy. Sign in and I’ll prioritize the Top 3 kicks that matter.'}
      </p>
      {!user ? (
        <div className="pt-2">
          <Link href="/login" className="btn-primary max-w-xs">
            Sign in with Google
          </Link>
        </div>
      ) : null}
    </section>
  )
}
