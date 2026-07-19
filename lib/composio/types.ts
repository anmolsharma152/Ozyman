/**
 * Composio toolkit + connection types used by server client and UI.
 * Provider OAuth tokens never live here — only status mirrors.
 */

export const MVP_TOOLKITS = ['gmail', 'github', 'slack'] as const

export type MvpToolkit = (typeof MVP_TOOLKITS)[number]

export type ConnectionStatus = 'active' | 'expired' | 'missing' | 'error'

export type ToolkitConnection = {
  toolkit: MvpToolkit
  label: string
  status: ConnectionStatus
  composioAccountId: string | null
  alias: string | null
  lastCheckedAt: string | null
  /** Short human message (e.g. smoke error); never secrets */
  detail: string | null
}

export type ExecuteToolResult = {
  successful: boolean
  data: Record<string, unknown> | null
  error: string | null
}

export const TOOLKIT_LABELS: Record<MvpToolkit, string> = {
  gmail: 'Gmail',
  github: 'GitHub',
  slack: 'Slack',
}

/** Smoke slug for GitHub connectivity (PR-05 acceptance). */
export const GITHUB_SMOKE_SLUG = 'GITHUB_GET_THE_AUTHENTICATED_USER'

/** Read-only smoke tools per MVP toolkit (prove link works end-to-end). */
export const TOOLKIT_SMOKE: Record<
  MvpToolkit,
  { slug: string; args: Record<string, unknown>; label: string }
> = {
  github: {
    slug: GITHUB_SMOKE_SLUG,
    args: {},
    label: 'GitHub profile',
  },
  gmail: {
    slug: 'GMAIL_FETCH_EMAILS',
    args: { query: 'in:inbox', max_results: 1, verbose: false },
    label: 'Gmail inbox peek',
  },
  slack: {
    slug: 'SLACK_FIND_CHANNELS',
    args: { limit: 3 },
    label: 'Slack channels',
  },
}
