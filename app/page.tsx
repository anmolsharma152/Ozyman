import { getSessionUser } from '@/app/lib/auth'
import { HomeGreeting } from '@/components/home-greeting'
import { KicksCard } from '@/components/kicks-card'
import { ensureProfile } from '@/lib/profile/ensureProfile'
import { getLatestMorningBrief } from '@/lib/brief/latest'
import { withTimeout } from '@/lib/errors'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const user = await getSessionUser()
  let brief = null
  if (user) {
    // Layout already tried ensureProfile; cache() dedupes. Soft-bound brief fetch
    // so a stuck InsForge query never blocks Home forever.
    await ensureProfile(user)
    brief = await withTimeout(
      getLatestMorningBrief(user.id),
      6_000,
      () => null,
    )
  }

  return (
    <>
      <HomeGreeting user={user} />
      {user ? (
        <KicksCard
          brief={
            brief
              ? { payload: brief.payload, createdAt: brief.createdAt }
              : null
          }
        />
      ) : (
        <p className="text-sm text-shell-muted">
          Sign in to get your Top 3 kicks and chat with Ozyman.
        </p>
      )}
    </>
  )
}
