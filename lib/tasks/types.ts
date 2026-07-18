/** Open statuses shown on the ADHD-friendly tasks list. */
export const OPEN_TASK_STATUSES = ['proposed', 'todo', 'doing'] as const

export const TASK_STATUSES = [
  'proposed',
  'todo',
  'doing',
  'done',
  'cancelled',
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_SOURCES = ['user', 'brief', 'email', 'github'] as const

export type TaskSource = (typeof TASK_SOURCES)[number]

export type Task = {
  id: string
  user_id: string
  title: string
  notes: string | null
  status: TaskStatus
  priority: number
  due_at: string | null
  source: TaskSource
  source_ref: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export const TASK_SELECT =
  'id, user_id, title, notes, status, priority, due_at, source, source_ref, metadata, created_at, updated_at'

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value)
}

export function normalizeTask(row: Record<string, unknown>): Task {
  const status = isTaskStatus(String(row.status ?? 'todo'))
    ? (row.status as TaskStatus)
    : 'todo'

  const sourceRaw = String(row.source ?? 'user')
  const source = (TASK_SOURCES as readonly string[]).includes(sourceRaw)
    ? (sourceRaw as TaskSource)
    : 'user'

  return {
    id: String(row.id),
    user_id: String(row.user_id),
    title: String(row.title ?? ''),
    notes: (row.notes as string | null) ?? null,
    status,
    priority: typeof row.priority === 'number' ? row.priority : 0,
    due_at: (row.due_at as string | null) ?? null,
    source,
    source_ref:
      row.source_ref && typeof row.source_ref === 'object' && !Array.isArray(row.source_ref)
        ? (row.source_ref as Record<string, unknown>)
        : null,
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}
