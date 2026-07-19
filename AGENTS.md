# AGENTS.md

Guidance for coding agents working in **Ozyman**.

## Product scope (do not expand casually)

Ozyman is a **private operator buddy**: Gmail, GitHub, tasks, Top-3 kicks, chat + tools, confirm before send.

**Out of scope here** (other repos):

| Domain | Product |
|--------|---------|
| Job scrape / LPA scoring | Disha |
| FSRS / study digests | Scholar-Loop |
| Creative diverge–evaluate idea OS | IdeaForge |

Canonical split: [docs/portfolio-product-boundaries.md](./docs/portfolio-product-boundaries.md).  
Resume handoff: [docs/STATUS.md](./docs/STATUS.md).

<!-- INSFORGE:START -->
## InsForge backend

This project uses [InsForge](https://insforge.dev): an all-in-one, open-source Postgres-based backend (BaaS) that gives this app a database, authentication, file storage, edge functions, realtime, an AI model gateway, and payments through one platform.

- **Project:** **ozyman** (API base `https://sik8rdbp.ap-southeast.insforge.app`)
- **Skills:** these InsForge skills are installed for supported coding agents. Reach for them before implementing any InsForge feature instead of guessing the API:
  - `insforge`: app code with the `@insforge/sdk` client (database CRUD, auth, storage, edge functions, realtime, AI, email, and Stripe payments).
  - `insforge-cli`: backend and infrastructure via the `insforge` CLI (projects, SQL, migrations, RLS policies, storage buckets, functions, secrets, payment setup, schedules, deploys).
  - `insforge-debug`: diagnosing failures (SDK/HTTP errors, RLS denials, auth and OAuth issues) and running security or performance audits.
  - `insforge-integrations`: wiring external auth providers (Clerk, Auth0, WorkOS, Better Auth, etc.) for JWT-based RLS, or the OKX x402 payment facilitator.
  - `find-skills`: discovering additional skills on demand.
- **Credentials:** app code reads keys from `.env.local`; the CLI reads `.insforge/project.json`. Never hardcode or commit keys.

Key patterns:

- Database inserts take an array: `insert([{ ... }])`.
- Reference users with `auth.users(id)`; use `auth.uid()` in RLS policies.
- For storage uploads, persist both the returned `url` and `key`.
<!-- INSFORGE:END -->

## Composio

- Prefer **project API key** (`ak_…`) for multi-user / cloud (`lib/composio/mode.ts`).
- User keys (`uak_…`) force local CLI execute only — not for production multi-user.
- Large CLI results may offload to temp files — `execute.ts` must hydrate `outputFilePath`.
- Slim payloads for the model via `lib/composio/normalize.ts`.
- Per-user entity in project mode: `ozyman:<userId>` (`lib/composio/entity.ts`).

## Important paths

| Area | Path |
|------|------|
| Agent loop / chat | `lib/agent/*`, `app/api/agent/*`, `app/chat` |
| Morning brief | `lib/brief/run-morning-brief.ts`, `app/api/brief/run` |
| Composio | `lib/composio/*` |
| Settings / apps UI | `app/settings`, `components/connections-panel.tsx` |
| Policy | `packages/ozyman-policy` |
| Profile | `lib/profile/ensureProfile.ts` (soft-timeout on InsForge) |

## Engineering norms

- Atomic commits; never commit secrets.
- Soft-fail tools in brief/chat when possible; don’t invent empty inboxes or open PRs.
- Confirm before irreversible tool runs (send email, etc.).
- Prefer read_file / search_replace; keep changes scoped to the request.
