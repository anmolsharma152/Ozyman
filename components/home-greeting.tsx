import Link from 'next/link'
import type { SessionUser } from '@/app/lib/auth'

/** Default operator timezone until profiles.timezone exists (PR-10). */
const DEFAULT_TZ = 'Asia/Kolkata'

function timeGreeting(timeZone = DEFAULT_TZ): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: false,
      timeZone,
    }).format(new Date()),
  )
  if (hour < 12) return 'Morning'
  if (hour < 17) return 'Afternoon'
  return 'Evening'
}

type HomeGreetingProps = {
  user: SessionUser | null
}

export function HomeGreeting({ user }: HomeGreetingProps) {
  const greeting = timeGreeting()
  const displayName =
    user?.name?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    null

  return (
    <section className="space-y-2 pt-2">
      <p className="text-sm font-medium uppercase tracking-wider text-shell-accent">
        {user ? greeting : 'Hey'}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-shell-fg sm:text-4xl">
        {user ? (
          <>
            {greeting}.
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
          ? "I'm in your corner. Top 3 kicks below — refresh the brief or jump into chat anytime."
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
