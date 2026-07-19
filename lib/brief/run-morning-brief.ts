/**
 * Morning Top-3 Kicks — gather real Gmail + GitHub + tasks, then rank.
 * Never invent calendar/trends when tools return empty.
 */

import 'server-only'

import { completeChat, getDefaultChatModel } from '@/lib/agent/openai'
import { executeTool } from '@/lib/composio/execute'
import { resolveEntityId } from '@/lib/composio/entity'
import { createInsForgeServerClient } from '@/app/lib/insforge/server'
import type { Profile } from '@/lib/profile/ensureProfile'
import type { SessionUser } from '@/app/lib/auth'
import {
  parseMorningBriefPayload,
  type MorningBriefPayload,
} from '@ozyman/policy'

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}

function extractMessages(data: Record<string, unknown> | null): unknown[] {
  if (!data) return []
  if (Array.isArray(data.messages)) return data.messages
  if (Array.isArray(data.value)) return data.value
  return []
}

function summarizeEmails(data: Record<string, unknown> | null): string {
  const messages = extractMessages(data)
  if (!messages.length) {
    return 'Gmail: 0 messages matched the query.'
  }
  const lines: string[] = [`Gmail: ${messages.length} message(s):`]
  for (const raw of messages.slice(0, 12)) {
    const m = raw as Record<string, unknown>
    const subject = String(m.subject ?? m.Subject ?? '(no subject)')
    const sender = String(m.sender ?? m.from ?? m.From ?? '')
    const snippet = String(m.snippet ?? m.preview ?? m.messageText ?? '').slice(
      0,
      140,
    )
    const labels = Array.isArray(m.labelIds)
      ? (m.labelIds as string[]).slice(0, 6).join(',')
      : ''
    lines.push(
      `- subject="${subject}" from="${sender}" labels=${labels} snippet="${snippet}"`,
    )
  }
  return lines.join('\n')
}

async function gatherGmail(
  entityId: string,
): Promise<{ text: string; ok: boolean; error?: string; count: number }> {
  // Prefer unread; if empty, fall back to recent inbox so we still have signal
  const attempts: Array<{ query: string; label: string }> = [
    { query: 'is:unread newer_than:5d', label: 'unread (5d)' },
    { query: 'in:inbox newer_than:2d', label: 'inbox (2d)' },
    { query: 'is:important newer_than:7d', label: 'important (7d)' },
  ]

  const chunks: string[] = []
  let anyOk = false
  let lastError: string | undefined
  let total = 0

  for (const a of attempts) {
    const r = await executeTool('GMAIL_FETCH_EMAILS', entityId, {
      max_results: 10,
      query: a.query,
      verbose: false,
    })
    if (!r.successful) {
      lastError = r.error ?? 'error'
      chunks.push(`Gmail ${a.label}: failed (${lastError})`)
      continue
    }
    anyOk = true
    const n = extractMessages(r.data).length
    total += n
    chunks.push(`### ${a.label}\n${summarizeEmails(r.data)}`)
    if (n > 0) break // enough signal
  }

  if (!anyOk) {
    return {
      ok: false,
      error: lastError ?? 'gmail failed',
      text: chunks.join('\n') || 'Gmail unavailable',
      count: 0,
    }
  }
  return { ok: true, text: chunks.join('\n\n'), count: total }
}

function reposFromListPayload(
  data: Record<string, unknown> | null,
): Array<{ owner: string; repo: string; full_name?: string }> {
  if (!data) return []
  const list = Array.isArray(data.repositories)
    ? data.repositories
    : Array.isArray(data.items)
      ? data.items
      : Array.isArray(data.value)
        ? data.value
        : []
  const out: Array<{ owner: string; repo: string; full_name?: string }> = []
  for (const raw of list) {
    const r = raw as Record<string, unknown>
    const full = String(r.full_name ?? '')
    if (full.includes('/')) {
      const [owner, repo] = full.split('/')
      out.push({ owner, repo, full_name: full })
      continue
    }
    const name = String(r.name ?? '')
    const ownerObj = r.owner as Record<string, unknown> | undefined
    const owner = String(ownerObj?.login ?? r.owner ?? '')
    if (owner && name) out.push({ owner, repo: name, full_name: `${owner}/${name}` })
  }
  return out
}

async function gatherGithub(
  entityId: string,
  watched: Array<{ owner: string; repo: string }>,
): Promise<{ text: string; ok: boolean; error?: string }> {
  const parts: string[] = []
  let ok = true
  let error: string | undefined

  const me = await executeTool('GITHUB_GET_THE_AUTHENTICATED_USER', entityId, {})
  if (me.successful) {
    const d = me.data as Record<string, unknown> | null
    parts.push(
      `GitHub user: login=${d?.login ?? '?'} name=${d?.name ?? ''} public_repos=${d?.public_repos ?? '?'}`,
    )
  } else {
    ok = false
    error = me.error ?? 'error'
    parts.push(`GitHub user unavailable: ${error}`)
    return { ok, text: parts.join('\n\n'), error }
  }

  let repos = watched.slice(0, 8)
  if (repos.length === 0) {
    // Auto-discover recently updated repos the user owns/collaborates on
    const listed = await executeTool(
      'GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER',
      entityId,
      { per_page: 8, sort: 'updated', affiliation: 'owner,collaborator' },
    )
    if (listed.successful) {
      const discovered = reposFromListPayload(listed.data)
      parts.push(
        `Recently updated repos (auto):\n${discovered
          .map((r) => `- ${r.full_name ?? `${r.owner}/${r.repo}`}`)
          .join('\n') || '(none)'}`,
      )
      repos = discovered.map(({ owner, repo }) => ({ owner, repo }))
    } else {
      parts.push(
        `Could not list repos: ${listed.error ?? 'error'}. No watched github_repos in settings.`,
      )
    }
  } else {
    parts.push(
      `Watched repos: ${repos.map((r) => `${r.owner}/${r.repo}`).join(', ')}`,
    )
  }

  for (const { owner, repo } of repos.slice(0, 5)) {
    const prs = await executeTool('GITHUB_LIST_PULL_REQUESTS', entityId, {
      owner,
      repo,
      state: 'open',
      per_page: 8,
    })
    if (prs.successful) {
      const data = prs.data as Record<string, unknown> | null
      const list = Array.isArray(data?.pull_requests)
        ? data!.pull_requests
        : Array.isArray(data?.items)
          ? data!.items
          : Array.isArray(data)
            ? data
            : data
              ? [data]
              : []
      if (!list.length) {
        parts.push(`Open PRs ${owner}/${repo}: none`)
      } else {
        const lines = (list as Record<string, unknown>[]).slice(0, 8).map((p) => {
          const num = p.number ?? p.pull_number ?? '?'
          const title = p.title ?? ''
          const user =
            (p.user as Record<string, unknown> | undefined)?.login ??
            (p.author as Record<string, unknown> | undefined)?.login ??
            ''
          return `  #${num} ${title} (@${user})`
        })
        parts.push(`Open PRs ${owner}/${repo}:\n${lines.join('\n')}`)
      }
    } else {
      parts.push(`Open PRs ${owner}/${repo}: failed (${prs.error ?? 'error'})`)
    }
  }

  return { ok, text: parts.join('\n\n'), error }
}

async function gatherTasks(userId: string): Promise<string> {
  try {
    const client = await createInsForgeServerClient()
    const { data, error } = await client.database
      .from('tasks')
      .select('id, title, status, due_at, source')
      .eq('user_id', userId)
      .in('status', ['proposed', 'todo', 'doing'])
      .order('updated_at', { ascending: false })
      .limit(15)
    if (error) return `Tasks: ${error.message}`
    const rows = (data as Array<Record<string, unknown>>) ?? []
    if (!rows.length) return 'Open tasks: none'
    return `Open tasks (${rows.length}):\n${rows
      .map(
        (t) =>
          `- [${t.status}] ${t.title}${t.due_at ? ` due=${t.due_at}` : ''}`,
      )
      .join('\n')}`
  } catch (e) {
    return `Tasks: ${e instanceof Error ? e.message : 'error'}`
  }
}

function fallbackFromContext(
  gmailText: string,
  githubText: string,
  tasksText: string,
): MorningBriefPayload {
  const kicks: MorningBriefPayload['top_kicks'] = []
  const hasMail =
    /subject="/i.test(gmailText) || /\d+ message/i.test(gmailText)
  const hasPrs = /Open PRs .+:\n\s+#/i.test(githubText)
  const hasTasks = /Open tasks \(\d+\)/i.test(tasksText)

  if (hasMail) {
    kicks.push({
      rank: 1,
      title: 'Triage unread / recent mail',
      why: 'There is real Gmail signal in the gather — start with subjects that look time-sensitive.',
      source: 'email',
      action_hint: 'Open Chat: “Summarize my important unread mail”',
      deep_link_path: '/chat',
    })
  }
  if (hasPrs) {
    kicks.push({
      rank: (kicks.length + 1) as 1 | 2 | 3,
      title: 'Review open pull requests',
      why: 'Open PRs showed up on your recent repos.',
      source: 'github',
      action_hint: 'Open Chat and ask about open PRs on Ozyman or your latest repo',
      deep_link_path: '/chat',
    })
  }
  if (hasTasks) {
    kicks.push({
      rank: (kicks.length + 1) as 1 | 2 | 3,
      title: 'Knock out open tasks',
      why: 'You have tasks still in proposed/todo/doing.',
      source: 'task',
      action_hint: 'Open Tasks',
      deep_link_path: '/tasks',
    })
  }
  while (kicks.length < 3) {
    const rank = (kicks.length + 1) as 1 | 2 | 3
    if (kicks.length === 0) {
      kicks.push({
        rank,
        title: 'Check Gmail for anything urgent',
        why: 'No strong automated signals — still worth a quick inbox pass.',
        source: 'email',
        action_hint: 'Chat: “Anything urgent in Gmail?”',
        deep_link_path: '/chat',
      })
    } else if (kicks.length === 1) {
      kicks.push({
        rank,
        title: 'Pick one GitHub focus repo',
        why: 'Ship momentum beats browsing trending repos.',
        source: 'github',
        action_hint: 'Chat: “What changed recently on my GitHub?”',
        deep_link_path: '/chat',
      })
    } else {
      kicks.push({
        rank,
        title: 'Capture one concrete task for later',
        why: 'Keep the board honest so evening-you is kinder.',
        source: 'task',
        action_hint: 'Add a task in Tasks',
        deep_link_path: '/tasks',
      })
    }
  }

  return {
    greeting: 'Here’s a grounded Top 3 from what we could load.',
    top_kicks: kicks.slice(0, 3) as MorningBriefPayload['top_kicks'],
    wins: hasTasks ? [] : ['Task board is clear — nice.'],
    sections: {},
    unavailable: [],
  }
}

export async function runMorningBrief(input: {
  user: SessionUser
  profile: Profile
}): Promise<{
  payload: MorningBriefPayload
  artifactId: string | null
  threadId: string | null
}> {
  const { entityId } = resolveEntityId(input.profile, input.user.id)
  const watched = input.profile.settings?.github_repos ?? []
  const unavailable: string[] = []

  const [gmail, github, tasks] = await Promise.all([
    gatherGmail(entityId),
    gatherGithub(entityId, watched),
    gatherTasks(input.user.id),
  ])
  if (!gmail.ok) unavailable.push('gmail')
  if (!github.ok) unavailable.push('github')

  const context = [
    '## FACTS ONLY — do not invent calendar, trending repos, or empty inboxes if data contradicts',
    gmail.text,
    github.text,
    tasks,
  ].join('\n\n---\n\n')

  const completion = await completeChat({
    model: getDefaultChatModel(),
    temperature: 0.25,
    maxTokens: 1400,
    messages: [
      {
        role: 'system',
        content: `You are Ozyman writing a daily operator brief.
Return ONLY valid JSON (no markdown fences):
{
  "greeting": "short warm line matching the time of day if given",
  "top_kicks": [
    {
      "rank": 1,
      "title": "actionable title grounded in FACTS",
      "why": "one-line why citing real subjects/repos/tasks from context",
      "source": "email|github|task|job|other",
      "action_hint": "what to do next",
      "deep_link_path": "/chat"
    }
  ],
  "wins": ["optional"],
  "sections": {},
  "unavailable": []
}
Rules:
- Exactly 3 top_kicks when possible (ranks 1,2,3).
- ONLY use people, subjects, repos, PR numbers, and tasks that appear in the FACTS context.
- NEVER invent calendar events, "trending" GitHub, or "no emails" if messages are listed.
- NEVER suggest "explore new repositories" or "browse trending" as a kick.
- If Gmail lists subjects, at least one kick MUST be about a specific email (name the subject).
- If open PRs list #numbers, prefer a kick naming the PR.
- If tasks are none and mail is empty, say so honestly and pick practical operator kicks (still no trending repos).
- Warm, short, no guilt.`,
      },
      {
        role: 'user',
        content: `Timezone: ${input.profile.timezone}\nLocal unavailable tools: ${unavailable.join(', ') || 'none'}\n\n${context}`,
      },
    ],
  })

  const raw = completion.content?.trim() ?? ''
  let payload: MorningBriefPayload
  try {
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim()
    const parsed = parseMorningBriefPayload(JSON.parse(cleaned))
    if (!parsed) {
      payload = fallbackFromContext(gmail.text, github.text, tasks)
      payload.tone_notes = `parse rejected: ${raw.slice(0, 160)}`
    } else {
      payload = {
        ...parsed,
        unavailable: Array.from(
          new Set([...(parsed.unavailable ?? []), ...unavailable]),
        ),
      }
      // Guardrail: reject fluff kicks about exploring repos when we have better signal
      const fluff = /explor(e|ing).*(repo|github)|trending|browse new/i
      if (
        payload.top_kicks.some((k) => fluff.test(k.title) || fluff.test(k.why))
      ) {
        const grounded = fallbackFromContext(gmail.text, github.text, tasks)
        payload = {
          ...grounded,
          greeting: payload.greeting || grounded.greeting,
          unavailable: payload.unavailable,
          tone_notes: 'replaced fluff kicks with grounded fallback',
        }
      }
    }
  } catch {
    payload = fallbackFromContext(gmail.text, github.text, tasks)
    payload.unavailable = unavailable
    payload.tone_notes = `json failed: ${raw.slice(0, 160)}`
  }

  let artifactId: string | null = null
  let threadId: string | null = null
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
            gmail_count: gmail.count,
          },
          mime_type: 'application/json',
        },
      ])
      .select('id')
      .single()

    artifactId = (art as { id?: string } | null)?.id ?? null
  } catch (e) {
    console.error('[brief] persist failed', e)
  }

  return { payload, artifactId, threadId }
}
