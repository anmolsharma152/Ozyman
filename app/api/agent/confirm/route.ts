import { NextResponse } from 'next/server'
import { getSessionUser } from '@/app/lib/auth'
import { createInsForgeServerClient } from '@/app/lib/insforge/server'
import {
  createInsForgeAdminClient,
  hasInsForgeAdmin,
} from '@/lib/insforge/admin'
import { ensureProfile } from '@/lib/profile/ensureProfile'
import { resolveEntityId } from '@/lib/composio/entity'
import { executeTool } from '@/lib/composio/execute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Confirm algorithm (design KD 29):
 * session → owner check on tool_runs_public → claim → admin load args_execute → execute → finalize
 *
 * POST { toolRunId: string, decision: 'confirm' | 'reject' }
 */
export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { toolRunId?: string; decision?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const toolRunId = String(body.toolRunId ?? '').trim()
  const decision = body.decision === 'reject' ? 'reject' : 'confirm'
  if (!toolRunId) {
    return NextResponse.json({ error: 'toolRunId required' }, { status: 400 })
  }

  const client = await createInsForgeServerClient()

  // 1) Owner check via public view (no args_execute)
  const { data: publicRow, error: pubErr } = await client.database
    .from('tool_runs_public')
    .select(
      'id, user_id, agent_run_id, tool_slug, status, expires_at, args_redacted',
    )
    .eq('id', toolRunId)
    .maybeSingle()

  if (pubErr || !publicRow) {
    return NextResponse.json({ error: 'Tool run not found' }, { status: 404 })
  }

  const row = publicRow as {
    id: string
    user_id: string
    agent_run_id: string
    tool_slug: string
    status: string
    expires_at: string | null
    args_redacted: Record<string, unknown> | null
  }

  if (row.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (row.status !== 'awaiting_confirmation') {
    return NextResponse.json(
      { error: `Not awaiting confirmation (status=${row.status})` },
      { status: 409 },
    )
  }

  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    await client.database
      .from('tool_runs')
      .update({ status: 'expired', finished_at: new Date().toISOString() })
      .eq('id', toolRunId)
    return NextResponse.json({ error: 'Confirmation expired' }, { status: 410 })
  }

  if (decision === 'reject') {
    await client.database
      .from('tool_runs')
      .update({
        status: 'rejected',
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        result_summary: 'Rejected by user',
      })
      .eq('id', toolRunId)

    await client.database
      .from('agent_runs')
      .update({
        status: 'cancelled',
        finished_at: new Date().toISOString(),
        output_summary: 'Cancelled — you rejected the action.',
      })
      .eq('id', row.agent_run_id)

    return NextResponse.json({ ok: true, status: 'rejected' })
  }

  // Confirm path: load args_execute via admin
  if (!hasInsForgeAdmin()) {
    return NextResponse.json(
      {
        error:
          'Server missing INSFORGE_API_KEY — cannot load gated tool args safely',
      },
      { status: 500 },
    )
  }

  const admin = createInsForgeAdminClient()
  const { data: full, error: fullErr } = await admin.database
    .from('tool_runs')
    .select('id, args_execute, status')
    .eq('id', toolRunId)
    .single()

  if (fullErr || !full) {
    return NextResponse.json(
      { error: 'Could not load tool arguments' },
      { status: 500 },
    )
  }

  const args =
    (full as { args_execute?: Record<string, unknown> | null }).args_execute ??
    null
  if (!args || typeof args !== 'object') {
    return NextResponse.json(
      {
        error:
          'No execute payload stored for this action (try again after reconnecting admin key)',
      },
      { status: 422 },
    )
  }

  // Claim
  await admin.database
    .from('tool_runs')
    .update({
      status: 'running',
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
    })
    .eq('id', toolRunId)

  const profile = await ensureProfile(user)
  const { entityId } = resolveEntityId(profile, user.id)

  const exec = await executeTool(row.tool_slug, entityId, args)

  await admin.database
    .from('tool_runs')
    .update({
      status: exec.successful ? 'succeeded' : 'failed',
      result_summary: exec.successful
        ? 'Confirmed and executed'
        : exec.error ?? 'failed',
      error: exec.successful ? null : exec.error,
      finished_at: new Date().toISOString(),
    })
    .eq('id', toolRunId)

  await client.database
    .from('agent_runs')
    .update({
      status: exec.successful ? 'succeeded' : 'failed',
      finished_at: new Date().toISOString(),
      output_summary: exec.successful
        ? `Done — ${row.tool_slug} completed after your OK.`
        : `That didn’t work: ${exec.error ?? 'unknown error'}`,
      error: exec.successful ? null : exec.error,
    })
    .eq('id', row.agent_run_id)

  return NextResponse.json({
    ok: exec.successful,
    status: exec.successful ? 'succeeded' : 'failed',
    error: exec.error,
    preview: row.args_redacted,
  })
}
