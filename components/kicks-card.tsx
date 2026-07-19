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
  const [taskNote, setTaskNote] = useState<string | null>(null)

  const runBrief = async () => {
    setBusy(true)
    setError(null)
    setTaskNote(null)
    try {
      const res = await fetch('/api/brief/run', { method: 'POST' })
      const j = (await res.json()) as {
        error?: string
        taskIds?: string[]
      }
      if (!res.ok) throw new Error(j.error ?? 'Brief failed')
      const n = j.taskIds?.length ?? 0
      if (n > 0) {
        setTaskNote(
          `Added ${n} proposed task${n === 1 ? '' : 's'} — see Tasks.`,
        )
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Brief failed')
    } finally {
      setBusy(false)
    }
  }

  const hasBrief = Boolean(brief?.payload?.top_kicks?.length)
  const payload = brief?.payload

  return (
    <section className="card space-y-4" aria-labelledby="kicks-heading">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="kicks-heading" className="text-lg font-semibold">
            Today&apos;s Top 3 Kicks
          </h2>
          <p className="mt-1 text-sm text-shell-muted">
            {hasBrief && payload
              ? payload.greeting
              : 'Grounded priorities from mail, GitHub, and tasks.'}
          </p>
          {brief?.createdAt ? (
            <p className="mt-1 text-xs text-shell-muted/80">
              {new Date(brief.createdAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="btn-primary shrink-0 px-4 text-sm"
          disabled={busy}
          onClick={() => void runBrief()}
          aria-busy={busy}
        >
          {busy ? '…' : hasBrief ? 'Refresh' : 'Generate'}
        </button>
      </div>

      {busy ? (
        <p className="text-xs text-shell-muted" role="status">
          Gathering mail &amp; GitHub… up to about a minute.
        </p>
      ) : null}

      {error ? (
        <p className="text-xs text-amber-200" role="alert">
          {error}
        </p>
      ) : null}

      {taskNote ? (
        <p className="text-xs text-shell-muted" role="status">
          {taskNote}
        </p>
      ) : null}

      {hasBrief && payload ? (
        <>
          <ol className="space-y-3">
            {payload.top_kicks.map((k) => (
              <li
                key={`${k.rank}-${k.title}`}
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
                      <p className="text-xs text-shell-muted/90">
                        → {k.action_hint}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>

          {payload.wins?.length ? (
            <p className="text-sm text-shell-muted">
              <span className="font-medium text-shell-fg">Wins: </span>
              {payload.wins.join(' · ')}
            </p>
          ) : null}

          {payload.unavailable?.length ? (
            <p className="text-xs text-amber-200/90">
              Couldn&apos;t reach: {payload.unavailable.join(', ')}. Fix under{' '}
              <Link href="/settings" className="underline">
                Settings → Manage apps
              </Link>
              .
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-shell-muted">
          No kicks yet — tap Generate when you&apos;re ready.
        </p>
      )}
    </section>
  )
}
