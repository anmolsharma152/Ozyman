import { NextResponse } from 'next/server'
import { getSessionUser } from '@/app/lib/auth'
import { isComposioConfigured, isMvpToolkit, linkToolkitForUser } from '@/lib/composio'

type RouteContext = {
  params: Promise<{ toolkit: string }>
}

/**
 * POST /api/connections/[toolkit]/link
 * Thin HTTP wrapper over linkToolkitForUser (shared with server actions).
 * Returns a redirect URL only — never the API key.
 */
export async function POST(_request: Request, context: RouteContext) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { toolkit: raw } = await context.params
  const toolkit = raw?.toLowerCase()

  if (!toolkit || !isMvpToolkit(toolkit)) {
    return NextResponse.json(
      { error: 'Unknown toolkit. Use gmail, github, or slack.' },
      { status: 400 },
    )
  }

  if (!isComposioConfigured()) {
    return NextResponse.json(
      { error: 'COMPOSIO_API_KEY is not configured on the server' },
      { status: 503 },
    )
  }

  const result = await linkToolkitForUser(user, toolkit)

  if (!result.ok || !result.redirectUrl) {
    return NextResponse.json(
      {
        error: result.error || 'Could not start link',
        entityId: result.entityId,
        toolkit,
        cliHint: result.cliHint || `composio link ${toolkit}`,
      },
      { status: result.error?.includes('not configured') ? 503 : 502 },
    )
  }

  return NextResponse.json({
    toolkit,
    entityId: result.entityId,
    redirectUrl: result.redirectUrl,
    connectionId: result.connectionId ?? null,
    cliHint: result.cliHint,
  })
}
