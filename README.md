# Ozyman

Personal Operator OS — a private career + life operator buddy on **InsForge** + **Composio**.

| | |
|--|--|
| **Project** | `ozyman` |
| **API** | `https://sik8rdbp.ap-southeast.insforge.app` |
| **Design** | [docs/design-ozyman-personal-operator-os.md](./docs/design-ozyman-personal-operator-os.md) |
| **Setup / secrets** | [docs/setup.md](./docs/setup.md) |
| **Env template** | [`.env.example`](./.env.example) |

## Quick start

```bash
cp .env.example .env.local
# Set NEXT_PUBLIC_INSFORGE_ANON_KEY (and other secrets as needed)
# See docs/setup.md for Resend-first digests, Composio entity seed, ai setup

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with **Google OAuth** (preferred) or email/password if configured on the InsForge project.

### Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local Next.js dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm start` | Serve production build |

### Database migrations

SQL lives under [`migrations/`](./migrations/) (InsForge CLI format: `<timestamp>_<kebab-name>.sql`).

```bash
# Preferred: apply pending migrations on the linked project
npx @insforge/cli db migrations up --all

# Or create a new empty migration file
npx @insforge/cli db migrations new <name>

# One-shot import of a raw SQL file (if not using the migrations tracker)
npx @insforge/cli db import migrations/20260718181853_profiles-threads-messages.sql
npx @insforge/cli db import migrations/20260718182601_tasks.sql
```

| Migration | Tables |
|-----------|--------|
| `20260718181853_profiles-threads-messages.sql` | profiles, threads, messages |
| `20260718182601_tasks.sql` | tasks (statuses: proposed \| todo \| doing \| done \| cancelled) |

Requires a linked project (`.insforge/project.json` via `npx @insforge/cli link`).  
`ensureProfile` runs on every authenticated layout load and seeds `profiles.digest_email` / `composio_entity_id` when null.  
Tasks UI: [`/tasks`](./app/tasks) — open/proposed list, create, mark done (server actions).

### Agent core + policy (PR-03)

| Path | Purpose |
|------|---------|
| `migrations/20260718210000_agent-runs-tool-runs-artifacts.sql` | `agent_runs`, `tool_runs`, `artifacts`, `tool_runs_public` |
| `packages/ozyman-policy` | Tool allowlist + `MorningBriefPayload` (Deno copies later) |
| `lib/agent/` | Next interactive loop primitives (OpenRouter chat, policy, tool_runs log) |
| `scripts/create-artifacts-bucket.sh` | Create private `artifacts` storage bucket |

```bash
npx @insforge/cli db migrations up --all
bash scripts/create-artifacts-bucket.sh
```

Composio connections UI (PR-05), companion chat SSE (PR-06), confirms (PR-07), and Deno morning brief (PR-08) build on this.

## Do not commit

- Any `.env*` file except `.env.example` (real API keys stay in `.env.local` / InsForge secrets)
- `.insforge/` (CLI / project credentials)
