import { redirect } from 'next/navigation'
import { getSessionUser } from '@/app/lib/auth'
import { ensureProfile } from '@/lib/profile/ensureProfile'
import { ChatPanel } from '@/components/chat-panel'

export const dynamic = 'force-dynamic'

export default async function ChatPage() {
  const user = await getSessionUser()
  if (!user) {
    redirect('/login')
  }

  await ensureProfile(user)

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Chat</h1>
        <p className="text-sm text-shell-muted">
          One place to ask about mail, GitHub, and what to do next.
        </p>
      </div>
      <ChatPanel />
    </div>
  )
}
