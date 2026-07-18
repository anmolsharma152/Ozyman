import { NextResponse } from 'next/server'
import { getSessionUser } from '@/app/lib/auth'
import { ensureProfile } from '@/lib/profile/ensureProfile'
import {
  executeTool,
  fetchLiveConnectionStatus,
  GITHUB_SMOKE_SLUG,
  isComposioConfigured,
  mirrorConnections,
  persistEntityId,
  resolveEntityId,
} from '@/lib/composio'

/**
 * POST /api/connections/smoke
 * Smoke-test: GITHUB_GET_THE_AUTHENTICATED_USER for the profile entity.
 * On success: persist entity + mirror github active.
 * On failure: return re-link guidance (first-class path).
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

  const profile = await ensureProfile(user)
  const { entityId, source } = resolveEntityId(profile, user.id)

  // Ensure entity is stored before smoke so later chat/brief share it
  await persistEntityId(user.id, entityId, {
    force: source === 'env_default' || source === 'user_id',
  })

  const result = await executeTool(GITHUB_SMOKE_SLUG, entityId, {})

  if (result.successful) {
    await persistEntityId(user.id, entityId, { force: true })

    // Refresh live status + mirror
    const connections = await fetchLiveConnectionStatus(entityId)
    void mirrorConnections(user.id, connections)

    const login =
      (result.data?.login as string | undefined) ||
      (result.data?.username as string | undefined) ||
      null

    return NextResponse.json({
      ok: true,
      entityId,
      entitySource: source,
      slug: GITHUB_SMOKE_SLUG,
      githubLogin: login,
      data: result.data
        ? {
            login: result.data.login ?? null,
            name: result.data.name ?? null,
            id: result.data.id ?? null,
          }
        : null,
      needsRelink: false,
      connections,
    })
  }

  // Failure → force re-link onboarding (do not soft-fail forever)
  const connections = await fetchLiveConnectionStatus(entityId)
  void mirrorConnections(user.id, connections)

  return NextResponse.json(
    {
      ok: false,
      entityId,
      entitySource: source,
      slug: GITHUB_SMOKE_SLUG,
      error: result.error || 'GitHub smoke failed',
      needsRelink: true,
      connections,
      cliHint: 'composio link github',
    },
    { status: 422 },
  )
}
