import { redirect } from 'next/navigation'
import { getSessionUser } from '@/app/lib/auth'
import { LoginForm } from '@/components/login-form'

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>
}

function safeInternalPath(next: string | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/'
  return next
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const nextPath = safeInternalPath(params.next)

  const user = await getSessionUser()
  if (user) redirect(nextPath)

  return (
    <div className="flex flex-1 flex-col justify-center gap-4 py-4">
      <p className="text-center text-sm text-shell-muted">
        Hey — I&apos;m <span className="font-medium text-shell-accent">Ozyman</span>
      </p>
      <LoginForm errorCode={params.error ?? null} />
    </div>
  )
}
