/**
 * Next.js interactive agent types (Node runtime only).
 * Design: docs/design-ozyman-personal-operator-os.md — Agent runtime model.
 *
 * Do not import this module from Deno edge functions.
 */

import type { AgentMode, GateDecision } from '@ozyman/policy'

export type { AgentMode, GateDecision }

export type AgentTrigger = 'user' | 'schedule' | 'webhook'

export type AgentRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_confirmation'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired'

export type ToolRunStatus =
  | 'pending'
  | 'running'
  | 'awaiting_confirmation'
  | 'succeeded'
  | 'failed'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'denied'

export interface AgentRunRequest {
  threadId?: string
  input: string
  mode: AgentMode
  maxSteps?: number
}

/** Default / hard caps for interactive loops (PR-06 enforces in API). */
export const DEFAULT_MAX_STEPS = 12
export const HARD_MAX_STEPS = 20

/** Confirm TTL for gated tool_runs (hours). */
export const CONFIRM_TTL_HOURS = 24

/** Max concurrent interactive runs (trigger=user, status queued|running). */
export const MAX_CONCURRENT_INTERACTIVE_RUNS = 1

/** Max interactive agent_runs per user per rolling hour. */
export const MAX_INTERACTIVE_RUNS_PER_HOUR = 30

export type AgentSSEEvent =
  | { type: 'run_started'; runId: string }
  | { type: 'token'; text: string }
  | { type: 'tool_start'; toolRunId: string; slug: string }
  | { type: 'tool_result'; toolRunId: string; status: string; summary?: string }
  | {
      type: 'awaiting_confirmation'
      toolRunId: string
      preview: Record<string, unknown>
    }
  | { type: 'done'; runId: string; status: string }
  | { type: 'error'; message: string }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  /** OpenAI tool call id when role=tool */
  tool_call_id?: string
  name?: string
  tool_calls?: ChatToolCall[]
}

export interface ChatToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ChatToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

export interface AgentRunRow {
  id: string
  user_id: string
  thread_id: string | null
  trigger: AgentTrigger
  mode: AgentMode
  status: AgentRunStatus
  input: string | null
  output_summary: string | null
  error: string | null
  metadata: Record<string, unknown> | null
  step_count: number
  model: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

/** Safe columns only — matches tool_runs_public (never args_execute). */
export interface ToolRunPublicRow {
  id: string
  user_id: string
  agent_run_id: string
  tool_slug: string
  args_redacted: Record<string, unknown> | null
  status: ToolRunStatus
  result_summary: string | null
  result_ref: Record<string, unknown> | null
  error: string | null
  expires_at: string | null
  confirmed_at: string | null
  confirmed_by: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export interface ToolExecuteRequest {
  toolRunId: string
  slug: string
  args: Record<string, unknown>
  userId: string
  agentRunId: string
}

export interface ToolExecuteResult {
  ok: boolean
  summary?: string
  resultRef?: Record<string, unknown>
  error?: string
}

/** Dependencies the loop uses so Composio / DB can be injected (PR-05/06). */
export interface AgentLoopDeps {
  userId: string
  /** Insert/update agent_runs + tool_runs (user-scoped or admin as appropriate). */
  persist: AgentPersist
  /** Optional: execute allow-gated tools (Composio). Omit → stub success for structure. */
  executeTool?: (req: ToolExecuteRequest) => Promise<ToolExecuteResult>
  /** Optional chat completion; defaults to OpenRouter client. */
  complete?: (args: {
    messages: ChatMessage[]
    tools?: ChatToolDefinition[]
    model?: string
  }) => Promise<ChatCompletionResult>
  onEvent?: (event: AgentSSEEvent) => void | Promise<void>
}

export interface ChatCompletionResult {
  content: string | null
  tool_calls?: ChatToolCall[]
  model?: string
  finish_reason?: string | null
}

export interface AgentPersist {
  insertAgentRun: (row: {
    user_id: string
    thread_id?: string | null
    trigger: AgentTrigger
    mode: AgentMode
    status: AgentRunStatus
    input?: string | null
    model?: string | null
    started_at?: string | null
    metadata?: Record<string, unknown> | null
  }) => Promise<AgentRunRow>

  updateAgentRun: (
    id: string,
    patch: Partial<{
      status: AgentRunStatus
      output_summary: string | null
      error: string | null
      metadata: Record<string, unknown> | null
      step_count: number
      model: string | null
      started_at: string | null
      finished_at: string | null
    }>,
  ) => Promise<void>

  /**
   * Insert a tool_run. args_execute must only be written via admin/definer
   * when the caller lacks column privileges (user-scoped path stores redacted only;
   * admin path may include args_execute for gated confirms).
   */
  insertToolRun: (row: {
    user_id: string
    agent_run_id: string
    tool_slug: string
    args_redacted?: Record<string, unknown> | null
    args_execute?: Record<string, unknown> | null
    status: ToolRunStatus
    expires_at?: string | null
    started_at?: string | null
    finished_at?: string | null
    result_summary?: string | null
    error?: string | null
  }) => Promise<ToolRunPublicRow>

  updateToolRun: (
    id: string,
    patch: Partial<{
      status: ToolRunStatus
      result_summary: string | null
      result_ref: Record<string, unknown> | null
      error: string | null
      started_at: string | null
      finished_at: string | null
    }>,
  ) => Promise<void>
}

export interface AgentLoopResult {
  runId: string
  status: AgentRunStatus
  outputSummary?: string
  error?: string
  stepCount: number
  pendingToolRunId?: string
}
