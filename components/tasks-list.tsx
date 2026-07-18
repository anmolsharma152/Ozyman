import {
  acceptProposedTask,
  cancelTask,
  markTaskDone,
} from '@/app/actions/tasks'
import type { Task } from '@/lib/tasks/types'

type TasksListProps = {
  tasks: Task[]
}

function statusLabel(status: Task['status']): string {
  switch (status) {
    case 'proposed':
      return 'Proposed'
    case 'doing':
      return 'Doing'
    case 'todo':
    default:
      return 'Todo'
  }
}

function formatDue(dueAt: string | null): string | null {
  if (!dueAt) return null
  try {
    const d = new Date(dueAt)
    if (Number.isNaN(d.getTime())) return null
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata',
    }).format(d)
  } catch {
    return null
  }
}

/**
 * Simple open-task list — large tap targets, no guilt empty state.
 */
export function TasksList({ tasks }: TasksListProps) {
  if (tasks.length === 0) {
    return (
      <section className="card space-y-2">
        <h2 className="text-lg font-semibold text-shell-fg">Open tasks</h2>
        <p className="text-sm leading-relaxed text-shell-muted">
          Nothing on the plate right now — that&apos;s fine. Capture one thing
          above when something shows up, or wait for a morning brief to propose a
          few kicks.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-lg font-semibold text-shell-fg">Open tasks</h2>
        <span className="text-xs font-medium text-shell-muted">
          {tasks.length} open
        </span>
      </div>

      <ul className="space-y-2">
        {tasks.map((task) => {
          const due = formatDue(task.due_at)
          const isProposed = task.status === 'proposed'

          return (
            <li
              key={task.id}
              className="card flex flex-col gap-3 !rounded-2xl !p-4 sm:flex-row sm:items-start sm:gap-3"
            >
              <form action={markTaskDone} className="shrink-0">
                <input type="hidden" name="taskId" value={task.id} />
                <button
                  type="submit"
                  title="Mark done"
                  aria-label={`Mark done: ${task.title}`}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-shell-border bg-shell-surface text-shell-muted transition hover:border-shell-accent hover:bg-shell-accent/10 hover:text-shell-accent active:scale-[0.97]"
                >
                  <span aria-hidden className="text-xl leading-none">
                    ✓
                  </span>
                </button>
              </form>

              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-medium leading-snug text-shell-fg">
                    {task.title}
                  </p>
                  <span
                    className={
                      isProposed
                        ? 'rounded-full bg-shell-warm/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-shell-warm ring-1 ring-shell-warm/30'
                        : 'rounded-full bg-shell-surface px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-shell-muted ring-1 ring-shell-border'
                    }
                  >
                    {statusLabel(task.status)}
                  </span>
                </div>

                {task.notes ? (
                  <p className="text-sm leading-relaxed text-shell-muted line-clamp-3">
                    {task.notes}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-shell-muted/80">
                  {due ? <span>Due {due}</span> : null}
                  {task.source !== 'user' ? (
                    <span className="capitalize">from {task.source}</span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {isProposed ? (
                    <form action={acceptProposedTask}>
                      <input type="hidden" name="taskId" value={task.id} />
                      <button
                        type="submit"
                        className="btn-ghost min-h-10 px-3 text-xs"
                      >
                        Keep as todo
                      </button>
                    </form>
                  ) : null}
                  <form action={cancelTask}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <button
                      type="submit"
                      className="btn-ghost min-h-10 px-3 text-xs text-shell-muted"
                    >
                      Cancel
                    </button>
                  </form>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
