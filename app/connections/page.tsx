import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/app/lib/auth'
import { ConnectionsPanel } from '@/components/connections-panel'
import { isMvpToolkit, toolkitLabel } from '@/lib/composio'
import { loadConnectionsData } from './actions'

export const metadata = {
  title: 'Connections · Ozyman',
  description: 'Connected apps — Gmail, GitHub, Slack status and re-link.',
}

type PageProps = {
  searchParams: Promise<{ linked?: string; status?: string }>
}

export default async function ConnectionsPage({ searchParams }: PageProps) {
  const user = await getSessionUser()
  if (!user) {
    redirect('/login?next=/connections')
  }

  const params = await searchParams
  const linkedRaw = params.linked?.toLowerCase()
  const linkedToolkit =
    linkedRaw && isMvpToolkit(linkedRaw) ? linkedRaw : null
  // Composio may also pass status=success|failed on callback
  const oauthStatus: 'success' | 'failed' | null =
    params.status === 'success'
      ? 'success'
      : params.status === 'failed'
        ? 'failed'
        : null

  // Fresh live status after OAuth return (loadConnectionsData always re-fetches)
  const data = await loadConnectionsData()

  const linkedNotice: {
    toolkit: typeof linkedToolkit
    label: string | null
    oauthStatus: 'success' | 'failed' | null
  } | null =
    linkedToolkit || oauthStatus
      ? {
          toolkit: linkedToolkit,
          label: linkedToolkit ? toolkitLabel(linkedToolkit) : null,
          oauthStatus,
        }
      : null

  return (
    <>
      <section className="space-y-2 pt-2">
        <p className="text-sm font-medium uppercase tracking-wider text-shell-accent">
          Connections
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-shell-fg">
          Your apps
        </h1>
        <p className="max-w-prose text-base leading-relaxed text-shell-muted">
          Quiet status for Gmail, GitHub, and Slack. Tokens stay in Composio —
          Ozyman only mirrors toolkit health.
        </p>
        <p className="text-sm">
          <Link href="/" className="text-shell-accent hover:underline">
            ← Home
          </Link>
        </p>
      </section>

      <ConnectionsPanel initial={data} linkedNotice={linkedNotice} />
    </>
  )
}
