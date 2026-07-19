/**
 * Agent run / tool run persistence via InsForge.
 * User-scoped client for normal rows; admin for args_execute on confirms.
 */

import 'server-only'

import { createInsForgeServerClient } from '@/app/lib/insforge/server'
import {
  createInsForgeAdminClient,
  hasInsForgeAdmin,
} from '@/lib/insforge/admin'
import type {
  AgentPersist,
  AgentRunRow,
  AgentRunStatus,
  AgentTrigger,
  ToolRunPublicRow,
  ToolRunStatus,
} from './types'
import type { AgentMode } from '@ozyman/policy'

const AGENT_RUN_SELECT =
  'id, user_id, thread_id, trigger, mode, status, input, output_summary, error, metadata, step_count, model, started_at, finished_at, created_at'

const TOOL_RUN_PUBLIC_SELECT =
  'id, user_id, agent_run_id, tool_slug, args_redacted, status, result_summary, result_ref, error, expires_at, confirmed_at, confirmed_by, started_at, finished_at, created_at'

function asAgentRun(row: Record<string, unknown>): AgentRunRow {
  return row as unknown as AgentRunRow
}

function asToolRun(row: Record<string, unknown>): ToolRunPublicRow {
  return row as unknown as ToolRunPublicRow
}

export function createAgentPersist(): AgentPersist {
  return {
    async insertAgentRun(row) {
      const client = await createInsForgeServerClient()
      const { data, error } = await client.database
        .from('agent_runs')
        .insert([
          {
            user_id: row.user_id,
            thread_id: row.thread_id ?? null,
            trigger: row.trigger,
            mode: row.mode,
            status: row.status,
            input: row.input ?? null,
            model: row.model ?? null,
            started_at: row.started_at ?? null,
            metadata: row.metadata ?? {},
            step_count: 0,
          },
        ])
        .select(AGENT_RUN_SELECT)
        .single()

      if (error || !data) {
        throw new Error(error?.message ?? 'Failed to insert agent_run')
      }
      return asAgentRun(data as Record<string, unknown>)
    },

    async updateAgentRun(id, patch) {
      const client = await createInsForgeServerClient()
      const { error } = await client.database
        .from('agent_runs')
        .update(patch)
        .eq('id', id)
      if (error) {
        throw new Error(error.message ?? 'Failed to update agent_run')
      }
    },

    async insertToolRun(row) {
      const wantsExecute = row.args_execute != null

      if (wantsExecute && hasInsForgeAdmin()) {
        const admin = createInsForgeAdminClient()
        const { data, error } = await admin.database
          .from('tool_runs')
          .insert([
            {
              user_id: row.user_id,
              agent_run_id: row.agent_run_id,
              tool_slug: row.tool_slug,
              args_redacted: row.args_redacted ?? null,
              args_execute: row.args_execute,
              status: row.status,
              expires_at: row.expires_at ?? null,
              started_at: row.started_at ?? null,
              finished_at: row.finished_at ?? null,
              result_summary: row.result_summary ?? null,
              error: row.error ?? null,
            },
          ])
          .select(TOOL_RUN_PUBLIC_SELECT)
          .single()

        if (error || !data) {
          throw new Error(error?.message ?? 'Failed to insert tool_run (admin)')
        }
        return asToolRun(data as Record<string, unknown>)
      }

      // User-scoped path: cannot set args_execute (column REVOKE)
      if (wantsExecute && !hasInsForgeAdmin()) {
        console.warn(
          '[agent/persist] args_execute requested but INSFORGE_API_KEY missing; storing redacted only',
        )
      }

      const client = await createInsForgeServerClient()
      const { data, error } = await client.database
        .from('tool_runs')
        .insert([
          {
            user_id: row.user_id,
            agent_run_id: row.agent_run_id,
            tool_slug: row.tool_slug,
            args_redacted: row.args_redacted ?? null,
            status: row.status,
            expires_at: row.expires_at ?? null,
            started_at: row.started_at ?? null,
            finished_at: row.finished_at ?? null,
            result_summary: row.result_summary ?? null,
            error: row.error ?? null,
          },
        ])
        .select(TOOL_RUN_PUBLIC_SELECT)
        .single()

      if (error || !data) {
        throw new Error(error?.message ?? 'Failed to insert tool_run')
      }
      return asToolRun(data as Record<string, unknown>)
    },

    async updateToolRun(id, patch) {
      const client = await createInsForgeServerClient()
      const { error } = await client.database
        .from('tool_runs')
        .update(patch)
        .eq('id', id)
      if (error) {
        throw new Error(error.message ?? 'Failed to update tool_run')
      }
    },
  }
}

/** Count concurrent interactive runs for rate limiting. */
export async function countActiveInteractiveRuns(
  userId: string,
): Promise<number> {
  const client = await createInsForgeServerClient()
  const { data, error } = await client.database
    .from('agent_runs')
    .select('id')
    .eq('user_id', userId)
    .eq('trigger', 'user')
    .in('status', ['queued', 'running'])

  if (error) {
    console.error('[agent/persist] count active', error)
    return 0
  }
  return data?.length ?? 0
}

export async function countInteractiveRunsLastHour(
  userId: string,
): Promise<number> {
  const client = await createInsForgeServerClient()
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data, error } = await client.database
    .from('agent_runs')
    .select('id')
    .eq('user_id', userId)
    .eq('trigger', 'user')
    .gte('created_at', since)

  if (error) {
    console.error('[agent/persist] count hour', error)
    return 0
  }
  return data?.length ?? 0
}

export async function createChatThread(
  userId: string,
  title?: string,
): Promise<{ id: string }> {
  const client = await createInsForgeServerClient()
  const { data, error } = await client.database
    .from('threads')
    .insert([
      {
        user_id: userId,
        kind: 'chat',
        status: 'open',
        title: title?.slice(0, 120) || 'Chat',
        metadata: {},
      },
    ])
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create thread')
  }
  return { id: (data as { id: string }).id }
}

export async function insertMessage(row: {
  thread_id: string
  user_id: string
  role: string
  content: string
  agent_run_id?: string | null
  parts?: unknown
}): Promise<void> {
  const client = await createInsForgeServerClient()
  const { error } = await client.database.from('messages').insert([
    {
      thread_id: row.thread_id,
      user_id: row.user_id,
      role: row.role,
      content: row.content,
      agent_run_id: row.agent_run_id ?? null,
      parts: row.parts ?? null,
    },
  ])
  if (error) {
    console.error('[agent/persist] insert message', error)
  }
}

export async function listThreadMessages(
  threadId: string,
  limit = 40,
): Promise<Array<{ role: string; content: string }>> {
  const client = await createInsForgeServerClient()
  const { data, error } = await client.database
    .from('messages')
    .select('role, content, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error || !data) {
    console.error('[agent/persist] list messages', error)
    return []
  }
  return (data as Array<{ role: string; content: string }>).map((m) => ({
    role: m.role,
    content: m.content,
  }))
}

export type { AgentRunStatus, AgentTrigger, AgentMode }
