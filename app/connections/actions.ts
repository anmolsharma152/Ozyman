'use server'

import { getSessionUser } from '@/app/lib/auth'
import {
  getConnectionsSnapshot,
  linkToolkitForUser,
  runGithubSmokeForUser,
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
    }
  }
  return getConnectionsSnapshot(user)
}

export async function linkToolkitAction(toolkit: string): Promise<LinkResult> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: 'Unauthorized' }
  return linkToolkitForUser(user, toolkit)
}

export async function verifyGithubAction(): Promise<SmokeResult> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: 'Unauthorized', needsRelink: true }
  return runGithubSmokeForUser(user)
}

/** Re-export for client type imports only (erased at compile). */
export type { ToolkitConnection }
