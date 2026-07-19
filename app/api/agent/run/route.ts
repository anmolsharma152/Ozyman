import { NextResponse } from 'next/server'
import { getSessionUser } from '@/app/lib/auth'
import { runChatTurn } from '@/lib/agent/run-chat'
import type { AgentSSEEvent } from '@/lib/agent/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/agent/run
 * Body: { message: string, threadId?: string, stream?: boolean }
 *
 * stream=true → text/event-stream with AgentSSEEvent JSON lines
 * stream=false/default → JSON result
 */
export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { message?: string; threadId?: string | null; stream?: boolean }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const message = String(body.message ?? '').trim()
  if (!message) {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }

  const threadId = body.threadId ?? null
  const stream = Boolean(body.stream)

  if (!stream) {
    try {
      const result = await runChatTurn({
        user,
        message,
        threadId,
      })
      return NextResponse.json({
        ok: result.status !== 'failed',
        threadId: result.threadId,
        runId: result.runId,
        status: result.status,
        assistantMessage: result.assistantMessage,
        pendingToolRunId: result.pendingToolRunId ?? null,
        error: result.error ?? null,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Chat failed'
      console.error('[api/agent/run]', err)
      return NextResponse.json({ error: msg }, { status: 400 })
    }
  }

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      const send = (event: AgentSSEEvent | { type: 'result'; data: unknown }) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        )
      }

      try {
        const result = await runChatTurn({
          user,
          message,
          threadId,
          onEvent: async (event) => {
            send(event)
          },
        })
        send({
          type: 'result',
          data: {
            threadId: result.threadId,
            runId: result.runId,
            status: result.status,
            assistantMessage: result.assistantMessage,
            pendingToolRunId: result.pendingToolRunId ?? null,
          },
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Chat failed'
        console.error('[api/agent/run] stream', err)
        send({ type: 'error', message: msg })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
