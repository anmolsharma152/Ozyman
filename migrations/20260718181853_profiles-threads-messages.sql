-- PR-02: Core schema — profiles, threads, messages + RLS
-- DDL conventions: CASCADE FKs, owner RLS via (SELECT auth.uid()), grants, updated_at triggers
-- Apply: npx @insforge/cli db migrations up --all
-- (or) npx @insforge/cli db import migrations/20260718181853_profiles-threads-messages.sql

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  brief_cron_local TEXT,
  brief_email_enabled BOOLEAN NOT NULL DEFAULT true,
  digest_email TEXT,
  composio_entity_id TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX profiles_composio_entity_id_idx ON public.profiles (composio_entity_id)
  WHERE composio_entity_id IS NOT NULL;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners select profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY "owners insert profiles" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "owners update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "owners delete profiles" ON public.profiles
  FOR DELETE TO authenticated
  USING (id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

-- ---------------------------------------------------------------------------
-- threads
-- ---------------------------------------------------------------------------
CREATE TABLE public.threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT threads_kind_check CHECK (kind IN ('chat', 'brief', 'job', 'system')),
  CONSTRAINT threads_status_check CHECK (status IN ('open', 'archived'))
);

CREATE INDEX threads_user_id_idx ON public.threads (user_id);
CREATE INDEX threads_user_id_kind_idx ON public.threads (user_id, kind);
CREATE INDEX threads_user_id_updated_at_idx ON public.threads (user_id, updated_at DESC);

ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners select threads" ON public.threads
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "owners insert threads" ON public.threads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "owners update threads" ON public.threads
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "owners delete threads" ON public.threads
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.threads TO authenticated;

CREATE TRIGGER threads_updated_at
  BEFORE UPDATE ON public.threads
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

-- ---------------------------------------------------------------------------
-- messages
-- agent_run_id FK deferred to PR-03 (agent_runs table)
-- ---------------------------------------------------------------------------
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  parts JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT messages_role_check CHECK (role IN ('user', 'assistant', 'system', 'tool'))
);

CREATE INDEX messages_thread_id_created_at_idx ON public.messages (thread_id, created_at);
CREATE INDEX messages_user_id_idx ON public.messages (user_id);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Dual-parent guard: messages.user_id must match caller AND thread must be owned
-- by the same user so clients cannot attach rows to another user's thread_id.
CREATE POLICY "owners select messages" ON public.messages
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "owners insert messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.threads t
      WHERE t.id = thread_id
        AND t.user_id = (SELECT auth.uid())
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
  );

CREATE POLICY "owners delete messages" ON public.messages
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
