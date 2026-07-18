'use server'

import { revalidatePath } from 'next/cache'
import { getSessionUser } from '@/app/lib/auth'
import { createInsForgeServerClient } from '@/app/lib/insforge/server'
import { ensureProfile } from '@/lib/profile/ensureProfile'
import {
  OPEN_TASK_STATUSES,
  TASK_NOTES_MAX,
  TASK_SELECT,
  TASK_TITLE_MAX,
  normalizeTask,
  type Task,
  type TaskStatus,
} from '@/lib/tasks/types'

export type TaskActionResult =
  | { ok: true; task?: Task }
  | { ok: false; error: string }

async function requireUserWithProfile() {
  const user = await getSessionUser()
  if (!user) {
    return { error: 'Sign in to manage tasks.' as const, user: null, profile: null }
  }

  const profile = await ensureProfile(user)
  if (!profile) {
    return {
      error: 'Could not load your profile. Try again in a moment.' as const,
      user: null,
      profile: null,
    }
  }

  return { error: null, user, profile }
}

/**
 * List open + proposed tasks for the signed-in user (ADHD list surface).
 * Soft-fails to [] if schema missing or DB errors.
 */
export async function listOpenTasks(): Promise<Task[]> {
  const gate = await requireUserWithProfile()
  if (gate.error || !gate.user) return []

  try {
    const client = await createInsForgeServerClient()
    const { data, error } = await client.database
      .from('tasks')
      .select(TASK_SELECT)
      .eq('user_id', gate.user.id)
      .in('status', [...OPEN_TASK_STATUSES])
      .order('priority', { ascending: false })
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[tasks] listOpenTasks failed', error)
      return []
    }

    return (data ?? []).map((row) =>
      normalizeTask(row as unknown as Record<string, unknown>),
    )
  } catch (err) {
    console.error('[tasks] listOpenTasks unexpected', err)
    return []
  }
}

/** Create a user-sourced task (title required). */
export async function createTask(
  _prev: TaskActionResult | null,
  formData: FormData,
): Promise<TaskActionResult> {
  const gate = await requireUserWithProfile()
  if (gate.error || !gate.user) {
    return { ok: false, error: gate.error ?? 'Sign in to manage tasks.' }
  }

  const title = String(formData.get('title') ?? '').trim()
  const notesRaw = String(formData.get('notes') ?? '').trim()

  if (!title) {
    return { ok: false, error: 'Give it a short title — even one word works.' }
  }
  if (title.length > TASK_TITLE_MAX) {
    return {
      ok: false,
      error: `Title is a bit long — keep it under ${TASK_TITLE_MAX} characters.`,
    }
  }
  if (notesRaw.length > TASK_NOTES_MAX) {
    return {
      ok: false,
      error: `Notes are a bit long — keep them under ${TASK_NOTES_MAX} characters.`,
    }
  }

  try {
    const client = await createInsForgeServerClient()
    const { data, error } = await client.database
      .from('tasks')
      .insert([
        {
          user_id: gate.user.id,
          title,
          notes: notesRaw || null,
          status: 'todo' satisfies TaskStatus,
          source: 'user',
          priority: 0,
        },
      ])
      .select(TASK_SELECT)
      .single()

    if (error || !data) {
      console.error('[tasks] createTask failed', error)
      return { ok: false, error: 'Could not save that task. Try again?' }
    }

    revalidatePath('/tasks')
    revalidatePath('/')
    return {
      ok: true,
      task: normalizeTask(data as unknown as Record<string, unknown>),
    }
  } catch (err) {
    console.error('[tasks] createTask unexpected', err)
    return { ok: false, error: 'Something went sideways. Try again in a moment.' }
  }
}

/** Mark a task done (celebration path — soft win). Open statuses only. */
export async function markTaskDone(
  _prev: TaskActionResult | null,
  formData: FormData,
): Promise<TaskActionResult> {
  return updateTaskStatus(formData, 'done', [...OPEN_TASK_STATUSES])
}

/** Accept a proposed task into the open todo queue. Only from `proposed`. */
export async function acceptProposedTask(
  _prev: TaskActionResult | null,
  formData: FormData,
): Promise<TaskActionResult> {
  return updateTaskStatus(formData, 'todo', ['proposed'])
}

/** Soft-cancel (preferred over hard delete). Open statuses only. */
export async function cancelTask(
  _prev: TaskActionResult | null,
  formData: FormData,
): Promise<TaskActionResult> {
  return updateTaskStatus(formData, 'cancelled', [...OPEN_TASK_STATUSES])
}

async function updateTaskStatus(
  formData: FormData,
  status: TaskStatus,
  fromStatuses: readonly TaskStatus[],
): Promise<TaskActionResult> {
  const gate = await requireUserWithProfile()
  if (gate.error || !gate.user) {
    return { ok: false, error: gate.error ?? 'Sign in to manage tasks.' }
  }

  const taskId = String(formData.get('taskId') ?? '').trim()
  if (!taskId) {
    return { ok: false, error: 'Missing task id.' }
  }

  try {
    const client = await createInsForgeServerClient()
    let query = client.database
      .from('tasks')
      .update({ status })
      .eq('id', taskId)
      .eq('user_id', gate.user.id)

    if (fromStatuses.length === 1) {
      query = query.eq('status', fromStatuses[0])
    } else {
      query = query.in('status', [...fromStatuses])
    }

    const { data, error } = await query.select(TASK_SELECT).maybeSingle()

    if (error) {
      console.error('[tasks] updateTaskStatus failed', error)
      return { ok: false, error: 'Could not update that task. Try again?' }
    }
    if (!data) {
      // Silent no-op when status guard misses (already done/cancelled or wrong transition)
      return {
        ok: false,
        error: "That task is already closed or can't take this action.",
      }
    }

    revalidatePath('/tasks')
    revalidatePath('/')
    return {
      ok: true,
      task: normalizeTask(data as unknown as Record<string, unknown>),
    }
  } catch (err) {
    console.error('[tasks] updateTaskStatus unexpected', err)
    return { ok: false, error: 'Something went sideways. Try again in a moment.' }
  }
}
