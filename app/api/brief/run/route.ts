import { NextResponse } from 'next/server'
import { getSessionUser } from '@/app/lib/auth'
import { ensureProfile } from '@/lib/profile/ensureProfile'
import { runMorningBrief } from '@/lib/brief/run-morning-brief'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/brief/run
 * - Authenticated user session, OR
 * - Header x-cron-secret: CRON_SECRET + body { userId } (for schedules later)
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim()
  const headerSecret = request.headers.get('x-cron-secret')

  let user = await getSessionUser()

  if (!user && cronSecret && headerSecret === cronSecret) {
    // Scheduled path not fully wired — require session for now
    return NextResponse.json(
      { error: 'Cron user targeting not configured yet — use signed-in run' },
      { status: 501 },
    )
  }

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await ensureProfile(user)
  if (!profile) {
    return NextResponse.json({ error: 'Profile not ready' }, { status: 400 })
  }

  try {
    const result = await runMorningBrief({ user, profile })
    return NextResponse.json({
      ok: true,
      payload: result.payload,
      artifactId: result.artifactId,
      threadId: result.threadId,
    })
  } catch (err) {
    console.error('[api/brief/run]', err)
    const message = err instanceof Error ? err.message : 'Brief failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
