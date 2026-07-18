/**
 * Canonical MorningBriefPayload schema for Ozyman.
 *
 * Deno morning-brief (PR-08): copy/paste this type + any validator twin.
 * Comment there: keep in sync with packages/ozyman-policy/src/brief-schema.ts.
 *
 * Next may re-export for /brief/[id] UI only — not the Deno source of truth.
 */

export type BriefKickSource = 'email' | 'github' | 'task' | 'job' | 'other'

export type BriefKickRank = 1 | 2 | 3

export interface MorningBriefKick {
  rank: BriefKickRank
  /** Actionable title */
  title: string
  /** One-line why it matters */
  why: string
  source: BriefKickSource
  /** e.g. "Draft reply", "Review PR", "Apply packet" */
  action_hint: string
  /** Optional app path e.g. /jobs/..., /t/... */
  deep_link_path?: string
}

export interface MorningBriefEmailItem {
  subject: string
  from?: string
  id?: string
}

export interface MorningBriefGithubItem {
  title: string
  repo?: string
  url?: string
}

export interface MorningBriefTaskItem {
  id: string
  title: string
  due_at?: string
}

export interface MorningBriefJobItem {
  company: string
  status: string
}

export interface MorningBriefSections {
  email?: { summary: string; items: MorningBriefEmailItem[] }
  github?: { summary: string; items: MorningBriefGithubItem[] }
  tasks?: { summary: string; items: MorningBriefTaskItem[] }
  jobs?: { summary: string; items: MorningBriefJobItem[] }
}

/**
 * LLM / pipeline output shape for Top-3 kicks morning brief.
 * top_kicks length must be 1–3.
 */
export interface MorningBriefPayload {
  /** Buddy-tone greeting */
  greeting: string
  top_kicks: MorningBriefKick[]
  /** Small celebrations; may be empty */
  wins: string[]
  sections: MorningBriefSections
  /** Soft-failed sources e.g. ["gmail", "github"] */
  unavailable: string[]
  /** Internal tone notes — not user-facing */
  tone_notes?: string
}

export const BRIEF_KICK_SOURCES: readonly BriefKickSource[] = [
  'email',
  'github',
  'task',
  'job',
  'other',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isKickSource(value: unknown): value is BriefKickSource {
  return (
    typeof value === 'string' &&
    (BRIEF_KICK_SOURCES as readonly string[]).includes(value)
  )
}

function isKickRank(value: unknown): value is BriefKickRank {
  return value === 1 || value === 2 || value === 3
}

function isKick(value: unknown): value is MorningBriefKick {
  if (!isRecord(value)) return false
  if (!isKickRank(value.rank)) return false
  if (typeof value.title !== 'string' || !value.title.trim()) return false
  if (typeof value.why !== 'string') return false
  if (!isKickSource(value.source)) return false
  if (typeof value.action_hint !== 'string') return false
  if (
    value.deep_link_path !== undefined &&
    typeof value.deep_link_path !== 'string'
  ) {
    return false
  }
  return true
}

/**
 * Structural validation for MorningBriefPayload (no zod dependency).
 * Returns null if invalid; otherwise a shallow-normalized payload.
 */
export function parseMorningBriefPayload(
  value: unknown,
): MorningBriefPayload | null {
  if (!isRecord(value)) return null
  if (typeof value.greeting !== 'string') return null
  if (!Array.isArray(value.top_kicks)) return null
  if (value.top_kicks.length < 1 || value.top_kicks.length > 3) return null
  if (!value.top_kicks.every(isKick)) return null
  if (!Array.isArray(value.wins) || !value.wins.every((w) => typeof w === 'string')) {
    return null
  }
  if (!isRecord(value.sections)) return null
  if (
    !Array.isArray(value.unavailable) ||
    !value.unavailable.every((u) => typeof u === 'string')
  ) {
    return null
  }
  if (
    value.tone_notes !== undefined &&
    typeof value.tone_notes !== 'string'
  ) {
    return null
  }

  return {
    greeting: value.greeting,
    top_kicks: value.top_kicks as MorningBriefKick[],
    wins: value.wins as string[],
    sections: value.sections as MorningBriefSections,
    unavailable: value.unavailable as string[],
    ...(typeof value.tone_notes === 'string'
      ? { tone_notes: value.tone_notes }
      : {}),
  }
}

/** True when payload passes structural rules (1–3 kicks, required fields). */
export function isMorningBriefPayload(
  value: unknown,
): value is MorningBriefPayload {
  return parseMorningBriefPayload(value) !== null
}
