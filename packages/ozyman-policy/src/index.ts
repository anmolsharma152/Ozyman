/**
 * @ozyman/policy — shared tool allowlist + MorningBriefPayload.
 *
 * Canonical artifact for PR-03. Deno edge copies values (do not import this
 * package from Deno morning-brief deploy). Next lib/agent imports from here.
 */

export {
  type GateDecision,
  type AgentMode,
  type ToolRisk,
  type ToolPolicy,
  type PolicyResolveResult,
  TOOL_POLICIES,
  BRIEF_TOOL_SLUGS,
  resolveToolPolicy,
  allowlistedSlugsForMode,
  isBriefAllowlisted,
} from './tool-policy'

export {
  type BriefKickSource,
  type BriefKickRank,
  type MorningBriefKick,
  type MorningBriefEmailItem,
  type MorningBriefGithubItem,
  type MorningBriefTaskItem,
  type MorningBriefJobItem,
  type MorningBriefSections,
  type MorningBriefPayload,
  BRIEF_KICK_SOURCES,
  parseMorningBriefPayload,
  isMorningBriefPayload,
} from './brief-schema'
