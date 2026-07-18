import { TaskItem } from '@/components/task-item'
import type { Task } from '@/lib/tasks/types'

type TasksListProps = {
  tasks: Task[]
  /** Profile timezone for due_at display (default Asia/Kolkata). */
  timeZone?: string
}

/**
 * Simple open-task list — large tap targets, no guilt empty state.
 * Status `doing` is listed when present; no Start affordance in MVP (not a board).
 */
export function TasksList({
  tasks,
  timeZone = 'Asia/Kolkata',
}: TasksListProps) {
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
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} timeZone={timeZone} />
        ))}
      </ul>
    </section>
  )
}
