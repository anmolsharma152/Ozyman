import Link from 'next/link'
import { redirect } from 'next/navigation'
import { listOpenTasks } from '@/app/actions/tasks'
import { getSessionUser } from '@/app/lib/auth'
import { TaskCreateForm } from '@/components/task-create-form'
import { TasksList } from '@/components/tasks-list'

export const metadata = {
  title: 'Tasks · Ozyman',
  description: 'Open tasks — simple list, not Jira.',
}

export default async function TasksPage() {
  const user = await getSessionUser()
  if (!user) {
    redirect('/login')
  }

  const tasks = await listOpenTasks()

  return (
    <div className="flex flex-1 flex-col gap-5">
      <section className="space-y-2 pt-1">
        <p className="text-sm font-medium uppercase tracking-wider text-shell-accent">
          Tasks
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-shell-fg sm:text-3xl">
          What&apos;s open
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-shell-muted">
          Open and proposed only — no guilt, no backlog theater. Check one off
          when you&apos;re done.
        </p>
        <p className="text-xs text-shell-muted/70">
          <Link href="/" className="underline-offset-2 hover:underline">
            ← Home
          </Link>
        </p>
      </section>

      <TaskCreateForm />
      <TasksList tasks={tasks} />
    </div>
  )
}
