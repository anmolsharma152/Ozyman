-- PR-03: Agent audit schema — agent_runs, tool_runs, artifacts + tool_runs_public
-- DDL conventions: CASCADE FKs, owner RLS via (SELECT auth.uid()), grants
-- args_execute: column REVOKE for authenticated/anon; safe reads via tool_runs_public
-- Apply: npx @insforge/cli db migrations up --all
-- (or) npx @insforge/cli db import migrations/20260718210000_agent-runs-tool-runs-artifacts.sql

-- ---------------------------------------------------------------------------
-- agent_runs
-- ---------------------------------------------------------------------------
CREATE TABLE public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES public.threads(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  input TEXT,
  output_summary TEXT,
  error TEXT,
  metadata JSONB,
  step_count INTEGER NOT NULL DEFAULT 0,
  model TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_runs_trigger_check CHECK (trigger IN ('user', 'schedule', 'webhook')),
  CONSTRAINT agent_runs_mode_check CHECK (mode IN ('chat', 'brief', 'job_prepare')),
  CONSTRAINT agent_runs_status_check CHECK (
    status IN (
      'queued',
      'running',
      'waiting_confirmation',
      'succeeded',
      'failed',
      'cancelled',
      'expired'
    )
  )
);

CREATE INDEX agent_runs_user_id_status_idx ON public.agent_runs (user_id, status);
CREATE INDEX agent_runs_user_id_created_at_idx ON public.agent_runs (user_id, created_at DESC);
CREATE INDEX agent_runs_user_id_trigger_status_idx ON public.agent_runs (user_id, trigger, status);
CREATE INDEX agent_runs_thread_id_idx ON public.agent_runs (thread_id);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners select agent_runs" ON public.agent_runs
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "owners insert agent_runs" ON public.agent_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      thread_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.threads t
        WHERE t.id = thread_id
          AND t.user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "owners update agent_runs" ON public.agent_runs
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      thread_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.threads t
        WHERE t.id = thread_id
          AND t.user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "owners delete agent_runs" ON public.agent_runs
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_runs TO authenticated;

-- ---------------------------------------------------------------------------
-- messages.agent_run_id (deferred from PR-02) + dual-parent ownership
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN agent_run_id UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL;

CREATE INDEX messages_agent_run_id_idx ON public.messages (agent_run_id)
  WHERE agent_run_id IS NOT NULL;

-- Extend INSERT/UPDATE WITH CHECK so agent_run_id (when set) must be owned
-- by the caller — same dual-parent pattern as tool_runs / artifacts.
DROP POLICY IF EXISTS "owners insert messages" ON public.messages;
DROP POLICY IF EXISTS "owners update messages" ON public.messages;

CREATE POLICY "owners insert messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.threads t
      WHERE t.id = thread_id
        AND t.user_id = (SELECT auth.uid())
    )
    AND (
      agent_run_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.agent_runs ar
        WHERE ar.id = agent_run_id
          AND ar.user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "owners update messages" ON public.messages
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.threads t
      WHERE t.id = thread_id
        AND t.user_id = (SELECT auth.uid())
    )
    AND (
      agent_run_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.agent_runs ar
        WHERE ar.id = agent_run_id
          AND ar.user_id = (SELECT auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- tool_runs
-- ---------------------------------------------------------------------------
CREATE TABLE public.tool_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_run_id UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  tool_slug TEXT NOT NULL,
  args_redacted JSONB,
  -- Secret execute payload: never SELECT-able by authenticated (see REVOKE + view below)
  args_execute JSONB,
  status TEXT NOT NULL,
  result_summary TEXT,
  result_ref JSONB,
  error TEXT,
  expires_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tool_runs_status_check CHECK (
    status IN (
      'pending',
      'running',
      'awaiting_confirmation',
      'succeeded',
      'failed',
      'rejected',
      'cancelled',
      'expired',
      'denied'
    )
  )
);

CREATE INDEX tool_runs_agent_run_id_idx ON public.tool_runs (agent_run_id);
CREATE INDEX tool_runs_user_id_status_idx ON public.tool_runs (user_id, status);
CREATE INDEX tool_runs_awaiting_confirmation_idx ON public.tool_runs (status)
  WHERE status = 'awaiting_confirmation';
CREATE INDEX tool_runs_expires_at_idx ON public.tool_runs (expires_at)
  WHERE status = 'awaiting_confirmation' AND expires_at IS NOT NULL;

ALTER TABLE public.tool_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners select tool_runs" ON public.tool_runs
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "owners insert tool_runs" ON public.tool_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.agent_runs ar
      WHERE ar.id = agent_run_id
        AND ar.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "owners update tool_runs" ON public.tool_runs
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.agent_runs ar
      WHERE ar.id = agent_run_id
        AND ar.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "owners delete tool_runs" ON public.tool_runs
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tool_runs TO authenticated;

-- CRITICAL: authenticated/anon must not read or write the execute payload.
-- Client code uses tool_runs_public (or explicit safe column lists).
-- Admin client / SECURITY DEFINER RPCs load args_execute only after ownership checks.
REVOKE SELECT (args_execute), INSERT (args_execute), UPDATE (args_execute)
  ON public.tool_runs FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- tool_runs_public — safe view without args_execute
-- security_invoker: underlying table RLS applies as the calling user
-- ---------------------------------------------------------------------------
CREATE VIEW public.tool_runs_public
WITH (security_invoker = true) AS
SELECT
  id,
  user_id,
  agent_run_id,
  tool_slug,
  args_redacted,
  status,
  result_summary,
  result_ref,
  error,
  expires_at,
  confirmed_at,
  confirmed_by,
  started_at,
  finished_at,
  created_at
FROM public.tool_runs;

GRANT SELECT ON public.tool_runs_public TO authenticated;

-- ---------------------------------------------------------------------------
-- artifacts
-- job_application_id is a nullable UUID only until PR-09 adds job_applications
-- ---------------------------------------------------------------------------
CREATE TABLE public.artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES public.threads(id) ON DELETE CASCADE,
  agent_run_id UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  job_application_id UUID,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  storage_key TEXT,
  storage_url TEXT,
  mime_type TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT artifacts_kind_check CHECK (
    kind IN ('brief_html', 'email_draft', 'resume', 'cover_letter', 'other')
  )
);

CREATE INDEX artifacts_user_id_kind_idx ON public.artifacts (user_id, kind);
CREATE INDEX artifacts_thread_id_idx ON public.artifacts (thread_id);
CREATE INDEX artifacts_agent_run_id_idx ON public.artifacts (agent_run_id)
  WHERE agent_run_id IS NOT NULL;
CREATE INDEX artifacts_job_application_id_idx ON public.artifacts (job_application_id)
  WHERE job_application_id IS NOT NULL;

ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners select artifacts" ON public.artifacts
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "owners insert artifacts" ON public.artifacts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      thread_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.threads t
        WHERE t.id = thread_id
          AND t.user_id = (SELECT auth.uid())
      )
    )
    AND (
      agent_run_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.agent_runs ar
        WHERE ar.id = agent_run_id
          AND ar.user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "owners update artifacts" ON public.artifacts
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      thread_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.threads t
        WHERE t.id = thread_id
          AND t.user_id = (SELECT auth.uid())
      )
    )
    AND (
      agent_run_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.agent_runs ar
        WHERE ar.id = agent_run_id
          AND ar.user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "owners delete artifacts" ON public.artifacts
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artifacts TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage RLS: path-scoped `artifacts` bucket ({user_id}/...)
-- Bucket itself is created out-of-band (see docs/setup.md + scripts/create-artifacts-bucket.sh).
--
-- AS RESTRICTIVE: ANDs with any platform default owner-only (PERMISSIVE) policies.
-- Without RESTRICTIVE, defaults alone allow INSERT under any path when
-- uploaded_by = self, so an attacker could plant objects under another user's
-- folder prefix and path-SELECT would expose them.
-- Predicate is (bucket <> 'artifacts' OR path_ok) so non-artifacts buckets
-- are unaffected by these policies.
-- ---------------------------------------------------------------------------
CREATE POLICY artifacts_bucket_path_select ON storage.objects
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    bucket <> 'artifacts'
    OR (storage.foldername(key))[1] = (SELECT auth.jwt() ->> 'sub')
  );

CREATE POLICY artifacts_bucket_path_insert ON storage.objects
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket <> 'artifacts'
    OR (storage.foldername(key))[1] = (SELECT auth.jwt() ->> 'sub')
  );

CREATE POLICY artifacts_bucket_path_update ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    bucket <> 'artifacts'
    OR (storage.foldername(key))[1] = (SELECT auth.jwt() ->> 'sub')
  )
  WITH CHECK (
    bucket <> 'artifacts'
    OR (storage.foldername(key))[1] = (SELECT auth.jwt() ->> 'sub')
  );

CREATE POLICY artifacts_bucket_path_delete ON storage.objects
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (
    bucket <> 'artifacts'
    OR (storage.foldername(key))[1] = (SELECT auth.jwt() ->> 'sub')
  );
