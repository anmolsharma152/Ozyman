'use client'

import { useActionState } from 'react'
import {
  acceptProposedTask,
  cancelTask,
  markTaskDone,
  type TaskActionResult,
} from '@/app/actions/tasks'
import type { Task } from '@/lib/tasks/types'

const initial: TaskActionResult | null = null

type TaskItemProps = {
  task: Task
  timeZone: string
}

function statusLabel(status: Task['status']): string {
  switch (status) {
    case 'proposed':
      return 'Proposed'
    case 'doing':
      // DB + list include `doing`; no "Start" affordance in MVP (not a board).
      return 'Doing'
    case 'todo':
    default:
      return 'Todo'
  }
}

function formatDue(dueAt: string | null, timeZone: string): string | null {
  if (!dueAt) return null
  try {
    const d = new Date(dueAt)
    if (Number.isNaN(d.getTime())) return null
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    }).format(d)
  } catch {
    return null
  }
}

/**
 * Per-row open task with mark-done / accept / soft-cancel and inline errors.
 */
export function TaskItem({ task, timeZone }: TaskItemProps) {
  const [doneState, doneAction, donePending] = useActionState(
    markTaskDone,
    initial,
  )
  const [acceptState, acceptAction, acceptPending] = useActionState(
    acceptProposedTask,
    initial,
  )
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelTask,
    initial,
  )

  const due = formatDue(task.due_at, timeZone)
  const isProposed = task.status === 'proposed'
  const pending = donePending || acceptPending || cancelPending

  const error =
    (doneState && !doneState.ok ? doneState.error : null) ||
    (acceptState && !acceptState.ok ? acceptState.error : null) ||
    (cancelState && !cancelState.ok ? cancelState.error : null)

  return (
    <li className="card flex flex-col gap-3 !rounded-2xl !p-4 sm:flex-row sm:items-start sm:gap-3">
      <form action={doneAction} className="shrink-0">
        <input type="hidden" name="taskId" value={task.id} />
        <button
          type="submit"
          title="Mark done"
          aria-label={`Mark done: ${task.title}`}
          disabled={pending}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-shell-border bg-shell-surface text-shell-muted transition hover:border-shell-accent hover:bg-shell-accent/10 hover:text-shell-accent active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
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
            <form action={acceptAction}>
              <input type="hidden" name="taskId" value={task.id} />
              <button
                type="submit"
                disabled={pending}
                className="btn-ghost min-h-10 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                {acceptPending ? 'Keeping…' : 'Keep as todo'}
              </button>
            </form>
          ) : null}
          <form action={cancelAction}>
            <input type="hidden" name="taskId" value={task.id} />
            <button
              type="submit"
              disabled={pending}
              className="btn-ghost min-h-10 px-3 text-xs text-shell-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelPending ? 'Cancelling…' : 'Cancel'}
            </button>
          </form>
        </div>

        {error ? (
          <p className="text-sm text-shell-warm" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  )
}
