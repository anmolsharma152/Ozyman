import { NextResponse } from 'next/server'
import { getSessionUser } from '@/app/lib/auth'
import { ensureProfile } from '@/lib/profile/ensureProfile'
import {
  fetchLiveConnectionStatus,
  isComposioConfigured,
  mirrorConnections,
  resolveEntityId,
} from '@/lib/composio'

/**
 * GET /api/connections/status
 * Live Composio connection status for Gmail/GitHub/Slack + optional DB mirror.
 * Never returns COMPOSIO_API_KEY.
 */
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isComposioConfigured()) {
    return NextResponse.json(
      {
        error: 'COMPOSIO_API_KEY is not configured on the server',
        configured: false,
        entityId: null,
        entitySource: null,
        connections: [],
      },
      { status: 503 },
    )
  }

  const profile = await ensureProfile(user)
  const { entityId, source } = resolveEntityId(profile, user.id)

  const connections = await fetchLiveConnectionStatus(entityId)
  // Best-effort mirror; soft-fails if migration not applied
  void mirrorConnections(user.id, connections)

  return NextResponse.json({
    configured: true,
    entityId,
    entitySource: source,
    connections,
  })
}
