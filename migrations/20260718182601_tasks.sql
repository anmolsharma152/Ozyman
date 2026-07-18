-- PR-04: Tasks domain — ADHD-friendly operator tasks
-- DDL conventions: CASCADE FKs, owner RLS via (SELECT auth.uid()), grants, updated_at triggers
-- Apply: npx @insforge/cli db migrations up --all
-- (or) npx @insforge/cli db import migrations/20260718182601_tasks.sql

-- ---------------------------------------------------------------------------
-- tasks
-- Statuses: proposed (from brief) | todo | doing | done | cancelled (soft cancel preferred)
-- source: user | brief | email | github
-- source_ref / metadata: brief dedup keys, free-form extras
-- ---------------------------------------------------------------------------
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority SMALLINT NOT NULL DEFAULT 0,
  due_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'user',
  source_ref JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tasks_status_check CHECK (
    status IN ('proposed', 'todo', 'doing', 'done', 'cancelled')
  ),
  CONSTRAINT tasks_source_check CHECK (
    source IN ('user', 'brief', 'email', 'github')
  ),
  CONSTRAINT tasks_title_not_blank CHECK (char_length(trim(title)) > 0)
);

CREATE INDEX tasks_user_id_status_idx ON public.tasks (user_id, status);
CREATE INDEX tasks_user_id_due_at_idx ON public.tasks (user_id, due_at);
CREATE INDEX tasks_user_id_updated_at_idx ON public.tasks (user_id, updated_at DESC);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners select tasks" ON public.tasks
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "owners insert tasks" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "owners update tasks" ON public.tasks
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "owners delete tasks" ON public.tasks
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();
