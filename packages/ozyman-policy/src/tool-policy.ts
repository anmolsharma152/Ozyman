/**
 * Canonical tool policy seed for Ozyman.
 *
 * Deno morning-brief (PR-08) must copy BRIEF_TOOL_SLUGS + relevant rows —
 * comment there: keep in sync with packages/ozyman-policy.
 *
 * Hard-coded map (no action_policies table in MVP).
 * Design: docs/design-ozyman-personal-operator-os.md Appendix B.
 */

export type GateDecision = 'allow' | 'require_confirmation' | 'deny'

export type AgentMode = 'chat' | 'brief' | 'job_prepare'

export type ToolRisk = 'low' | 'medium' | 'high' | 'irreversible'

export interface ToolPolicy {
  slug: string
  defaultGate: GateDecision
  risk: ToolRisk
  /** Modes in which this slug is allowlisted. Absent mode → deny. */
  modes: AgentMode[]
}

/**
 * Full seed map. Unknown slugs resolve to deny at policy.resolve time.
 */
export const TOOL_POLICIES: readonly ToolPolicy[] = [
  // --- Gmail read ---
  {
    slug: 'GMAIL_FETCH_EMAILS',
    defaultGate: 'allow',
    risk: 'low',
    modes: ['chat', 'brief'],
  },
  {
    slug: 'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID',
    defaultGate: 'allow',
    risk: 'low',
    modes: ['chat', 'brief'],
  },
  {
    slug: 'GMAIL_LIST_LABELS',
    defaultGate: 'allow',
    risk: 'low',
    modes: ['chat', 'brief'],
  },
  // --- Gmail write (chat only, gated) ---
  {
    slug: 'GMAIL_SEND_EMAIL',
    defaultGate: 'require_confirmation',
    risk: 'irreversible',
    modes: ['chat'],
  },
  {
    slug: 'GMAIL_CREATE_EMAIL_DRAFT',
    defaultGate: 'require_confirmation',
    risk: 'high',
    modes: ['chat'],
  },
  // --- GitHub read ---
  {
    slug: 'GITHUB_GET_THE_AUTHENTICATED_USER',
    defaultGate: 'allow',
    risk: 'low',
    modes: ['chat', 'brief'],
  },
  {
    slug: 'GITHUB_LIST_PULL_REQUESTS',
    defaultGate: 'allow',
    risk: 'low',
    modes: ['chat', 'brief'],
  },
  {
    slug: 'GITHUB_FIND_PULL_REQUESTS',
    defaultGate: 'allow',
    risk: 'low',
    modes: ['chat', 'brief'],
  },
  {
    slug: 'GITHUB_GET_A_PULL_REQUEST',
    defaultGate: 'allow',
    risk: 'low',
    modes: ['chat', 'brief'],
  },
  {
    slug: 'GITHUB_FIND_REPOSITORIES',
    defaultGate: 'allow',
    risk: 'low',
    modes: ['chat'],
  },
  {
    slug: 'GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER',
    defaultGate: 'allow',
    risk: 'low',
    modes: ['chat', 'brief'],
  },
  // --- GitHub write (chat only, gated) ---
  {
    slug: 'GITHUB_CREATE_AN_ISSUE_COMMENT',
    defaultGate: 'require_confirmation',
    risk: 'high',
    modes: ['chat'],
  },
  {
    slug: 'GITHUB_CREATE_A_REVIEW_COMMENT_FOR_A_PULL_REQUEST',
    defaultGate: 'require_confirmation',
    risk: 'high',
    modes: ['chat'],
  },
  // --- Slack ---
  {
    slug: 'SLACK_FIND_CHANNELS',
    defaultGate: 'allow',
    risk: 'low',
    modes: ['chat'],
  },
  {
    slug: 'SLACK_SEND_MESSAGE',
    defaultGate: 'require_confirmation',
    risk: 'irreversible',
    modes: ['chat'],
  },
] as const

/** MVP brief gather allowlist — exact set only; never send/write tools. */
export const BRIEF_TOOL_SLUGS: readonly string[] = [
  'GMAIL_FETCH_EMAILS',
  'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID',
  'GMAIL_LIST_LABELS',
  'GITHUB_GET_THE_AUTHENTICATED_USER',
  'GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER',
  'GITHUB_LIST_PULL_REQUESTS',
  'GITHUB_FIND_PULL_REQUESTS',
  'GITHUB_GET_A_PULL_REQUEST',
] as const

const policyBySlug = new Map<string, ToolPolicy>(
  TOOL_POLICIES.map((p) => [p.slug, p]),
)

export interface PolicyResolveResult {
  slug: string
  gate: GateDecision
  policy: ToolPolicy | null
  reason?: string
}

/**
 * Resolve a tool slug for a mode.
 * Unknown slug or mode not in policy.modes → deny.
 */
export function resolveToolPolicy(
  slug: string,
  mode: AgentMode,
): PolicyResolveResult {
  const policy = policyBySlug.get(slug) ?? null
  if (!policy) {
    return {
      slug,
      gate: 'deny',
      policy: null,
      reason: 'unknown_slug',
    }
  }
  if (!policy.modes.includes(mode)) {
    return {
      slug,
      gate: 'deny',
      policy,
      reason: 'mode_not_allowed',
    }
  }
  return {
    slug,
    gate: policy.defaultGate,
    policy,
  }
}

/** Tool schemas the model may see for a mode (allow + require_confirmation). */
export function allowlistedSlugsForMode(mode: AgentMode): string[] {
  return TOOL_POLICIES.filter(
    (p) => p.modes.includes(mode) && p.defaultGate !== 'deny',
  ).map((p) => p.slug)
}

export function isBriefAllowlisted(slug: string): boolean {
  return (BRIEF_TOOL_SLUGS as readonly string[]).includes(slug)
}
