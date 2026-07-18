/**
 * Next interactive policy resolve — thin wrapper over @ozyman/policy.
 * Node/Next only; Deno copies the allowlist table instead of importing this file.
 */

import {
  type AgentMode,
  type GateDecision,
  type PolicyResolveResult,
  type ToolPolicy,
  allowlistedSlugsForMode,
  resolveToolPolicy,
  TOOL_POLICIES,
  BRIEF_TOOL_SLUGS,
} from '@ozyman/policy'

export type { AgentMode, GateDecision, PolicyResolveResult, ToolPolicy }
export { TOOL_POLICIES, BRIEF_TOOL_SLUGS, allowlistedSlugsForMode }

/**
 * Resolve a Composio tool slug for the current agent mode.
 * Unknown / wrong-mode → deny (log tool_run denied; never execute).
 */
export function resolve(
  slug: string,
  mode: AgentMode,
): PolicyResolveResult {
  return resolveToolPolicy(slug, mode)
}

/** True when the model may be shown this tool schema for the mode. */
export function isVisibleToModel(slug: string, mode: AgentMode): boolean {
  const r = resolve(slug, mode)
  return r.gate === 'allow' || r.gate === 'require_confirmation'
}

/**
 * Filter OpenAI-style tool definitions to the mode allowlist.
 * Always run before sending schemas to the model.
 */
export function filterToolDefinitionsForMode<
  T extends { function: { name: string } },
>(tools: T[], mode: AgentMode): T[] {
  const allowed = new Set(allowlistedSlugsForMode(mode))
  return tools.filter((t) => allowed.has(t.function.name))
}
