import { NextResponse } from 'next/server'
import { getSessionUser } from '@/app/lib/auth'
import { isComposioConfigured, runGithubSmokeForUser } from '@/lib/composio'

/**
 * POST /api/connections/smoke
 * Thin HTTP wrapper over runGithubSmokeForUser (shared with server actions).
 */
export async function POST() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isComposioConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'COMPOSIO_API_KEY is not configured on the server',
        needsRelink: true,
      },
      { status: 503 },
    )
  }

  const result = await runGithubSmokeForUser(user)

  if (result.ok) {
    return NextResponse.json(result)
  }

  return NextResponse.json(result, {
    status: result.error?.includes('not configured') ? 503 : 422,
  })
}
