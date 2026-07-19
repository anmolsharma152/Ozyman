'use client'

import { useActionState, useEffect, useRef } from 'react'
import {
  createTask,
  type TaskActionResult,
} from '@/app/actions/tasks'

const initial: TaskActionResult | null = null

export function TaskCreateForm() {
  const [state, formAction, pending] = useActionState(createTask, initial)
  const formRef = useRef<HTMLFormElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset()
      titleRef.current?.focus()
    }
  }, [state])

  return (
    <form ref={formRef} action={formAction} className="card space-y-3">
      <div>
        <h2 className="text-base font-semibold text-shell-fg">Add a task</h2>
        <p className="mt-0.5 text-sm text-shell-muted">
          One thing at a time. Title is enough.
        </p>
      </div>

      <label className="block space-y-1.5">
        <span className="sr-only">Title</span>
        <input
          ref={titleRef}
          name="title"
          type="text"
          required
          maxLength={280}
          placeholder="What needs doing?"
          autoComplete="off"
          disabled={pending}
          className="min-h-12 w-full rounded-2xl border border-shell-border bg-shell-surface/80 px-4 py-3 text-base text-shell-fg placeholder:text-shell-muted/70 focus:border-shell-accent focus:outline-none focus:ring-2 focus:ring-shell-accent/30"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="sr-only">Notes (optional)</span>
        <textarea
          name="notes"
          rows={2}
          maxLength={2000}
          placeholder="Notes (optional)"
          disabled={pending}
          className="w-full resize-none rounded-2xl border border-shell-border bg-shell-surface/80 px-4 py-3 text-sm text-shell-fg placeholder:text-shell-muted/70 focus:border-shell-accent focus:outline-none focus:ring-2 focus:ring-shell-accent/30"
        />
      </label>

      {state && !state.ok ? (
        <p className="text-sm text-shell-warm" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="text-sm text-shell-accent" role="status">
          Added. You&apos;ve got this.
        </p>
      ) : null}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? 'Saving…' : 'Add task'}
      </button>
    </form>
  )
}
