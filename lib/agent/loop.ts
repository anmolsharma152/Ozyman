/**
 * Interactive agent tool-calling loop (Next / Node only).
 *
 * Structure is real; Composio execute + full SSE route land in PR-05/06.
 * Deno morning-brief does NOT import this module — self-contained pipeline there.
 *
 * Rules (MVP):
 * - policy.resolve every tool_call; unknown → denied tool_run, no execute
 * - allow → execute (if deps.executeTool) + succeeded/failed tool_run
 * - require_confirmation → write tool_run + agent_run waiting_confirmation, STOP
 * - maxSteps default 12, hard max 20
 */

import 'server-only'

import { resolve } from './policy'
import { completeChat, DEFAULT_BUDDY_SYSTEM_PROMPT, getDefaultChatModel } from './openai'
import {
  type AgentLoopDeps,
  type AgentLoopResult,
  type AgentMode,
  type AgentRunStatus,
  type ChatMessage,
  type ChatToolDefinition,
  type ChatToolCall,
  CONFIRM_TTL_HOURS,
  DEFAULT_MAX_STEPS,
  HARD_MAX_STEPS,
} from './types'

export interface RunAgentLoopInput {
  input: string
  mode: AgentMode
  threadId?: string | null
  maxSteps?: number
  systemPrompt?: string
  /** Prior messages (without system). */
  history?: ChatMessage[]
  /** Server-filtered tool schemas for this mode. */
  tools?: ChatToolDefinition[]
  /** trigger defaults to user for interactive. */
  trigger?: 'user' | 'schedule' | 'webhook'
  model?: string
}

function clampMaxSteps(requested?: number): number {
  const n = requested ?? DEFAULT_MAX_STEPS
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_STEPS
  return Math.min(Math.floor(n), HARD_MAX_STEPS)
}

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return { _raw: raw }
  } catch {
    return { _raw: raw, _parse_error: true }
  }
}

/** Shallow redaction: drop obvious secrets; keep structure for UI preview. */
export function redactArgs(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const SENSITIVE =
    /password|secret|token|authorization|api[_-]?key|cookie|credential/i
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    if (SENSITIVE.test(k)) {
      out[k] = '[redacted]'
    } else if (typeof v === 'string' && v.length > 2000) {
      out[k] = `${v.slice(0, 2000)}…`
    } else {
      out[k] = v
    }
  }
  return out
}

function expiresAtIso(hours = CONFIRM_TTL_HOURS): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Run one interactive agent loop until final text, gate, failure, or maxSteps.
 */
export async function runAgentLoop(
  deps: AgentLoopDeps,
  input: RunAgentLoopInput,
): Promise<AgentLoopResult> {
  const maxSteps = clampMaxSteps(input.maxSteps)
  const model = input.model ?? getDefaultChatModel()
  const trigger = input.trigger ?? 'user'
  const complete = deps.complete ?? completeChat

  const emit = async (
    event: Parameters<NonNullable<AgentLoopDeps['onEvent']>>[0],
  ) => {
    if (deps.onEvent) await deps.onEvent(event)
  }

  const run = await deps.persist.insertAgentRun({
    user_id: deps.userId,
    thread_id: input.threadId ?? null,
    trigger,
    mode: input.mode,
    status: 'running',
    input: input.input,
    model,
    started_at: nowIso(),
  })

  await emit({ type: 'run_started', runId: run.id })

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: input.systemPrompt ?? DEFAULT_BUDDY_SYSTEM_PROMPT,
    },
    ...(input.history ?? []),
    { role: 'user', content: input.input },
  ]

  let stepCount = 0
  let lastAssistantText = ''

  try {
    while (stepCount < maxSteps) {
      stepCount += 1
      await deps.persist.updateAgentRun(run.id, { step_count: stepCount })

      const completion = await complete({
        messages,
        tools: input.tools,
        model,
      })

      if (completion.model) {
        await deps.persist.updateAgentRun(run.id, { model: completion.model })
      }

      const toolCalls = completion.tool_calls ?? []
      const content = completion.content?.trim() ?? ''

      if (!toolCalls.length) {
        lastAssistantText = content
        if (content) {
          await emit({ type: 'token', text: content })
        }
        await finish(deps, run.id, 'succeeded', content || 'Done.', stepCount)
        await emit({ type: 'done', runId: run.id, status: 'succeeded' })
        return {
          runId: run.id,
          status: 'succeeded',
          outputSummary: content || 'Done.',
          stepCount,
        }
      }

      // Assistant turn with tool calls
      messages.push({
        role: 'assistant',
        content: content || '',
        tool_calls: toolCalls,
      })
      if (content) {
        lastAssistantText = content
        await emit({ type: 'token', text: content })
      }

      for (const call of toolCalls) {
        const gateResult = await handleToolCall(deps, {
          runId: run.id,
          userId: deps.userId,
          mode: input.mode,
          call,
          emit,
        })

        if (gateResult.kind === 'stop_confirmation') {
          await finish(
            deps,
            run.id,
            'waiting_confirmation',
            lastAssistantText ||
              'I drafted this — want me to send/apply?',
            stepCount,
          )
          await emit({
            type: 'done',
            runId: run.id,
            status: 'waiting_confirmation',
          })
          return {
            runId: run.id,
            status: 'waiting_confirmation',
            outputSummary:
              lastAssistantText ||
              'I drafted this — want me to send/apply?',
            stepCount,
            pendingToolRunId: gateResult.toolRunId,
          }
        }

        // Feed tool result back for next model step
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content: gateResult.toolMessage,
        })
      }
    }

    // Hit max steps without a final non-tool response
    const summary = lastAssistantText || `Stopped after ${maxSteps} steps.`
    await finish(deps, run.id, 'succeeded', summary, stepCount)
    await emit({ type: 'done', runId: run.id, status: 'succeeded' })
    return {
      runId: run.id,
      status: 'succeeded',
      outputSummary: summary,
      stepCount,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await finish(deps, run.id, 'failed', null, stepCount, message)
    await emit({ type: 'error', message })
    await emit({ type: 'done', runId: run.id, status: 'failed' })
    return {
      runId: run.id,
      status: 'failed',
      error: message,
      stepCount,
    }
  }
}

async function finish(
  deps: AgentLoopDeps,
  runId: string,
  status: AgentRunStatus,
  outputSummary: string | null,
  stepCount: number,
  error?: string,
): Promise<void> {
  await deps.persist.updateAgentRun(runId, {
    status,
    output_summary: outputSummary,
    error: error ?? null,
    step_count: stepCount,
    finished_at: nowIso(),
  })
}

type ToolCallOutcome =
  | { kind: 'continue'; toolMessage: string }
  | { kind: 'stop_confirmation'; toolRunId: string; toolMessage: string }

async function handleToolCall(
  deps: AgentLoopDeps,
  ctx: {
    runId: string
    userId: string
    mode: AgentMode
    call: ChatToolCall
    emit: (
      event: Parameters<NonNullable<AgentLoopDeps['onEvent']>>[0],
    ) => Promise<void>
  },
): Promise<ToolCallOutcome> {
  const slug = ctx.call.function.name
  const args = parseToolArgs(ctx.call.function.arguments)
  const redacted = redactArgs(args)
  const decision = resolve(slug, ctx.mode)

  if (decision.gate === 'deny') {
    const toolRun = await deps.persist.insertToolRun({
      user_id: ctx.userId,
      agent_run_id: ctx.runId,
      tool_slug: slug,
      args_redacted: redacted,
      status: 'denied',
      error: decision.reason ?? 'denied',
      finished_at: nowIso(),
    })
    await ctx.emit({
      type: 'tool_start',
      toolRunId: toolRun.id,
      slug,
    })
    await ctx.emit({
      type: 'tool_result',
      toolRunId: toolRun.id,
      status: 'denied',
      summary: decision.reason ?? 'denied',
    })
    return {
      kind: 'continue',
      toolMessage: JSON.stringify({
        ok: false,
        denied: true,
        reason: decision.reason ?? 'denied',
      }),
    }
  }

  if (decision.gate === 'require_confirmation') {
    // Store execute args via persist (admin path should set args_execute).
    // User-scoped clients cannot write args_execute column (REVOKE).
    const toolRun = await deps.persist.insertToolRun({
      user_id: ctx.userId,
      agent_run_id: ctx.runId,
      tool_slug: slug,
      args_redacted: redacted,
      args_execute: args,
      status: 'awaiting_confirmation',
      expires_at: expiresAtIso(),
      started_at: nowIso(),
    })
    await ctx.emit({
      type: 'tool_start',
      toolRunId: toolRun.id,
      slug,
    })
    await ctx.emit({
      type: 'awaiting_confirmation',
      toolRunId: toolRun.id,
      preview: redacted,
    })
    return {
      kind: 'stop_confirmation',
      toolRunId: toolRun.id,
      toolMessage: JSON.stringify({
        ok: false,
        awaiting_confirmation: true,
        tool_run_id: toolRun.id,
      }),
    }
  }

  // allow
  const toolRun = await deps.persist.insertToolRun({
    user_id: ctx.userId,
    agent_run_id: ctx.runId,
    tool_slug: slug,
    args_redacted: redacted,
    status: 'running',
    started_at: nowIso(),
  })
  await ctx.emit({ type: 'tool_start', toolRunId: toolRun.id, slug })

  let summary = 'ok'
  let ok = true
  let error: string | undefined
  let resultRef: Record<string, unknown> | undefined

  if (deps.executeTool) {
    const result = await deps.executeTool({
      toolRunId: toolRun.id,
      slug,
      args,
      userId: ctx.userId,
      agentRunId: ctx.runId,
    })
    ok = result.ok
    summary = result.summary ?? (ok ? 'ok' : result.error ?? 'failed')
    error = result.error
    resultRef = result.resultRef
  } else {
    // Structure stub until Composio wiring (PR-05/06)
    summary = `stub: ${slug} (no executeTool wired)`
  }

  await deps.persist.updateToolRun(toolRun.id, {
    status: ok ? 'succeeded' : 'failed',
    result_summary: summary,
    result_ref: resultRef ?? null,
    error: error ?? null,
    finished_at: nowIso(),
  })
  await ctx.emit({
    type: 'tool_result',
    toolRunId: toolRun.id,
    status: ok ? 'succeeded' : 'failed',
    summary,
  })

  return {
    kind: 'continue',
    toolMessage: JSON.stringify({
      ok,
      summary,
      ...(error ? { error } : {}),
      ...(resultRef ? { result_ref: resultRef } : {}),
    }),
  }
}

export { clampMaxSteps }
