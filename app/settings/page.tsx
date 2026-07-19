import { redirect } from 'next/navigation'
import { getSessionUser } from '@/app/lib/auth'
import { signOut } from '@/app/actions/auth'
import { ConnectionsPanel } from '@/components/connections-panel'
import { isMvpToolkit, toolkitLabel } from '@/lib/composio'
import { loadConnectionsData } from '@/app/connections/actions'

export const metadata = {
  title: 'Settings · Ozyman',
  description: 'Account, connected apps, and operator preferences.',
}

type PageProps = {
  searchParams: Promise<{ linked?: string; status?: string }>
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const user = await getSessionUser()
  if (!user) {
    redirect('/login?next=/settings')
  }

  const params = await searchParams
  const linkedRaw = params.linked?.toLowerCase()
  const linkedToolkit =
    linkedRaw && isMvpToolkit(linkedRaw) ? linkedRaw : null
  const oauthStatus: 'success' | 'failed' | null =
    params.status === 'success'
      ? 'success'
      : params.status === 'failed'
        ? 'failed'
        : null

  const data = await loadConnectionsData()

  const linkedNotice =
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
          Settings
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-shell-fg">
          Settings
        </h1>
        <p className="max-w-prose text-base leading-relaxed text-shell-muted">
          Account and connected apps. Day-to-day work stays on Home, Chat, and
          Tasks — manage links here when something breaks.
        </p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-base font-semibold text-shell-fg">Account</h2>
        <p className="text-sm text-shell-muted">
          {user.email || user.name || 'Signed in'}
        </p>
        <form action={signOut}>
          <button type="submit" className="btn-ghost w-full sm:w-auto">
            Sign out
          </button>
        </form>
      </section>

      <ConnectionsPanel initial={data} linkedNotice={linkedNotice} />
    </>
  )
}
