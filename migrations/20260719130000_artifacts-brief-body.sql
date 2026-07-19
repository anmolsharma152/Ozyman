-- Morning brief storage: allow kind=brief + JSON body on artifacts
ALTER TABLE public.artifacts
  DROP CONSTRAINT IF EXISTS artifacts_kind_check;

ALTER TABLE public.artifacts
  ADD CONSTRAINT artifacts_kind_check CHECK (
    kind IN (
      'brief',
      'brief_html',
      'email_draft',
      'resume',
      'cover_letter',
      'other'
    )
  );

ALTER TABLE public.artifacts
  ADD COLUMN IF NOT EXISTS body JSONB;

COMMENT ON COLUMN public.artifacts.body IS 'Inline JSON payload (e.g. MorningBriefPayload)';
