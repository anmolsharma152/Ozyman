/**
 * Orchestrate one interactive chat turn: rate limits, thread, loop, messages.
 */

import 'server-only'

import { ensureProfile } from '@/lib/profile/ensureProfile'
import { resolveEntityId } from '@/lib/composio/entity'
import { executeTool } from '@/lib/composio/execute'
import { runAgentLoop } from './loop'
import {
  createAgentPersist,
  countActiveInteractiveRuns,
  countInteractiveRunsLastHour,
  createChatThread,
  insertMessage,
  listThreadMessages,
} from './persist'
import { chatToolsForMode } from './tools'
import {
  MAX_CONCURRENT_INTERACTIVE_RUNS,
  MAX_INTERACTIVE_RUNS_PER_HOUR,
  type AgentLoopResult,
  type AgentSSEEvent,
  type ChatMessage,
} from './types'
import type { SessionUser } from '@/app/lib/auth'

export type ChatRunInput = {
  user: SessionUser
  message: string
  threadId?: string | null
  onEvent?: (event: AgentSSEEvent) => void | Promise<void>
}

export type ChatRunOutput = AgentLoopResult & {
  threadId: string
  assistantMessage: string
}

function historyFromDb(
  rows: Array<{ role: string; content: string }>,
): ChatMessage[] {
  const out: ChatMessage[] = []
  for (const r of rows) {
    if (r.role === 'user' || r.role === 'assistant') {
      out.push({ role: r.role, content: r.content })
    }
  }
  // drop last user if we're about to re-append the same message
  return out.slice(-30)
}

export async function runChatTurn(input: ChatRunInput): Promise<ChatRunOutput> {
  const text = input.message.trim()
  if (!text) {
    throw new Error('Message is empty')
  }
  if (text.length > 8000) {
    throw new Error('Message too long (max 8000 characters)')
  }

  const profile = await ensureProfile(input.user)
  if (!profile) {
    throw new Error('Profile not ready — try refreshing')
  }

  const active = await countActiveInteractiveRuns(input.user.id)
  if (active >= MAX_CONCURRENT_INTERACTIVE_RUNS) {
    throw new Error('Already working on something — wait a moment?')
  }

  const hourCount = await countInteractiveRunsLastHour(input.user.id)
  if (hourCount >= MAX_INTERACTIVE_RUNS_PER_HOUR) {
    throw new Error('Hit the hourly chat limit — try again later.')
  }

  let threadId = input.threadId ?? null
  if (!threadId) {
    const title =
      text.length > 60 ? `${text.slice(0, 57)}…` : text
    const t = await createChatThread(input.user.id, title)
    threadId = t.id
  }

  await insertMessage({
    thread_id: threadId,
    user_id: input.user.id,
    role: 'user',
    content: text,
  })

  const prior = await listThreadMessages(threadId, 40)
  // prior includes the user message we just wrote — use as history without double-adding
  const history = historyFromDb(prior.slice(0, -1))

  const { entityId } = resolveEntityId(profile, input.user.id)
  const persist = createAgentPersist()
  const tools = chatToolsForMode('chat')

  const result = await runAgentLoop(
    {
      userId: input.user.id,
      persist,
      onEvent: input.onEvent,
      executeTool: async ({ slug, args }) => {
        const exec = await executeTool(slug, entityId, args)
        if (!exec.successful) {
          return {
            ok: false,
            summary: exec.error ?? 'Tool failed',
            error: exec.error ?? 'Tool failed',
          }
        }
        // Truncate for model + storage
        const payload = exec.data ?? {}
        const json = JSON.stringify(payload)
        const clipped =
          json.length > 12000 ? `${json.slice(0, 12000)}…` : json
        return {
          ok: true,
          summary: clipped.slice(0, 500),
          resultRef: {
            preview: clipped.slice(0, 4000),
            bytes: json.length,
          },
        }
      },
    },
    {
      input: text,
      mode: 'chat',
      threadId,
      history,
      tools,
      maxSteps: 10,
    },
  )

  // Feed richer tool results to the model is already in the loop via summary.
  // For better answers, patch: tool message should include resultRef.preview.
  // The loop currently only sends summary — enhance toolMessage in a follow-up if needed.

  const assistantMessage =
    result.outputSummary ||
    (result.status === 'waiting_confirmation'
      ? 'I prepared something that needs your OK before I do it.'
      : result.error || '…')

  await insertMessage({
    thread_id: threadId,
    user_id: input.user.id,
    role: 'assistant',
    content: assistantMessage,
    agent_run_id: result.runId,
  })

  return {
    ...result,
    threadId,
    assistantMessage,
  }
}
