/**
 * Morning Top-3 Kicks — gather Gmail (+ optional GH) then rank with the buddy model.
 * Next/Node path (cron can hit /api/brief/run with CRON_SECRET).
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

async function gatherGmail(
  entityId: string,
): Promise<{ text: string; ok: boolean; error?: string }> {
  const r = await executeTool('GMAIL_FETCH_EMAILS', entityId, {
    max_results: 12,
    query: 'is:unread newer_than:3d',
    verbose: false,
  })
  if (!r.successful) {
    const error = r.error ?? 'error'
    return {
      ok: false,
      error,
      text: `Gmail unavailable: ${error}`,
    }
  }
  return {
    ok: true,
    text: `Gmail unread sample:\n${clip(JSON.stringify(r.data), 6000)}`,
  }
}

async function gatherGithub(
  entityId: string,
  repos: Array<{ owner: string; repo: string }>,
): Promise<{ text: string; ok: boolean; error?: string }> {
  const parts: string[] = []
  let ok = true
  let error: string | undefined
  const me = await executeTool('GITHUB_GET_THE_AUTHENTICATED_USER', entityId, {})
  if (me.successful) {
    parts.push(`GitHub user: ${clip(JSON.stringify(me.data), 800)}`)
  } else {
    ok = false
    error = me.error ?? 'error'
    parts.push(`GitHub user unavailable: ${error}`)
  }

  for (const { owner, repo } of repos.slice(0, 5)) {
    const prs = await executeTool('GITHUB_LIST_PULL_REQUESTS', entityId, {
      owner,
      repo,
      state: 'open',
      per_page: 10,
    })
    if (prs.successful) {
      parts.push(
        `Open PRs ${owner}/${repo}:\n${clip(JSON.stringify(prs.data), 2500)}`,
      )
    } else {
      parts.push(`Open PRs ${owner}/${repo}: ${prs.error ?? 'failed'}`)
    }
  }
  if (repos.length === 0) {
    parts.push('No watched github_repos in profile.settings yet.')
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
    return `Open tasks:\n${clip(JSON.stringify(data ?? []), 3000)}`
  } catch (e) {
    return `Tasks: ${e instanceof Error ? e.message : 'error'}`
  }
}

function fallbackPayload(note: string): MorningBriefPayload {
  return {
    greeting: 'Morning. Here’s a simple start while tools settle.',
    top_kicks: [
      {
        rank: 1,
        title: 'Check Gmail for anything urgent',
        why: 'Inbox is the usual firehose — start there.',
        source: 'email',
        action_hint: 'Open Chat and ask about unread mail',
        deep_link_path: '/chat',
      },
      {
        rank: 2,
        title: 'Scan open tasks',
        why: 'Stay oriented even when mail is noisy.',
        source: 'task',
        action_hint: 'Open Tasks',
        deep_link_path: '/tasks',
      },
      {
        rank: 3,
        title: 'Glance at GitHub',
        why: 'PRs waiting on you compound fast.',
        source: 'github',
        action_hint: 'Ask chat for open PRs on a watched repo',
        deep_link_path: '/chat',
      },
    ],
    wins: [],
    sections: {},
    unavailable: [],
    tone_notes: note,
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
  const repos = input.profile.settings?.github_repos ?? []
  const unavailable: string[] = []

  const [gmail, github, tasks] = await Promise.all([
    gatherGmail(entityId),
    gatherGithub(entityId, repos),
    gatherTasks(input.user.id),
  ])
  if (!gmail.ok) unavailable.push('gmail')
  if (!github.ok) unavailable.push('github')

  const context = [gmail.text, github.text, tasks].join('\n\n---\n\n')

  const completion = await completeChat({
    model: getDefaultChatModel(),
    temperature: 0.35,
    maxTokens: 1400,
    messages: [
      {
        role: 'system',
        content: `You are Ozyman writing a morning brief for a buddy.
Return ONLY valid JSON (no markdown fences) with this shape:
{
  "greeting": "short warm morning line",
  "top_kicks": [
    {
      "rank": 1,
      "title": "actionable title",
      "why": "one-line why",
      "source": "email|github|task|job|other",
      "action_hint": "what to do",
      "deep_link_path": "/chat"
    }
  ],
  "wins": ["optional short win strings"],
  "sections": {},
  "unavailable": ["gmail"]
}
Require 1–3 top_kicks with ranks 1..n. Warm, short, no guilt.`,
      },
      {
        role: 'user',
        content: `Timezone: ${input.profile.timezone}\nUnavailable so far: ${unavailable.join(', ') || 'none'}\n\nContext:\n${context}`,
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
      payload = fallbackPayload(`parse rejected: ${raw.slice(0, 180)}`)
    } else {
      payload = {
        ...parsed,
        unavailable: Array.from(
          new Set([...(parsed.unavailable ?? []), ...unavailable]),
        ),
      }
    }
  } catch {
    payload = fallbackPayload(`json failed: ${raw.slice(0, 180)}`)
    payload.unavailable = unavailable
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
          title: `Morning brief ${new Date().toLocaleDateString()}`,
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
          title: 'Morning Top-3 Kicks',
          body: payload,
          thread_id: threadId,
          metadata: { source: 'morning_brief' },
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
