import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/app/lib/auth'
import { ConnectionsPanel } from '@/components/connections-panel'
import { loadConnectionsData } from './actions'

export const metadata = {
  title: 'Connections · Ozyman',
  description: 'Connected apps — Gmail, GitHub, Slack status and re-link.',
}

export default async function ConnectionsPage() {
  const user = await getSessionUser()
  if (!user) {
    redirect('/login?next=/connections')
  }

  const data = await loadConnectionsData()

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

      <ConnectionsPanel initial={data} />
    </>
  )
}
