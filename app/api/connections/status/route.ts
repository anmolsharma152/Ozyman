import { NextResponse } from 'next/server'
import { getSessionUser } from '@/app/lib/auth'
import { getConnectionsSnapshot, isComposioConfigured } from '@/lib/composio'

/**
 * GET /api/connections/status
 * Thin HTTP wrapper over getConnectionsSnapshot.
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

  const snapshot = await getConnectionsSnapshot(user)
  return NextResponse.json(snapshot)
}
