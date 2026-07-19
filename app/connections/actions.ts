'use server'

import { getSessionUser } from '@/app/lib/auth'
import {
  getConnectionsSnapshot,
  linkToolkitForUser,
  runToolkitSmokeForUser,
  type ConnectionsSnapshot,
  type LinkOpResult,
  type SmokeOpResult,
  type ToolkitConnection,
} from '@/lib/composio'

export type ConnectionsPageData = ConnectionsSnapshot

export type LinkResult = LinkOpResult

export type SmokeResult = SmokeOpResult

export async function loadConnectionsData(): Promise<ConnectionsPageData> {
  const user = await getSessionUser()
  if (!user) {
    return {
      configured: false,
      entityId: null,
      entitySource: null,
      connections: [],
      configError: 'Sign in to manage connections.',
      composioMode: 'not configured',
      composioKeyKind: 'missing',
      isProjectMode: false,
      setupHint:
        'Sign in, then set a Composio project API key (ak_…) for multi-user deploys.',
    }
  }
  return getConnectionsSnapshot(user)
}

export async function linkToolkitAction(toolkit: string): Promise<LinkResult> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: 'Unauthorized' }
  return linkToolkitForUser(user, toolkit)
}

/** Verify any MVP toolkit with a read-only smoke tool. */
export async function verifyToolkitAction(
  toolkit: string,
): Promise<SmokeResult> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: 'Unauthorized', needsRelink: true }
  return runToolkitSmokeForUser(user, toolkit)
}

/** Back-compat alias for older UI. */
export async function verifyGithubAction(): Promise<SmokeResult> {
  return verifyToolkitAction('github')
}

/** Re-export for client type imports only (erased at compile). */
export type { ToolkitConnection }
