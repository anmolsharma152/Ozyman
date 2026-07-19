'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  linkToolkitAction,
  loadConnectionsData,
  verifyToolkitAction,
  type ConnectionsPageData,
} from '@/app/connections/actions'
import type { ConnectionStatus, ToolkitConnection } from '@/lib/composio/types'

/**
 * Settings-only apps panel.
 * Default: quiet status. Link / Verify stay inside a closed "Manage apps" details.
 */

type LinkedNotice = {
  toolkit: string | null
  label: string | null
  oauthStatus: 'success' | 'failed' | null
} | null

type Props = {
  initial: ConnectionsPageData
  linkedNotice?: LinkedNotice
}

const STATUS_STYLES: Record<
  ConnectionStatus,
  { label: string; className: string }
> = {
  active: {
    label: 'Connected',
    className: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  },
  expired: {
    label: 'Expired',
    className: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  },
  missing: {
    label: 'Not linked',
    className: 'bg-shell-surface text-shell-muted ring-shell-border',
  },
  error: {
    label: 'Error',
    className: 'bg-red-500/15 text-red-300 ring-red-500/30',
  },
}

const TOOLKIT_EMOJI: Record<string, string> = {
  gmail: '✉️',
  github: '⌘',
  slack: '💬',
}

export function ConnectionsPanel({ initial, linkedNotice = null }: Props) {
  const [data, setData] = useState(initial)
  const [message, setMessage] = useState<string | null>(null)
  const [messageKind, setMessageKind] = useState<'ok' | 'err'>('ok')
  const [pendingToolkit, setPendingToolkit] = useState<string | null>(null)
  const [verifyToolkit, setVerifyToolkit] = useState<string | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const linkedHandled = useRef(false)

  // OAuth return: open manage + toast
  useEffect(() => {
    if (!linkedNotice || linkedHandled.current) return
    linkedHandled.current = true
    setManageOpen(true)

    const name = linkedNotice.label || linkedNotice.toolkit || 'App'
    if (linkedNotice.oauthStatus === 'failed') {
      setMessageKind('err')
      setMessage(`${name} link did not complete. Expand Manage apps to retry.`)
    } else {
      setMessageKind('ok')
      setMessage(
        linkedNotice.toolkit
          ? `${name} link finished. Expand Manage apps to verify if you like.`
          : 'Link finished — status refreshed.',
      )
    }

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (url.searchParams.has('linked') || url.searchParams.has('status')) {
        url.searchParams.delete('linked')
        url.searchParams.delete('status')
        window.history.replaceState({}, '', url.pathname + url.search)
      }
    }

    startTransition(async () => {
      try {
        setData(await loadConnectionsData())
      } catch {
        /* keep SSR */
      }
    })
  }, [linkedNotice])

  const needsRelink = useMemo(() => {
    if (!data.configured) return true
    return data.connections.some((c) => c.status !== 'active')
  }, [data])

  // Open manage when something is broken so user can find actions without hunting
  useEffect(() => {
    if (needsRelink || !data.isProjectMode) {
      // don't force open forever — only first paint if broken
    }
  }, [needsRelink, data.isProjectMode])

  function applyConnections(connections: ToolkitConnection[] | undefined) {
    if (!connections?.length) return
    setData((prev) => ({ ...prev, connections }))
  }

  function onLink(toolkit: string) {
    setPendingToolkit(toolkit)
    setMessage(null)
    startTransition(async () => {
      try {
        const result = await linkToolkitAction(toolkit)
        if (result.redirectUrl) {
          setMessageKind('ok')
          setMessage(`Opening ${toolkit}…`)
          window.location.href = result.redirectUrl
          return
        }
        setMessageKind('err')
        setMessage(
          [result.error || 'Could not start link.', result.cliHint]
            .filter(Boolean)
            .join(' '),
        )
      } catch (err) {
        setMessageKind('err')
        setMessage(err instanceof Error ? err.message : 'Link failed')
      } finally {
        setPendingToolkit(null)
      }
    })
  }

  function onVerify(toolkit: string) {
    setVerifyToolkit(toolkit)
    setMessage(null)
    startTransition(async () => {
      try {
        const result = await verifyToolkitAction(toolkit)
        applyConnections(result.connections)
        if (result.ok) {
          setMessageKind('ok')
          setMessage(
            result.summary ||
              (result.githubLogin
                ? `GitHub OK — @${result.githubLogin}`
                : `${toolkit} OK.`),
          )
        } else {
          setMessageKind('err')
          setMessage(
            [result.error || 'Check failed.', result.cliHint]
              .filter(Boolean)
              .join(' '),
          )
        }
      } catch (err) {
        setMessageKind('err')
        setMessage(err instanceof Error ? err.message : 'Check failed')
      } finally {
        setVerifyToolkit(null)
      }
    })
  }

  if (!data.configured) {
    return (
      <section className="card space-y-4">
        <h2 className="text-lg font-semibold text-shell-fg">Connected apps</h2>
        <p className="text-sm text-shell-muted">
          {data.configError || 'Composio is not configured on this server.'}
        </p>
        <details className="rounded-2xl border border-shell-border bg-shell-surface/40 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-shell-fg">
            Setup project API key
          </summary>
          <div className="mt-3">
            <ProjectKeySetupCard hint={data.setupHint} />
          </div>
        </details>
      </section>
    )
  }

  const busy = isPending || pendingToolkit !== null || verifyToolkit !== null

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-shell-fg">Connected apps</h2>
        <p className="mt-1 text-sm text-shell-muted">
          Status only. Link and verify stay under Manage.
        </p>
      </div>

      {/* Quiet status strip */}
      <ul className="divide-y divide-shell-border/60 rounded-2xl border border-shell-border bg-shell-surface/30">
        {data.connections.map((c) => {
          const style = STATUS_STYLES[c.status]
          return (
            <li
              key={c.toolkit}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden className="text-base">
                  {TOOLKIT_EMOJI[c.toolkit] || '•'}
                </span>
                <span className="font-medium text-shell-fg">{c.label}</span>
              </div>
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${style.className}`}
              >
                {style.label}
              </span>
            </li>
          )
        })}
      </ul>

      {!data.isProjectMode || data.setupHint ? (
        <details className="rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-amber-100">
            Project API key setup (multi-user / cloud)
          </summary>
          <div className="mt-3 space-y-2">
            <p className="text-xs text-shell-muted">
              Mode: <strong className="text-shell-fg">{data.composioMode}</strong>
              {data.composioKeyKind ? ` · ${data.composioKeyKind}` : ''}.
            </p>
            {data.setupHint ? (
              <p className="text-xs text-amber-100/90">{data.setupHint}</p>
            ) : null}
            <ProjectKeySetupCard hint={null} />
          </div>
        </details>
      ) : (
        <p className="text-xs text-shell-muted">
          Project mode · entity{' '}
          <code className="break-all text-shell-fg/80">
            {data.entityId || '—'}
          </code>
        </p>
      )}

      {/* All destructive / noisy actions behind one disclosure */}
      <details
        className="rounded-2xl border border-shell-border bg-shell-surface/20"
        open={manageOpen || Boolean(linkedNotice)}
        onToggle={(e) => setManageOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-shell-fg">
          Manage apps
          {needsRelink ? (
            <span className="ml-2 text-xs font-normal text-amber-200">
              · something needs attention
            </span>
          ) : null}
        </summary>

        <div className="space-y-3 border-t border-shell-border/60 px-4 py-4">
          <p className="text-xs text-shell-muted">
            Link starts OAuth. Verify runs a read-only smoke check. Prefer this
            only when status is wrong or after changing API keys.
          </p>

          <ul className="space-y-2">
            {data.connections.map((c) => {
              const linking = pendingToolkit === c.toolkit
              const smoking = verifyToolkit === c.toolkit
              return (
                <li
                  key={c.toolkit}
                  className="flex flex-col gap-2 rounded-xl border border-shell-border/80 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-sm font-medium text-shell-fg">
                    {c.label}
                    {c.detail ? (
                      <span className="mt-0.5 block text-xs font-normal text-shell-muted">
                        {c.detail}
                      </span>
                    ) : null}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-ghost min-h-10 px-3 text-xs"
                      disabled={busy}
                      onClick={() => onLink(c.toolkit)}
                    >
                      {linking
                        ? '…'
                        : c.status === 'active'
                          ? 'Re-link'
                          : 'Link'}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost min-h-10 px-3 text-xs"
                      disabled={busy}
                      onClick={() => onVerify(c.toolkit)}
                    >
                      {smoking ? '…' : 'Verify'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>

          {message ? (
            <p
              role="status"
              className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
                messageKind === 'ok'
                  ? 'bg-emerald-500/10 text-emerald-200'
                  : 'bg-red-500/10 text-red-200'
              }`}
            >
              {message}
            </p>
          ) : null}
        </div>
      </details>
    </section>
  )
}

function ProjectKeySetupCard({ hint }: { hint: string | null }) {
  return (
    <div className="space-y-2 text-xs leading-relaxed text-shell-muted">
      <ol className="list-decimal space-y-1 pl-4">
        <li>
          Project API key from{' '}
          <a
            href="https://dashboard.composio.dev/settings"
            target="_blank"
            rel="noreferrer"
            className="text-shell-accent underline"
          >
            dashboard.composio.dev/settings
          </a>{' '}
          (<code className="text-shell-accent">ak_…</code>, not{' '}
          <code className="text-shell-accent">uak_…</code>).
        </li>
        <li>
          Server env only:{' '}
          <code className="text-shell-accent">COMPOSIO_API_KEY=ak_…</code>
        </li>
        <li>Restart app · each user Links apps under Manage.</li>
      </ol>
      {hint ? <p className="text-amber-100/90">{hint}</p> : null}
    </div>
  )
}
