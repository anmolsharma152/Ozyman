import { NextResponse } from 'next/server'
import { getSessionUser } from '@/app/lib/auth'
import { ensureProfile } from '@/lib/profile/ensureProfile'
import {
  isComposioConfigured,
  isMvpToolkit,
  persistEntityId,
  resolveEntityId,
  startToolkitLink,
} from '@/lib/composio'

type RouteContext = {
  params: Promise<{ toolkit: string }>
}

/**
 * POST /api/connections/[toolkit]/link
 * Starts Composio OAuth / connect-link for the user's entity.
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

  const profile = await ensureProfile(user)
  const { entityId, source } = resolveEntityId(profile, user.id)

  // Persist entity so subsequent tool calls use the same identity
  await persistEntityId(user.id, entityId, {
    force: source === 'user_id' || source === 'env_default',
  })

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    'http://localhost:3000'
  const callbackUrl = `${appUrl}/connections?linked=${toolkit}`

  const result = await startToolkitLink(entityId, toolkit, callbackUrl)

  if (result.error && !result.redirectUrl) {
    return NextResponse.json(
      {
        error: result.error,
        entityId,
        toolkit,
        /** CLI fallback instructions for the UI */
        cliHint: `composio link ${toolkit}`,
      },
      { status: 502 },
    )
  }

  return NextResponse.json({
    toolkit,
    entityId,
    redirectUrl: result.redirectUrl,
    connectionId: result.connectionId,
    cliHint: `composio link ${toolkit}`,
  })
}
