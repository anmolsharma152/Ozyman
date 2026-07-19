'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { MorningBriefPayload } from '@ozyman/policy'

type KicksCardProps = {
  brief: {
    payload: MorningBriefPayload
    createdAt: string
  } | null
}

export function KicksCard({ brief }: KicksCardProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runBrief = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/brief/run', { method: 'POST' })
      const j = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(j.error ?? 'Brief failed')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Brief failed')
    } finally {
      setBusy(false)
    }
  }

  if (!brief) {
    return (
      <section className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Today&apos;s Top 3 Kicks</h2>
          <p className="mt-1 text-sm text-shell-muted">
            No brief yet — run one now or ask in chat.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary w-full"
          disabled={busy}
          onClick={() => void runBrief()}
        >
          {busy ? 'Gathering mail & GitHub…' : 'Run morning brief'}
        </button>
        <Link href="/chat" className="btn-ghost w-full text-center">
          Or just chat
        </Link>
        {error ? (
          <p className="text-xs text-amber-200" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    )
  }

  const { payload } = brief

  return (
    <section className="card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Today&apos;s Top 3 Kicks</h2>
          <p className="mt-1 text-sm text-shell-muted">{payload.greeting}</p>
        </div>
        <button
          type="button"
          className="btn-ghost text-xs"
          disabled={busy}
          onClick={() => void runBrief()}
        >
          {busy ? '…' : 'Refresh'}
        </button>
      </div>

      <ol className="space-y-3">
        {payload.top_kicks.map((k) => (
          <li
            key={k.rank}
            className="rounded-2xl border border-shell-border bg-shell-surface/60 px-4 py-3"
          >
            <div className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-shell-accent/20 text-xs font-semibold text-shell-accent">
                {k.rank}
              </span>
              <div className="min-w-0 space-y-1">
                <p className="font-medium leading-snug">{k.title}</p>
                <p className="text-sm text-shell-muted">{k.why}</p>
                {k.action_hint ? (
                  <p className="text-xs text-shell-accent/90">→ {k.action_hint}</p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {payload.wins?.length ? (
        <div className="text-sm text-shell-muted">
          <span className="font-medium text-shell-fg">Wins: </span>
          {payload.wins.join(' · ')}
        </div>
      ) : null}

      {payload.unavailable?.length ? (
        <p className="text-xs text-shell-muted/80">
          Soft-failed: {payload.unavailable.join(', ')}
        </p>
      ) : null}

      <Link href="/chat" className="btn-primary inline-flex w-full justify-center">
        Chat about these
      </Link>

      {error ? (
        <p className="text-xs text-amber-200" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
