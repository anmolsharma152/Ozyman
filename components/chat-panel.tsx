'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type UiMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
}

type PendingConfirm = {
  toolRunId: string
  preview: Record<string, unknown>
}

type RunResult = {
  threadId?: string
  assistantMessage?: string
  pendingToolRunId?: string | null
  status?: string
}

type ChatPanelProps = {
  initialThreadId?: string | null
}

export function ChatPanel({ initialThreadId = null }: ChatPanelProps) {
  const [threadId, setThreadId] = useState<string | null>(initialThreadId)
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [statusLine, setStatusLine] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, statusLine, pending])

  const setBusySafe = (v: boolean) => {
    busyRef.current = v
    setBusy(v)
  }

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || busyRef.current) return

    setError(null)
    setInput('')
    setBusySafe(true)
    setStatusLine('Thinking…')
    setPending(null)

    const userMsg: UiMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
    }
    setMessages((m) => [...m, userMsg])

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    // Hard cap so UI never sticks forever
    const kill = window.setTimeout(() => ac.abort(), 120_000)

    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          threadId,
          stream: true,
        }),
        signal: ac.signal,
      })

      if (!res.ok) {
        let errMsg = `Request failed (${res.status})`
        try {
          const j = (await res.json()) as { error?: string }
          if (j?.error) errMsg = j.error
        } catch {
          /* ignore */
        }
        throw new Error(errMsg)
      }

      if (!res.body) {
        // Fallback: some proxies strip stream bodies
        const j = (await res.json()) as {
          assistantMessage?: string
          threadId?: string
          error?: string
          pendingToolRunId?: string | null
        }
        if (j.error) throw new Error(j.error)
        if (j.threadId) setThreadId(j.threadId)
        setMessages((m) => [
          ...m,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: j.assistantMessage || '…',
          },
        ])
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let assistantDraft = ''
      let lastResult: RunResult | null = null
      let sawError: string | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''

        for (const chunk of chunks) {
          const line = chunk.split('\n').find((l) => l.startsWith('data: '))
          if (!line) continue
          let event: Record<string, unknown>
          try {
            event = JSON.parse(line.slice(6)) as Record<string, unknown>
          } catch {
            continue
          }

          const type = event.type as string
          if (type === 'tool_start') {
            setStatusLine(`Using ${(event.slug as string) ?? 'tool'}…`)
          } else if (type === 'tool_result') {
            setStatusLine(
              event.status === 'succeeded'
                ? 'Got it — reading results…'
                : `Tool ${(event.status as string) ?? 'failed'}`,
            )
          } else if (type === 'token') {
            assistantDraft += String(event.text ?? '')
            setStatusLine(null)
          } else if (type === 'awaiting_confirmation') {
            setPending({
              toolRunId: String(event.toolRunId),
              preview: (event.preview as Record<string, unknown>) ?? {},
            })
            setStatusLine('Needs your OK')
          } else if (type === 'error') {
            sawError = String(event.message ?? 'Something went wrong')
            setError(sawError)
          } else if (type === 'result') {
            lastResult = (event.data ?? null) as RunResult | null
          } else if (type === 'done') {
            setStatusLine(null)
          }
        }
      }

      if (lastResult?.threadId) {
        setThreadId(lastResult.threadId)
      }

      const finalText =
        lastResult?.assistantMessage ||
        assistantDraft ||
        sawError ||
        '…'

      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: finalText,
        },
      ])
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Timed out or cancelled — try a shorter question.')
        setMessages((m) => [
          ...m,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            content: 'That took too long — try again with a shorter ask.',
          },
        ])
      } else {
        const msg = err instanceof Error ? err.message : 'Chat failed'
        setError(msg)
        setMessages((m) => [
          ...m,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            content: `Hmm — ${msg}`,
          },
        ])
      }
    } finally {
      window.clearTimeout(kill)
      setBusySafe(false)
      setStatusLine(null)
    }
  }, [input, threadId])

  const decide = useCallback(
    async (decision: 'confirm' | 'reject') => {
      if (!pending || busyRef.current) return
      setBusySafe(true)
      setError(null)
      try {
        const res = await fetch('/api/agent/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toolRunId: pending.toolRunId,
            decision,
          }),
        })
        const j = (await res.json()) as {
          ok?: boolean
          error?: string
          status?: string
        }
        if (!res.ok) {
          throw new Error(j.error ?? 'Confirm failed')
        }
        setPending(null)
        setMessages((m) => [
          ...m,
          {
            id: `c-${Date.now()}`,
            role: 'assistant',
            content:
              decision === 'reject'
                ? 'Okay — cancelled. Nothing was sent.'
                : j.ok
                  ? 'Done — action completed after your OK.'
                  : `That didn’t work: ${j.error ?? 'unknown error'}`,
          },
        ])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Confirm failed')
      } finally {
        setBusySafe(false)
      }
    },
    [pending],
  )

  return (
    <div className="flex min-h-[70dvh] flex-1 flex-col gap-3">
      <div className="card flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 sm:p-4">
        <div className="min-h-[12rem] flex-1 space-y-3 overflow-y-auto px-1 py-2">
          {messages.length === 0 ? (
            <div className="space-y-2 px-2 py-6 text-sm text-shell-muted">
              <p className="text-base font-medium text-shell-fg">
                Hey — ask me what matters.
              </p>
              <p>Try:</p>
              <ul className="list-inside list-disc space-y-1">
                <li>“What’s unread and important in Gmail?”</li>
                <li>“Who am I on GitHub?”</li>
                <li>“List open PRs on anmolsharma152/Ozyman”</li>
              </ul>
              <p className="pt-2 text-xs">
                Connect Gmail/GitHub under Apps first. Sends need your OK.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === 'user'
                    ? 'ml-6 rounded-2xl bg-shell-accent/15 px-3 py-2 text-sm text-shell-fg'
                    : 'mr-4 rounded-2xl bg-shell-surface px-3 py-2 text-sm text-shell-fg ring-1 ring-shell-border'
                }
              >
                <div className="mb-0.5 text-[10px] uppercase tracking-wide text-shell-muted">
                  {m.role === 'user' ? 'You' : 'Ozyman'}
                </div>
                <div className="whitespace-pre-wrap leading-relaxed">
                  {m.content}
                </div>
              </div>
            ))
          )}
          {statusLine ? (
            <p className="animate-pulse px-2 text-xs text-shell-muted">
              {statusLine}
            </p>
          ) : null}
          <div ref={bottomRef} />
        </div>

        {pending ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm">
            <p className="font-medium text-amber-50">
              Want me to go ahead with this?
            </p>
            <pre className="mt-2 max-h-28 overflow-auto rounded-xl bg-black/30 p-2 text-xs text-shell-muted">
              {JSON.stringify(pending.preview, null, 2)}
            </pre>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="btn-primary flex-1"
                disabled={busy}
                onClick={() => void decide('confirm')}
              >
                Yes, do it
              </button>
              <button
                type="button"
                className="btn-ghost flex-1"
                disabled={busy}
                onClick={() => void decide('reject')}
              >
                No, cancel
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="px-1 text-xs text-amber-200">
            {error}
          </p>
        ) : null}

        {/* Composer — button must NOT use w-full (btn-primary no longer forces it) */}
        <form
          className="flex w-full items-stretch gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder="Message Ozyman…"
            autoComplete="off"
            className="min-h-12 min-w-0 flex-1 rounded-2xl border border-shell-border bg-shell-bg px-4 text-base text-shell-fg outline-none ring-shell-accent/40 placeholder:text-shell-muted/60 focus:ring-2 disabled:opacity-60"
          />
          <button
            type="submit"
            className="btn-primary min-h-12 w-auto shrink-0 px-5"
            disabled={busy || !input.trim()}
            aria-label="Send message"
          >
            {busy ? '…' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  )
}
