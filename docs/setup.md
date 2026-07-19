# Ozyman setup — env matrix, secrets, providers

Personal Operator OS on **InsForge** (ap-southeast) + **Composio**.  
Full product design: [design-ozyman-personal-operator-os.md](./design-ozyman-personal-operator-os.md).

This doc is the **PR-00 bootstrap checklist**: env vars, secrets placement, Resend-first digests, Composio entity seed, and OpenRouter AI setup. **No app runtime** is required yet.

---

## Project pointers

| Item | Value |
|------|--------|
| InsForge project | `ozyman` |
| API base | `https://sik8rdbp.ap-southeast.insforge.app` |
| Region | ap-southeast (Singapore) |
| Billing | **Free** plan (verified) → digests use **Resend-first** |
| App env file | `.env.local` (gitignored) |
| Template | [`.env.example`](../.env.example) |
| CLI state | `.insforge/` (gitignored) — never commit |

---

## Database migrations

Schema SQL is versioned under [`migrations/`](../migrations/) for the InsForge CLI:

```bash
# List applied remote migrations
npx @insforge/cli db migrations list

# Apply all pending local migrations
npx @insforge/cli db migrations up --all

# Create the next migration file
npx @insforge/cli db migrations new <kebab-name>
```

PR-02 core tables: `profiles`, `threads`, `messages` (+ RLS, grants, `updated_at` triggers).  
PR-03 agent audit: `agent_runs`, `tool_runs` (+ `args_execute` column REVOKE, `tool_runs_public` view), `artifacts`, `messages.agent_run_id`, path-scoped storage RLS for bucket `artifacts`.

On first authenticated layout load, `lib/profile/ensureProfile.ts` inserts a profile if missing, then fills null seed fields (race-safe select → insert → re-select → conditional update):

- `digest_email` from the session/OAuth email when the column is null
- `composio_entity_id` from `COMPOSIO_DEFAULT_ENTITY_ID` when set and the column is null

Prefer migrations over ad-hoc `db query` for schema. `npx @insforge/cli db import <file.sql>` is available for one-shot SQL import if needed.

### Client rule for tool_runs

- Query **`tool_runs_public`** (or an explicit column list **excluding** `args_execute`).
- Do **not** `.select('*')` on base `tool_runs` for authenticated sessions.
- Load/write `args_execute` only via **admin client** or SECURITY DEFINER RPCs after ownership checks (confirm algorithm).

### Storage bucket: `artifacts`

Private bucket for brief HTML, email drafts, resumes, etc. Object keys are path-scoped:

```text
{user_id}/briefs/...
{user_id}/drafts/...
```

Create once (linked project required):

```bash
bash scripts/create-artifacts-bucket.sh
# or: npx @insforge/cli storage create-bucket artifacts --private
```

Migration `20260718210000_agent-runs-tool-runs-artifacts.sql` installs **RESTRICTIVE** path RLS on `storage.objects` for `bucket = 'artifacts'` (`storage.foldername(key)[1] = auth.jwt()->>'sub'`). RESTRICTIVE ANDs with any default owner-only policies so uploads cannot plant objects under another user’s path prefix. Always persist both `storage_url` and `storage_key` on `public.artifacts`.

### Policy package + Next agent core

| Path | Role |
|------|------|
| `packages/ozyman-policy` | Canonical tool allowlist + `MorningBriefPayload` schema |
| `lib/agent/*` | Next interactive loop (types, policy resolve, OpenRouter chat, tool_runs logging) |

Deno morning-brief (PR-08) **copies** allowlist + schema from the package — it does **not** import `lib/agent/loop`.

---

## Never commit

- Real secrets or API keys
- Any `.env*` file except the tracked template (`.env.example` is allowed; `.env`, `.env.local`, `.env.development`, `.env.production`, etc. are ignored)
- `.insforge/` (contains project keys / CLI state)
- Any file with live `COMPOSIO_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, admin keys, etc.

Copy the template and fill locally:

```bash
cp .env.example .env.local
# edit .env.local — do not commit
# Prefer .env.local for secrets; never put real keys in committed files
```

---

## Provider decisions (locked)

| Decision | Choice | Why |
|----------|--------|-----|
| Digest email | **`DIGEST_EMAIL_PROVIDER=resend`** (default) | Free InsForge plan has no custom `insforge.emails.send`; Scholar-Loop already used Resend |
| Paid upgrade path | `DIGEST_EMAIL_PROVIDER=insforge` | Only after plan supports custom email |
| Composio identity | `profiles.composio_entity_id` + env seed | CLI consumer entity ≠ InsForge `auth.uid()` automatically |
| App login | Google OAuth preferred (already on project) | Distinct from Gmail toolkit link via Composio |
| Chat model default | `OPENROUTER_CHAT_MODEL=openai/gpt-4.1-mini` | Override via env; avoid bikeshed |

### Resend-first digests

- **MVP:** in-app brief is the hard gate; email is best-effort pager.
- Set `DIGEST_EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `DIGEST_FROM_EMAIL` (verified sender/domain in Resend).
- Recipient comes from `profiles.digest_email` (seeded at first login from session email) — **not** a runtime `auth.users` lookup in the brief.
- If recipient is missing, skip email and still succeed on in-app brief.
- Switch to `insforge` only when paid email is available; then use display-name `from` + user-controlled `replyTo`.
- Digest HTML deep links need a public app origin on the **edge** runtime (`APP_URL` — same value as Next `NEXT_PUBLIC_APP_URL`). Deno does not inherit Next `NEXT_PUBLIC_*` unless also set as an InsForge secret.

### Composio entity seed

1. Existing ACTIVE Gmail / GitHub / Slack connections bind to the **CLI consumer entity**, not automatically to a future InsForge user id.
2. Set `COMPOSIO_DEFAULT_ENTITY_ID` to that consumer entity id for a **best-effort** seed into `profiles.composio_entity_id`.
3. **Do not assume** server `@composio/core` + project API key sees the same ACTIVE connections as the CLI.
4. If smoke (`GITHUB_GET_THE_AUTHENTICATED_USER`) fails → force in-app re-link (supported path).
5. `COMPOSIO_API_KEY` is **server/edge only** — never `NEXT_PUBLIC_*`. Tokens stay in Composio; Ozyman DB only mirrors toolkit status.

### OpenRouter / AI setup

```bash
# Preferred: configure AI gateway on the InsForge project
npx @insforge/cli ai setup
```

- Optional local/server key: `OPENROUTER_API_KEY` (if calling OpenRouter directly from Next).
- Default model: `OPENROUTER_CHAT_MODEL=openai/gpt-4.1-mini`.
- Embeddings (`OPENROUTER_EMBEDDING_MODEL`) are a later phase.

---

## Environment variable matrix

| Variable | Where | Required | Purpose |
|----------|-------|----------|---------|
| `NEXT_PUBLIC_INSFORGE_URL` | Next public | yes | API base |
| `NEXT_PUBLIC_INSFORGE_ANON_KEY` | Next public | yes | Anon / publishable key |
| `NEXT_PUBLIC_APP_URL` | Next public | yes | OAuth redirects, email deep links (browser / Next) |
| `APP_URL` | edge | yes for digests | Public app origin for digest HTML deep links (same value as `NEXT_PUBLIC_APP_URL`; Deno does not get Next `NEXT_PUBLIC_*` automatically) |
| `INSFORGE_URL` | server/edge | cron/admin | Admin client base URL |
| `INSFORGE_API_KEY` | server/edge | cron/admin | Admin client key |
| `OPENROUTER_API_KEY` | server/edge | yes for AI (or InsForge AI gateway via `ai setup`) | Direct OpenRouter key when not using project gateway |
| `OPENROUTER_CHAT_MODEL` | server | optional | default `openai/gpt-4.1-mini` |
| `OPENROUTER_EMBEDDING_MODEL` | server | later | e.g. `openai/text-embedding-3-small` |
| `COMPOSIO_API_KEY` | server/edge | yes | Tool execute |
| `COMPOSIO_DEFAULT_ENTITY_ID` | server | yes MVP | Best-effort seed sole operator entity |
| `CRON_SECRET` | edge + schedule header | yes | Brief / connection-health auth |
| `MORNING_BRIEF_USER_ID` | edge | yes (n=1) | Primary user UUID |
| `DIGEST_EMAIL_PROVIDER` | edge | yes | `resend` \| `insforge` |
| `RESEND_API_KEY` | edge | if resend | Digest send |
| `DIGEST_FROM_EMAIL` | edge | if resend | Verified Resend from address |
| `TOOL_ARGS_ENCRYPTION_KEY` | server (+ edge if brief encrypts `args_execute`) | recommended | Encrypt `args_execute` at rest; Next confirm path today — add to edge secrets if morning-brief writes encrypted tool args |

Full design appendix mirrors most of this table: design doc § Appendix A. `APP_URL` is the edge-facing name for digest deep links (design uses `appUrl` / `NEXT_PUBLIC_APP_URL` in Appendix C).

---

## Secrets checklist

### Local (Next.js)

| Secret | In `.env.local` | Notes |
|--------|-----------------|-------|
| `NEXT_PUBLIC_INSFORGE_URL` | yes | Public |
| `NEXT_PUBLIC_INSFORGE_ANON_KEY` | yes | Public |
| `NEXT_PUBLIC_APP_URL` | yes | e.g. `http://localhost:3000` |
| `COMPOSIO_API_KEY` | yes (server) | Never public prefix |
| `COMPOSIO_DEFAULT_ENTITY_ID` | yes | Seed only |
| `OPENROUTER_API_KEY` | if direct OpenRouter | Prefer InsForge AI gateway |
| `OPENROUTER_CHAT_MODEL` | optional | |
| `TOOL_ARGS_ENCRYPTION_KEY` | recommended | Next confirm path; see edge note if brief encrypts args |

Digest/cron/admin keys (`DIGEST_EMAIL_PROVIDER`, `RESEND_API_KEY`, `DIGEST_FROM_EMAIL`, `CRON_SECRET`, `MORNING_BRIEF_USER_ID`, `INSFORGE_URL`, `INSFORGE_API_KEY`, `APP_URL`) live in **InsForge secrets** (below). Leave them empty in `.env.local` unless you run brief logic locally.

### InsForge project secrets (edge / schedules)

```bash
npx @insforge/cli secrets add KEY VALUE
```

| Secret | Required for | Notes |
|--------|--------------|-------|
| `CRON_SECRET` | `morning-brief`, `connection-health` | Schedule header: `Authorization: Bearer ${{secrets.CRON_SECRET}}` |
| `INSFORGE_URL` | admin client in edge | Same API base |
| `INSFORGE_API_KEY` | admin client in edge | Server-only |
| `MORNING_BRIEF_USER_ID` | brief pipeline | Sole operator UUID |
| `APP_URL` | digest HTML deep links | Same origin as `NEXT_PUBLIC_APP_URL` (e.g. production site URL); used by Deno brief for `/brief/{id}` links |
| `COMPOSIO_API_KEY` | tools from Deno | Same as local server key |
| `COMPOSIO_DEFAULT_ENTITY_ID` | seed (if used on edge) | Best-effort |
| `DIGEST_EMAIL_PROVIDER` | digests | default `resend` |
| `RESEND_API_KEY` | digests when resend | |
| `DIGEST_FROM_EMAIL` | digests when resend | Verified sender |
| `OPENROUTER_API_KEY` / AI gateway | summarize step | Via `ai setup` where possible; or set key if edge calls OpenRouter directly |
| `TOOL_ARGS_ENCRYPTION_KEY` | if brief encrypts `args_execute` | Same key as Next if morning-brief writes encrypted tool-run args; otherwise Next confirm path only |

### Generate a strong cron secret

```bash
openssl rand -hex 32
# then: npx @insforge/cli secrets add CRON_SECRET '<value>'
```

---

## Bootstrap order (docs-only now; runtime in later PRs)

1. **Gitignore / env template** — this PR (PR-00).
2. Link InsForge project if needed (`npx @insforge/cli` / existing `.insforge` locally only).
3. `npx @insforge/cli ai setup` for OpenRouter gateway.
4. Create Resend account + verified sender → set `RESEND_API_KEY`, `DIGEST_FROM_EMAIL`, `DIGEST_EMAIL_PROVIDER=resend`.
5. Copy Composio project API key → `COMPOSIO_API_KEY`; note CLI consumer entity → `COMPOSIO_DEFAULT_ENTITY_ID`.
6. Generate `CRON_SECRET`; set `MORNING_BRIEF_USER_ID` after first auth user exists (PR-01+).
7. Add keys to InsForge secrets for edge functions (PR-08 brief), including **`APP_URL`** (production app origin for digest deep links), digest/Resend vars, cron, admin, and Composio.
8. Scaffold Next app + SSR auth (PR-01) using `.env.local` from this template.

---

## Related

- Design (KD 16 Resend-first, KD 17 Composio entity, Appendix A–C): [design-ozyman-personal-operator-os.md](./design-ozyman-personal-operator-os.md)
- Agent notes / InsForge skills: [AGENTS.md](../AGENTS.md)
