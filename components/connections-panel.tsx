'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  linkToolkitAction,
  loadConnectionsData,
  verifyGithubAction,
  type ConnectionsPageData,
} from '@/app/connections/actions'
import type { ConnectionStatus, ToolkitConnection } from '@/lib/composio/types'

/**
 * Client panel for connection status, re-link, and GitHub smoke test.
 * Talks only to server actions / APIs — never receives COMPOSIO_API_KEY.
 */

type LinkedNotice = {
  toolkit: string | null
  label: string | null
  oauthStatus: 'success' | 'failed' | null
} | null

type Props = {
  initial: ConnectionsPageData
  /** Set when returning from Composio OAuth (?linked= / ?status=) */
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
  const [smokePending, setSmokePending] = useState(false)
  const [isPending, startTransition] = useTransition()
  const linkedHandled = useRef(false)

  // After OAuth return: toast + re-fetch status (SSR already loaded fresh;
  // client refresh picks up any delayed ACTIVE state).
  useEffect(() => {
    if (!linkedNotice || linkedHandled.current) return
    linkedHandled.current = true

    const name = linkedNotice.label || linkedNotice.toolkit || 'App'
    if (linkedNotice.oauthStatus === 'failed') {
      setMessageKind('err')
      setMessage(
        `${name} link did not complete. Try Link again, or use the CLI hint below.`,
      )
    } else {
      setMessageKind('ok')
      setMessage(
        linkedNotice.toolkit
          ? `${name} link finished — refreshing status. Run Verify GitHub if you linked GitHub.`
          : 'Link finished — refreshing connection status.',
      )
    }

    // Strip query params so a refresh does not re-toast
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
        const fresh = await loadConnectionsData()
        setData(fresh)
      } catch {
        // keep SSR snapshot
      }
    })
  }, [linkedNotice])

  const needsRelink = useMemo(() => {
    if (!data.configured) return true
    return data.connections.some((c) => c.status !== 'active')
  }, [data])

  const githubActive = data.connections.find((c) => c.toolkit === 'github')
    ?.status === 'active'

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
          setMessage(
            `Opening ${toolkit} link… if nothing happens, copy the CLI hint.`,
          )
          setMessageKind('ok')
          // Navigate user to Composio OAuth
          window.location.href = result.redirectUrl
          return
        }
        setMessageKind('err')
        setMessage(
          [
            result.error || 'Could not start link.',
            result.cliHint ? `CLI: ${result.cliHint}` : null,
          ]
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

  function onVerifyGithub() {
    setSmokePending(true)
    setMessage(null)
    startTransition(async () => {
      try {
        const result = await verifyGithubAction()
        applyConnections(result.connections)
        if (result.ok) {
          setMessageKind('ok')
          setMessage(
            result.githubLogin
              ? `GitHub smoke OK — signed in as @${result.githubLogin}. Entity saved.`
              : 'GitHub smoke OK. Entity saved.',
          )
        } else {
          setMessageKind('err')
          setMessage(
            [
              result.error || 'Smoke failed.',
              'Reconnect GitHub below — re-link is the supported path.',
              result.cliHint ? `CLI: ${result.cliHint}` : null,
            ]
              .filter(Boolean)
              .join(' '),
          )
        }
      } catch (err) {
        setMessageKind('err')
        setMessage(err instanceof Error ? err.message : 'Smoke failed')
      } finally {
        setSmokePending(false)
      }
    })
  }

  if (!data.configured) {
    return (
      <section className="card space-y-4">
        <h2 className="text-lg font-semibold text-shell-fg">Connections</h2>
        <p className="text-sm leading-relaxed text-shell-muted">
          {data.configError || 'Composio is not configured on this server.'}
        </p>
        <p className="rounded-2xl border border-shell-border bg-shell-surface/50 px-4 py-3 text-xs text-shell-muted">
          Set <code className="text-shell-accent">COMPOSIO_API_KEY</code> in{' '}
          <code>.env.local</code> (server only — never{' '}
          <code>NEXT_PUBLIC_*</code>). Optionally set{' '}
          <code className="text-shell-accent">COMPOSIO_DEFAULT_ENTITY_ID</code>{' '}
          from your CLI consumer entity for a best-effort seed.
        </p>
        <CliHintBlock />
      </section>
    )
  }

  return (
    <div className="space-y-5">
      {needsRelink ? (
        <section className="card space-y-3 ring-1 ring-amber-500/25">
          <h2 className="text-base font-semibold text-shell-fg">
            Reconnect apps
          </h2>
          <p className="text-sm leading-relaxed text-shell-muted">
            Some toolkits are not active under your app entity. Seed from the
            CLI is best-effort — if smoke fails, re-link here (or via CLI). This
            is the supported path, not a failure mode.
          </p>
        </section>
      ) : null}

      <section className="card space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-shell-fg">
              Connected apps
            </h2>
            <p className="mt-1 text-sm text-shell-muted">
              Status from Composio for your operator entity.
            </p>
          </div>
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-shell-surface text-shell-warm ring-1 ring-shell-border"
          >
            🔗
          </span>
        </div>

        <ul className="space-y-3">
          {data.connections.map((c) => {
            const style = STATUS_STYLES[c.status]
            const busy = isPending && pendingToolkit === c.toolkit
            return (
              <li
                key={c.toolkit}
                className="flex flex-col gap-3 rounded-2xl border border-shell-border bg-shell-surface/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-shell-card text-base ring-1 ring-shell-border"
                  >
                    {TOOLKIT_EMOJI[c.toolkit] || '•'}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-shell-fg">
                        {c.label}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${style.className}`}
                      >
                        {style.label}
                      </span>
                    </div>
                    {c.detail ? (
                      <p className="mt-1 truncate text-xs text-shell-muted">
                        {c.detail}
                      </p>
                    ) : null}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-ghost min-h-11 shrink-0 px-3 text-sm"
                  disabled={busy || isPending}
                  onClick={() => onLink(c.toolkit)}
                >
                  {busy
                    ? 'Starting…'
                    : c.status === 'active'
                      ? 'Re-link'
                      : 'Link'}
                </button>
              </li>
            )
          })}
        </ul>

        {message ? (
          <p
            role="status"
            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              messageKind === 'ok'
                ? 'bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-500/25'
                : 'bg-red-500/10 text-red-200 ring-1 ring-red-500/25'
            }`}
          >
            {message}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 border-t border-shell-border/60 pt-4">
          <button
            type="button"
            className="btn-primary w-full"
            disabled={smokePending || isPending}
            onClick={onVerifyGithub}
          >
            {smokePending
              ? 'Verifying GitHub…'
              : githubActive
                ? 'Verify GitHub'
                : 'Verify GitHub (smoke)'}
          </button>
          <p className="text-xs text-shell-muted">
            Runs{' '}
            <code className="text-shell-accent">
              GITHUB_GET_THE_AUTHENTICATED_USER
            </code>{' '}
            server-side for entity{' '}
            <code className="break-all text-shell-fg/80">
              {data.entityId || '—'}
            </code>
            {data.entitySource ? (
              <span className="text-shell-muted">
                {' '}
                (source: {data.entitySource})
              </span>
            ) : null}
            .
          </p>
        </div>
      </section>

      <CliHintBlock />
    </div>
  )
}

function CliHintBlock() {
  return (
    <section className="rounded-3xl border border-dashed border-shell-border/80 bg-shell-surface/30 px-5 py-4 text-xs leading-relaxed text-shell-muted">
      <p className="font-medium text-shell-fg/90">CLI re-link (optional)</p>
      <pre className="mt-2 overflow-x-auto rounded-xl bg-shell-bg/80 p-3 text-[11px] text-shell-accent">
        {`composio link gmail
composio link github
composio link slack
composio execute GITHUB_GET_THE_AUTHENTICATED_USER -d '{}'`}
      </pre>
      <p className="mt-2">
        CLI consumer entity may differ from the app entity. After CLI link, set{' '}
        <code>COMPOSIO_DEFAULT_ENTITY_ID</code> or re-link in-app so the server
        API key sees ACTIVE accounts.
      </p>
    </section>
  )
}
