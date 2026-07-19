/**
 * Morning / evening Top-3 Kicks — gather real Gmail + GitHub + tasks, then rank.
 *
 * Deterministic kicks from structured facts are the source of truth.
 * LLM may polish greeting only; we never ship generic fluff when we have subjects.
 * Also materializes the Top 3 as proposed tasks (source=brief).
 */

import 'server-only'

import { completeChat, getDefaultChatModel } from '@/lib/agent/openai'
import { executeTool } from '@/lib/composio/execute'
import { normalizeToolData } from '@/lib/composio/normalize'
import { resolveEntityId } from '@/lib/composio/entity'
import { createInsForgeServerClient } from '@/app/lib/insforge/server'
import type { Profile } from '@/lib/profile/ensureProfile'
import type { SessionUser } from '@/app/lib/auth'
import {
  parseMorningBriefPayload,
  type MorningBriefKick,
  type MorningBriefPayload,
  type MorningBriefSections,
} from '@ozyman/policy'

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

type MailFact = {
  subject: string
  sender: string
  labels: string[]
  snippet: string
  messageId?: string
}

type PrFact = {
  repo: string
  number: number | string
  title: string
  state: string
  merged: boolean
  user?: string
}

type RepoFact = { full_name: string; owner: string; repo: string }

type TaskFact = {
  id: string
  title: string
  status: string
  due_at?: string | null
}

type GatherBundle = {
  gmailOk: boolean
  githubOk: boolean
  gmailError?: string
  githubError?: string
  gmailEstimate: number
  mails: MailFact[]
  openPrs: PrFact[]
  recentPrs: PrFact[]
  repos: RepoFact[]
  githubLogin: string | null
  tasks: TaskFact[]
  gmailText: string
  githubText: string
  tasksText: string
}

function extractMessages(data: Record<string, unknown> | null): unknown[] {
  if (!data) return []
  if (Array.isArray(data.messages)) return data.messages
  if (Array.isArray(data.emails)) return data.emails
  if (Array.isArray(data.value)) return data.value
  return []
}

function toMailFacts(data: Record<string, unknown> | null): {
  mails: MailFact[]
  estimate: number
} {
  const messages = extractMessages(data)
  const estimate =
    typeof data?.resultSizeEstimate === 'number'
      ? data.resultSizeEstimate
      : messages.length
  const mails: MailFact[] = []
  for (const raw of messages.slice(0, 12)) {
    const m = raw as Record<string, unknown>
    const subject = String(m.subject ?? m.Subject ?? '').trim()
    if (!subject) continue
    mails.push({
      subject,
      sender: String(m.sender ?? m.from ?? m.From ?? ''),
      labels: Array.isArray(m.labelIds)
        ? (m.labelIds as string[]).map(String)
        : [],
      snippet: String(m.snippet ?? m.preview ?? m.messageText ?? '').slice(
        0,
        140,
      ),
      messageId: m.messageId
        ? String(m.messageId)
        : m.id
          ? String(m.id)
          : undefined,
    })
  }
  return { mails, estimate }
}

function summarizeMails(mails: MailFact[], estimate: number): string {
  if (!mails.length) {
    return `Gmail: 0 messages matched (estimate=${estimate}).`
  }
  const lines = [
    `Gmail: showing ${mails.length} of ~${estimate} match(es):`,
  ]
  for (const m of mails) {
    lines.push(
      `- subject="${m.subject}" from="${m.sender}" labels=${m.labels.slice(0, 6).join(',')} snippet="${m.snippet}"`,
    )
  }
  return lines.join('\n')
}

async function gatherGmail(entityId: string): Promise<{
  ok: boolean
  error?: string
  mails: MailFact[]
  estimate: number
  text: string
}> {
  const attempts: Array<{ query: string; label: string }> = [
    { query: 'is:unread', label: 'unread' },
    { query: 'in:inbox newer_than:7d', label: 'inbox (7d)' },
    { query: 'is:important newer_than:14d', label: 'important (14d)' },
  ]

  const chunks: string[] = []
  let lastError: string | undefined
  let anyOk = false
  let mails: MailFact[] = []
  let estimate = 0

  for (const a of attempts) {
    const r = await executeTool('GMAIL_FETCH_EMAILS', entityId, {
      max_results: 12,
      query: a.query,
      verbose: false,
    })
    if (!r.successful) {
      lastError = r.error ?? 'error'
      chunks.push(`Gmail ${a.label}: failed (${lastError})`)
      continue
    }
    anyOk = true
    const slim = normalizeToolData('GMAIL_FETCH_EMAILS', r.data)
    const parsed = toMailFacts(slim)
    chunks.push(`### ${a.label}\n${summarizeMails(parsed.mails, parsed.estimate)}`)
    if (parsed.mails.length > 0) {
      mails = parsed.mails
      estimate = parsed.estimate
      break
    }
  }

  if (!anyOk) {
    return {
      ok: false,
      error: lastError ?? 'gmail failed',
      mails: [],
      estimate: 0,
      text: chunks.join('\n') || 'Gmail unavailable',
    }
  }
  return {
    ok: true,
    mails,
    estimate,
    text: chunks.join('\n\n'),
  }
}

function reposFromListPayload(
  data: Record<string, unknown> | null,
): RepoFact[] {
  if (!data) return []
  const list = Array.isArray(data.repositories)
    ? data.repositories
    : Array.isArray(data.items)
      ? data.items
      : Array.isArray(data.value)
        ? data.value
        : []
  const out: RepoFact[] = []
  for (const raw of list) {
    const r = raw as Record<string, unknown>
    const full = String(r.full_name ?? '')
    if (full.includes('/')) {
      const [owner, repo] = full.split('/')
      out.push({ full_name: full, owner, repo })
      continue
    }
    const name = String(r.name ?? '')
    const ownerObj = r.owner as Record<string, unknown> | undefined
    const owner = String(ownerObj?.login ?? r.owner ?? '')
    if (owner && name) {
      out.push({
        full_name: `${owner}/${name}`,
        owner,
        repo: name,
      })
    }
  }
  return out
}

function prsFromSlim(
  slim: Record<string, unknown> | null,
  repo: string,
): PrFact[] {
  const list = Array.isArray(slim?.pull_requests)
    ? (slim!.pull_requests as Record<string, unknown>[])
    : []
  return list.map((p) => ({
    repo,
    number: (p.number as number | string) ?? '?',
    title: String(p.title ?? ''),
    state: String(p.state ?? 'unknown'),
    merged: Boolean(p.merged_at),
    user: p.user ? String(p.user) : undefined,
  }))
}

async function gatherGithub(
  entityId: string,
  watched: Array<{ owner: string; repo: string }>,
): Promise<{
  ok: boolean
  error?: string
  text: string
  login: string | null
  repos: RepoFact[]
  openPrs: PrFact[]
  recentPrs: PrFact[]
}> {
  const parts: string[] = []
  let ok = true
  let error: string | undefined
  let login: string | null = null
  const openPrs: PrFact[] = []
  const recentPrs: PrFact[] = []

  const me = await executeTool('GITHUB_GET_THE_AUTHENTICATED_USER', entityId, {})
  if (me.successful) {
    const d = normalizeToolData(
      'GITHUB_GET_THE_AUTHENTICATED_USER',
      me.data,
    )
    login = d?.login ? String(d.login) : null
    parts.push(
      `GitHub user: login=${d?.login ?? '?'} name=${d?.name ?? ''} public_repos=${d?.public_repos ?? '?'}`,
    )
  } else {
    ok = false
    error = me.error ?? 'error'
    parts.push(`GitHub user unavailable: ${error}`)
    return {
      ok,
      error,
      text: parts.join('\n\n'),
      login: null,
      repos: [],
      openPrs,
      recentPrs,
    }
  }

  let repos: RepoFact[] = watched.slice(0, 8).map((r) => ({
    owner: r.owner,
    repo: r.repo,
    full_name: `${r.owner}/${r.repo}`,
  }))

  if (repos.length === 0) {
    const listed = await executeTool(
      'GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER',
      entityId,
      { per_page: 8, sort: 'updated', affiliation: 'owner,collaborator' },
    )
    if (listed.successful) {
      const slim = normalizeToolData(
        'GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER',
        listed.data,
      )
      repos = reposFromListPayload(slim)
      parts.push(
        `Recently updated repos (auto):\n${repos
          .map((r) => `- ${r.full_name}`)
          .join('\n') || '(none)'}`,
      )
    } else {
      parts.push(
        `Could not list repos: ${listed.error ?? 'error'}. No watched github_repos in settings.`,
      )
    }
  } else {
    parts.push(
      `Watched repos: ${repos.map((r) => r.full_name).join(', ')}`,
    )
  }

  for (const { owner, repo, full_name } of repos.slice(0, 5)) {
    const prs = await executeTool('GITHUB_LIST_PULL_REQUESTS', entityId, {
      owner,
      repo,
      state: 'open',
      per_page: 8,
    })
    if (!prs.successful) {
      parts.push(`Open PRs ${full_name}: failed (${prs.error ?? 'error'})`)
      continue
    }
    const slim = normalizeToolData('GITHUB_LIST_PULL_REQUESTS', prs.data)
    const open = prsFromSlim(slim, full_name)
    openPrs.push(...open)

    if (open.length) {
      parts.push(
        `Open PRs ${full_name}: ${open.length}\n${open
          .map((p) => `  #${p.number} ${p.title} (@${p.user ?? '?'})`)
          .join('\n')}`,
      )
      continue
    }

    const all = await executeTool('GITHUB_LIST_PULL_REQUESTS', entityId, {
      owner,
      repo,
      state: 'all',
      per_page: 5,
    })
    if (all.successful) {
      const allSlim = normalizeToolData(
        'GITHUB_LIST_PULL_REQUESTS',
        all.data,
      )
      const recent = prsFromSlim(allSlim, full_name)
      recentPrs.push(...recent)
      if (recent.length) {
        parts.push(
          `Open PRs ${full_name}: 0 open. Recent (not open):\n${recent
            .map(
              (p) =>
                `  #${p.number} [${p.state}${p.merged ? ' merged' : ''}] ${p.title}`,
            )
            .join('\n')}`,
        )
      } else {
        parts.push(`Open PRs ${full_name}: 0 open (and no recent PRs)`)
      }
    } else {
      parts.push(`Open PRs ${full_name}: 0 open`)
    }
  }

  return {
    ok,
    error,
    text: parts.join('\n\n'),
    login,
    repos,
    openPrs,
    recentPrs,
  }
}

async function gatherTasks(userId: string): Promise<{
  text: string
  tasks: TaskFact[]
}> {
  try {
    const client = await createInsForgeServerClient()
    const { data, error } = await client.database
      .from('tasks')
      .select('id, title, status, due_at, source')
      .eq('user_id', userId)
      .in('status', ['proposed', 'todo', 'doing'])
      .order('updated_at', { ascending: false })
      .limit(15)
    if (error) return { text: `Tasks: ${error.message}`, tasks: [] }
    const rows = (data as Array<Record<string, unknown>>) ?? []
    const tasks: TaskFact[] = rows.map((t) => ({
      id: String(t.id),
      title: String(t.title ?? ''),
      status: String(t.status ?? ''),
      due_at: (t.due_at as string | null) ?? null,
    }))
    if (!tasks.length) return { text: 'Open tasks: none', tasks: [] }
    return {
      text: `Open tasks (${tasks.length}):\n${tasks
        .map(
          (t) =>
            `- [${t.status}] ${t.title}${t.due_at ? ` due=${t.due_at}` : ''}`,
        )
        .join('\n')}`,
      tasks,
    }
  } catch (e) {
    return {
      text: `Tasks: ${e instanceof Error ? e.message : 'error'}`,
      tasks: [],
    }
  }
}

function timeGreeting(timezone: string): string {
  try {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: timezone || 'UTC',
      }).format(new Date()),
    )
    if (hour < 12) return 'Morning'
    if (hour < 17) return 'Afternoon'
    return 'Evening'
  } catch {
    return 'Hey'
  }
}

/** Prefer action-worthy mail: unread, important, not pure promo when possible. */
function rankMails(mails: MailFact[]): MailFact[] {
  const score = (m: MailFact) => {
    let s = 0
    if (m.labels.includes('UNREAD')) s += 3
    if (m.labels.includes('IMPORTANT')) s += 2
    if (m.labels.includes('STARRED')) s += 2
    if (m.labels.includes('CATEGORY_PERSONAL') || m.labels.includes('CATEGORY_SOCIAL'))
      s += 1
    if (m.labels.includes('CATEGORY_PROMOTIONS')) s -= 2
    // Career / product signal
    if (/interview|offer|deadline|action required|verify|otp|quiz|pr #|pull request/i.test(m.subject))
      s += 2
    return s
  }
  return [...mails].sort((a, b) => score(b) - score(a))
}

function isGenericFluffKick(k: MorningBriefKick): boolean {
  const t = `${k.title} ${k.why}`
  return /triage unread|pick one github focus|capture one concrete|browse trending|explor(e|ing).*(repo|github)|ship momentum beats|keep the board honest|no strong automated|grounded top 3 from what we could/i.test(
    t,
  )
}

/**
 * Build Top-3 kicks directly from structured gather facts.
 * Titles always cite real subjects / PR numbers / task titles when available.
 */
export function buildKicksFromFacts(
  bundle: GatherBundle,
  timezone: string,
  displayName?: string | null,
): MorningBriefPayload {
  const kicks: MorningBriefKick[] = []
  const usedSubjects = new Set<string>()
  const rankedMail = rankMails(bundle.mails)

  // 1) Specific email kicks (up to 2 if strong signal)
  for (const m of rankedMail) {
    if (kicks.length >= 2) break
    const key = m.subject.toLowerCase()
    if (usedSubjects.has(key)) continue
    usedSubjects.add(key)
    const unread = m.labels.includes('UNREAD')
    kicks.push({
      rank: (kicks.length + 1) as 1 | 2 | 3,
      title: clip(
        unread
          ? `Handle: ${m.subject}`
          : `Follow up: ${m.subject}`,
        90,
      ),
      why: clip(
        `From ${m.sender || 'unknown'}${
          bundle.gmailEstimate > rankedMail.length
            ? ` · ~${bundle.gmailEstimate} unread/matching total`
            : ''
        }${m.snippet ? ` — ${m.snippet}` : ''}`,
        180,
      ),
      source: 'email',
      action_hint: `Chat: “Summarize email: ${clip(m.subject, 50)}”`,
      deep_link_path: '/chat',
    })
  }

  // 2) Open PR kick
  if (kicks.length < 3 && bundle.openPrs.length) {
    const p = bundle.openPrs[0]
    kicks.push({
      rank: (kicks.length + 1) as 1 | 2 | 3,
      title: clip(`Review open PR #${p.number}: ${p.title}`, 90),
      why: clip(
        `${p.repo} · open${p.user ? ` by @${p.user}` : ''}${
          bundle.openPrs.length > 1
            ? ` · +${bundle.openPrs.length - 1} more open`
            : ''
        }`,
        160,
      ),
      source: 'github',
      action_hint: `Chat: “Details on ${p.repo} PR #${p.number}”`,
      deep_link_path: '/chat',
    })
  }

  // 3) Existing open task
  if (kicks.length < 3 && bundle.tasks.length) {
    // Prefer non-brief-sourced tasks first so we don't re-kick our own proposals
    const t =
      bundle.tasks.find((x) => !/proposed/i.test(x.status)) ?? bundle.tasks[0]
    kicks.push({
      rank: (kicks.length + 1) as 1 | 2 | 3,
      title: clip(`Finish: ${t.title}`, 90),
      why: clip(
        `On your board as ${t.status}${t.due_at ? ` · due ${t.due_at}` : ''}`,
        140,
      ),
      source: 'task',
      action_hint: 'Open Tasks',
      deep_link_path: '/tasks',
    })
  }

  // 4) Recent closed PR / repo momentum (only if no open PR kick yet)
  if (
    kicks.length < 3 &&
    !bundle.openPrs.length &&
    (bundle.recentPrs.length || bundle.repos.length)
  ) {
    if (bundle.recentPrs.length) {
      const p = bundle.recentPrs[0]
      kicks.push({
        rank: (kicks.length + 1) as 1 | 2 | 3,
        title: clip(
          `Close the loop on ${p.repo} (PR #${p.number} is ${p.state}${p.merged ? '/merged' : ''})`,
          90,
        ),
        why: clip(
          `No open PRs right now. Last activity: “${p.title}”. Next: one small PR or issue on that repo.`,
          180,
        ),
        source: 'github',
        action_hint: `Chat: “What should I ship next on ${p.repo}?”`,
        deep_link_path: '/chat',
      })
    } else {
      const r = bundle.repos[0]
      kicks.push({
        rank: (kicks.length + 1) as 1 | 2 | 3,
        title: clip(`One focused push on ${r.full_name}`, 90),
        why: 'Recently updated repo with 0 open PRs — ship a tiny improvement instead of browsing.',
        source: 'github',
        action_hint: `Chat: “What changed recently on ${r.full_name}?”`,
        deep_link_path: '/chat',
      })
    }
  }

  // 5) Mail backlog volume kick if we only took one mail
  if (
    kicks.length < 3 &&
    bundle.gmailEstimate >= 10 &&
    !kicks.some((k) => k.source === 'email' && /~?\d+ unread/i.test(k.why))
  ) {
    kicks.push({
      rank: (kicks.length + 1) as 1 | 2 | 3,
      title: clip(
        `Burn down ~${bundle.gmailEstimate} matching emails (10-minute pass)`,
        90,
      ),
      why: rankedMail[0]
        ? `Start with “${clip(rankedMail[0].subject, 60)}” then archive or reply.`
        : 'Inbox has real volume — short pass, not a full clean.',
      source: 'email',
      action_hint: 'Chat: “Top 5 unread that need a reply”',
      deep_link_path: '/chat',
    })
  }

  // Fill remaining with honest operator moves (no fake data)
  while (kicks.length < 3) {
    const rank = (kicks.length + 1) as 1 | 2 | 3
    if (!bundle.mails.length && !bundle.gmailOk) {
      kicks.push({
        rank,
        title: 'Reconnect Gmail so kicks can name real subjects',
        why: 'Gmail gather failed — kicks stay vague without mail signal.',
        source: 'other',
        action_hint: 'Settings → Manage apps → Link Gmail',
        deep_link_path: '/settings',
      })
    } else if (!bundle.tasks.length) {
      kicks.push({
        rank,
        title: 'Write one task for tomorrow’s first 30 minutes',
        why: 'Board is empty — one concrete next step beats a vague list.',
        source: 'task',
        action_hint: 'Add a task in Tasks',
        deep_link_path: '/tasks',
      })
    } else {
      kicks.push({
        rank,
        title: 'Protect 25 minutes for deep work',
        why: 'Signals are loaded; the win is uninterrupted execution on kick #1.',
        source: 'other',
        action_hint: 'Chat: “Help me plan the next hour around kick 1”',
        deep_link_path: '/chat',
      })
    }
  }

  const name = displayName?.trim().split(/\s+/)[0]
  const when = timeGreeting(timezone)
  const greeting = name
    ? `${when}. ${name} — Top 3 from your live mail, GitHub, and tasks.`
    : `${when}. Top 3 from your live mail, GitHub, and tasks.`

  const wins: string[] = []
  if (bundle.tasks.length === 0) wins.push('Task board is clear.')
  if (bundle.openPrs.length === 0 && bundle.githubOk) {
    wins.push('No open PRs waiting on you right now.')
  }
  if (bundle.mails.length && rankedMail.some((m) => m.labels.includes('STARRED'))) {
    wins.push('You starred a few threads — useful signal.')
  }

  const sections: MorningBriefSections = {
    email: {
      summary:
        bundle.mails.length > 0
          ? `${bundle.mails.length} shown · ~${bundle.gmailEstimate} matches`
          : bundle.gmailOk
            ? 'No messages in gather window'
            : 'Gmail unavailable',
      items: bundle.mails.slice(0, 8).map((m) => ({
        subject: m.subject,
        from: m.sender,
        id: m.messageId,
      })),
    },
    github: {
      summary: bundle.openPrs.length
        ? `${bundle.openPrs.length} open PR(s)`
        : `${bundle.recentPrs.length} recent closed · 0 open`,
      items: [
        ...bundle.openPrs.map((p) => ({
          title: `#${p.number} ${p.title}`,
          repo: p.repo,
        })),
        ...bundle.recentPrs.slice(0, 5).map((p) => ({
          title: `#${p.number} [${p.state}] ${p.title}`,
          repo: p.repo,
        })),
      ].slice(0, 8),
    },
    tasks: {
      summary:
        bundle.tasks.length > 0
          ? `${bundle.tasks.length} open`
          : 'none open',
      items: bundle.tasks.slice(0, 8).map((t) => ({
        id: t.id,
        title: t.title,
        due_at: t.due_at ?? undefined,
      })),
    },
  }

  const unavailable: string[] = []
  if (!bundle.gmailOk) unavailable.push('gmail')
  if (!bundle.githubOk) unavailable.push('github')

  return {
    greeting,
    top_kicks: kicks.slice(0, 3) as MorningBriefPayload['top_kicks'],
    wins,
    sections,
    unavailable,
    tone_notes: 'deterministic_from_facts',
  }
}

function kicksCiteFacts(
  kicks: MorningBriefKick[],
  bundle: GatherBundle,
): boolean {
  if (!bundle.mails.length && !bundle.openPrs.length && !bundle.tasks.length) {
    return true // nothing to cite
  }
  const blob = kicks.map((k) => `${k.title} ${k.why}`).join('\n').toLowerCase()
  // At least one real subject fragment or PR number or task title
  for (const m of bundle.mails.slice(0, 5)) {
    const token = m.subject.slice(0, 24).toLowerCase()
    if (token.length >= 8 && blob.includes(token.slice(0, 16))) return true
  }
  for (const p of [...bundle.openPrs, ...bundle.recentPrs].slice(0, 6)) {
    if (blob.includes(`#${p.number}`)) return true
    const token = p.title.slice(0, 20).toLowerCase()
    if (token.length >= 6 && blob.includes(token.slice(0, 12))) return true
  }
  for (const t of bundle.tasks.slice(0, 5)) {
    const token = t.title.slice(0, 20).toLowerCase()
    if (token.length >= 6 && blob.includes(token.slice(0, 12))) return true
  }
  return false
}

async function maybePolishGreeting(
  payload: MorningBriefPayload,
  bundle: GatherBundle,
  timezone: string,
): Promise<MorningBriefPayload> {
  // Keep deterministic kicks; only allow LLM to tweak greeting when OpenRouter works
  try {
    const completion = await completeChat({
      model: getDefaultChatModel(),
      temperature: 0.4,
      maxTokens: 120,
      messages: [
        {
          role: 'system',
          content:
            'Write one short warm greeting (max 18 words) for a personal operator buddy named Ozyman. No lists. No inventing facts. Mention evening/morning only if natural.',
        },
        {
          role: 'user',
          content: `Timezone ${timezone}. Facts hint: ${bundle.mails[0]?.subject ?? 'no mail subject'} · open_prs=${bundle.openPrs.length} · tasks=${bundle.tasks.length}. Current greeting: ${payload.greeting}`,
        },
      ],
    })
    const g = completion.content?.trim().replace(/^["']|["']$/g, '')
    if (g && g.length > 8 && g.length < 160 && !/trending|explore new/i.test(g)) {
      return { ...payload, greeting: g }
    }
  } catch {
    // keep deterministic greeting
  }
  return payload
}

/**
 * Persist Top-3 as proposed tasks so the Tasks page shows kicker work.
 * Skips duplicate titles still open from previous brief runs today.
 */
async function materializeKickTasks(
  userId: string,
  kicks: MorningBriefKick[],
  artifactId: string | null,
): Promise<string[]> {
  const created: string[] = []
  try {
    const client = await createInsForgeServerClient()
    const { data: existing } = await client.database
      .from('tasks')
      .select('id, title')
      .eq('user_id', userId)
      .in('status', ['proposed', 'todo', 'doing'])
      .limit(80)

    const openTitles = new Set(
      ((existing as Array<{ title?: string }> | null) ?? []).map((t) =>
        String(t.title ?? '')
          .toLowerCase()
          .trim(),
      ),
    )

    for (const k of kicks) {
      const title = clip(k.title, 280)
      const key = title.toLowerCase().trim()
      if (!key || openTitles.has(key)) continue

      const { data: row, error } = await client.database
        .from('tasks')
        .insert([
          {
            user_id: userId,
            title,
            notes: clip(`${k.why}\n\n→ ${k.action_hint}`, 2000),
            status: 'proposed',
            priority: 4 - k.rank, // rank1 → priority 3
            source: 'brief',
            source_ref: {
              rank: k.rank,
              kick_source: k.source,
              artifact_id: artifactId,
              deep_link_path: k.deep_link_path ?? null,
            },
            metadata: { kind: 'kicker' },
          },
        ])
        .select('id')
        .single()

      if (error) {
        console.error('[brief] task materialize failed', error)
        continue
      }
      const id = (row as { id?: string } | null)?.id
      if (id) {
        created.push(id)
        openTitles.add(key)
      }
    }
  } catch (e) {
    console.error('[brief] materializeKickTasks', e)
  }
  return created
}

export async function runMorningBrief(input: {
  user: SessionUser
  profile: Profile
}): Promise<{
  payload: MorningBriefPayload
  artifactId: string | null
  threadId: string | null
  taskIds: string[]
}> {
  const { entityId } = resolveEntityId(input.profile, input.user.id)
  const watched = input.profile.settings?.github_repos ?? []

  const [gmail, github, taskGather] = await Promise.all([
    gatherGmail(entityId),
    gatherGithub(entityId, watched),
    gatherTasks(input.user.id),
  ])

  const bundle: GatherBundle = {
    gmailOk: gmail.ok,
    githubOk: github.ok,
    gmailError: gmail.error,
    githubError: github.error,
    gmailEstimate: gmail.estimate,
    mails: gmail.mails,
    openPrs: github.openPrs,
    recentPrs: github.recentPrs,
    repos: github.repos,
    githubLogin: github.login,
    tasks: taskGather.tasks,
    gmailText: gmail.text,
    githubText: github.text,
    tasksText: taskGather.text,
  }

  // Deterministic first — always grounded when facts exist
  let payload = buildKicksFromFacts(
    bundle,
    input.profile.timezone,
    input.profile.display_name || input.user.name,
  )

  // Optional: try LLM full JSON, but only keep if it cites facts and isn't fluff
  try {
    const context = [
      '## FACTS ONLY',
      gmail.text,
      github.text,
      taskGather.text,
      '## STRUCTURED',
      JSON.stringify({
        subjects: gmail.mails.map((m) => m.subject).slice(0, 8),
        open_prs: github.openPrs.slice(0, 6),
        recent_prs: github.recentPrs.slice(0, 4),
        tasks: taskGather.tasks.map((t) => t.title).slice(0, 6),
        estimate_unreadish: gmail.estimate,
      }),
    ].join('\n\n---\n\n')

    const completion = await completeChat({
      model: getDefaultChatModel(),
      temperature: 0.2,
      maxTokens: 1400,
      messages: [
        {
          role: 'system',
          content: `You are Ozyman writing a daily operator brief.
Return ONLY valid JSON (no markdown fences):
{
  "greeting": "short warm line",
  "top_kicks": [
    {
      "rank": 1,
      "title": "must include a real email subject OR PR #number OR task title from FACTS",
      "why": "one line citing that fact",
      "source": "email|github|task|job|other",
      "action_hint": "what to do next",
      "deep_link_path": "/chat"
    }
  ],
  "wins": [],
  "sections": {},
  "unavailable": []
}
Rules:
- Exactly 3 top_kicks ranks 1,2,3.
- If FACTS list email subjects, kick titles MUST quote at least one real subject string.
- Never write generic "Triage unread mail" or "Pick one GitHub focus repo".
- Never invent open PRs when open count is 0.
- Never invent calendar or trending repos.`,
        },
        {
          role: 'user',
          content: `Timezone: ${input.profile.timezone}\nUnavailable: ${payload.unavailable.join(', ') || 'none'}\n\n${context}`,
        },
      ],
    })

    const raw = completion.content?.trim() ?? ''
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim()
    const parsed = parseMorningBriefPayload(JSON.parse(cleaned))
    if (
      parsed &&
      !parsed.top_kicks.some(isGenericFluffKick) &&
      kicksCiteFacts(parsed.top_kicks, bundle)
    ) {
      payload = {
        ...parsed,
        sections: {
          ...payload.sections,
          ...parsed.sections,
        },
        unavailable: Array.from(
          new Set([...(parsed.unavailable ?? []), ...payload.unavailable]),
        ),
        tone_notes: 'llm_accepted_grounded',
      }
    } else {
      payload = {
        ...payload,
        tone_notes: parsed
          ? 'llm_rejected_ungrounded_or_fluff'
          : 'llm_parse_failed_kept_deterministic',
      }
    }
  } catch {
    payload = {
      ...payload,
      tone_notes: 'llm_error_kept_deterministic',
    }
  }

  // Light greeting polish only
  payload = await maybePolishGreeting(
    payload,
    bundle,
    input.profile.timezone,
  )

  let artifactId: string | null = null
  let threadId: string | null = null
  let taskIds: string[] = []

  try {
    const client = await createInsForgeServerClient()
    const { data: thread } = await client.database
      .from('threads')
      .insert([
        {
          user_id: input.user.id,
          kind: 'brief',
          status: 'open',
          title: `Brief ${new Date().toLocaleString('en-IN', { timeZone: input.profile.timezone })}`,
          metadata: { type: 'morning_brief' },
        },
      ])
      .select('id')
      .single()

    threadId = (thread as { id?: string } | null)?.id ?? null

    if (threadId) {
      const kicksText = payload.top_kicks
        .map(
          (k) =>
            `${k.rank}. ${k.title}\n   ${k.why}${k.action_hint ? `\n   → ${k.action_hint}` : ''}`,
        )
        .join('\n\n')
      await client.database.from('messages').insert([
        {
          thread_id: threadId,
          user_id: input.user.id,
          role: 'assistant',
          content: `${payload.greeting}\n\n${kicksText}`,
          parts: payload,
        },
      ])
    }

    const { data: art } = await client.database
      .from('artifacts')
      .insert([
        {
          user_id: input.user.id,
          kind: 'brief',
          title: 'Top-3 Kicks',
          body: payload,
          thread_id: threadId,
          metadata: {
            source: 'morning_brief',
            gmail_ok: gmail.ok,
            github_ok: github.ok,
            gmail_count: gmail.mails.length,
            gmail_estimate: gmail.estimate,
            open_prs: github.openPrs.length,
            task_ids: [],
          },
          mime_type: 'application/json',
        },
      ])
      .select('id')
      .single()

    artifactId = (art as { id?: string } | null)?.id ?? null

    taskIds = await materializeKickTasks(
      input.user.id,
      payload.top_kicks,
      artifactId,
    )

    if (artifactId && taskIds.length) {
      await client.database
        .from('artifacts')
        .update({
          metadata: {
            source: 'morning_brief',
            gmail_ok: gmail.ok,
            github_ok: github.ok,
            gmail_count: gmail.mails.length,
            gmail_estimate: gmail.estimate,
            open_prs: github.openPrs.length,
            task_ids: taskIds,
          },
        })
        .eq('id', artifactId)
    }
  } catch (e) {
    console.error('[brief] persist failed', e)
  }

  return { payload, artifactId, threadId, taskIds }
}
