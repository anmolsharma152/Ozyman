-- PR-05: connections mirror (toolkit status only — no provider OAuth tokens)
-- Design: connections table; UNIQUE (user_id, toolkit); owner RLS
-- Apply: npx @insforge/cli db migrations up --all
-- (or) npx @insforge/cli db import migrations/20260718182641_connections.sql

-- ---------------------------------------------------------------------------
-- connections
-- ---------------------------------------------------------------------------
CREATE TABLE public.connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  toolkit TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'missing',
  composio_account_id TEXT,
  alias TEXT,
  last_checked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT connections_toolkit_check CHECK (
    toolkit IN ('gmail', 'github', 'slack', 'googlecalendar', 'notion')
  ),
  CONSTRAINT connections_status_check CHECK (
    status IN ('active', 'expired', 'missing', 'error')
  ),
  CONSTRAINT connections_user_toolkit_unique UNIQUE (user_id, toolkit)
);

CREATE INDEX connections_user_id_idx ON public.connections (user_id);
CREATE INDEX connections_user_id_status_idx ON public.connections (user_id, status);

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners select connections" ON public.connections
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "owners insert connections" ON public.connections
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "owners update connections" ON public.connections
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "owners delete connections" ON public.connections
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.connections TO authenticated;

CREATE TRIGGER connections_updated_at
  BEFORE UPDATE ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();
