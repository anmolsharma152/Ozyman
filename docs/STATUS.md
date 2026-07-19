# Ozyman — status handoff

| Field | Value |
|-------|--------|
| **As of** | 2026-07-19 |
| **Branch** | `main` (pushed) |
| **Product** | Personal Operator OS — mail / GitHub / tasks / Top-3 kicks / confirm-before-send |
| **Not this product** | Disha (jobs) · Scholar-Loop (FSRS) · IdeaForge (creative synthesis) |

Read this first when resuming work. Full design: [design-ozyman-personal-operator-os.md](./design-ozyman-personal-operator-os.md).  
Portfolio split: [portfolio-product-boundaries.md](./portfolio-product-boundaries.md).  
Setup/secrets: [setup.md](./setup.md).

---

## What ships today (working paths)

| Surface | Route / entry | Notes |
|---------|---------------|--------|
| Home | `/` | Greeting + Top-3 kicks card (Generate/Refresh) |
| Chat | `/chat` | Agent loop + Gmail/GitHub tools + confirm for sends |
| Tasks | `/tasks` | CRUD list; briefs can insert `source=brief` proposed tasks |
| Settings | `/settings` | Account, sign out, connected apps status, **Manage apps** (Link/Verify) |
| Legacy apps URL | `/connections` | Redirects to `/settings` (OAuth query preserved) |

| Backend piece | Location |
|---------------|----------|
| Agent loop | `lib/agent/*` |
| Brief gather + deterministic kicks | `lib/brief/run-morning-brief.ts`, `POST /api/brief/run` |
| Composio client / execute / entity | `lib/composio/*` (`mode.ts`, `normalize.ts`, `cli.ts`) |
| Policy allowlist | `packages/ozyman-policy` |
| Profile bootstrap | `lib/profile/ensureProfile.ts` (soft-timeout ~8s) |

---

## Architecture snapshot

```text
Browser (Next App Router)
  ├─ SSR auth via InsForge cookies
  ├─ Home kicks → POST /api/brief/run
  ├─ Chat → POST /api/agent/run (+ confirm route)
  └─ Settings → link/smoke via server actions

Server
  ├─ InsForge: profiles, threads, messages, tasks, connections mirror,
  │            agent_runs, tool_runs, artifacts
  ├─ OpenRouter: chat + kick ranking polish
  └─ Composio: Gmail / GitHub / Slack tools
       • project key (ak_…) → SDK + entity ozyman:<userId>
       • user key (uak_…) → local CLI only (not multi-user)
```

---

## Known gaps / debt (do these next, not invent scope)

### P0 — production-shaped Composio
- [ ] Replace local `COMPOSIO_API_KEY=uak_…` with **project** `ak_…` from [Composio dashboard](https://dashboard.composio.dev/settings)
- [ ] Remove / stop using shared `COMPOSIO_DEFAULT_ENTITY_ID` for multi-user
- [ ] Re-link Gmail/GitHub/Slack under **Settings → Manage apps** after key switch
- [ ] Confirm entity shows `ozyman:<uuid>` in project mode banner

### P1 — reliability
- [ ] InsForge latency/timeouts still possible; soft-timeouts prevent full hang — investigate if profile stays null often
- [ ] Edge morning-brief Deno function + schedule (design PR-08) not fully shipped as scheduled product path; in-app `POST /api/brief/run` is the live path
- [ ] Resend digests optional; in-app brief is hard gate

### P2 — product polish (Ozyman-only)
- [ ] Evening wrap brief variant
- [ ] Watched `settings.github_repos` UI (today auto-discovers recent repos)
- [ ] Clearer empty states when tools fail vs truly empty inbox
- [ ] PWA / Android shell later (design Phase 2/3)

### Explicit non-goals (do not pull in)
- Job board scrape / LPA scoring → **Disha**
- FSRS / curriculum digests → **Scholar-Loop**
- Creative diverge–evaluate idea OS → **IdeaForge**

---

## Local dev checklist

```bash
cd ~/Projects/Ozyman
cp .env.example .env.local   # if needed; fill keys — never commit
npm install
npm run dev                  # default :3000; set NEXT_PUBLIC_APP_URL to match
```

| Check | Expect |
|-------|--------|
| Sign-in | Google OAuth → home |
| Settings | App statuses; Manage apps → Link/Verify |
| Home | Generate kicks → real subjects when Gmail works |
| Chat | “Who am I on GitHub?” / “Unread mail?” with tools |
| Tasks | Proposed tasks after a brief run |

Stop server: `Ctrl+C` or `pkill -f "next dev -p 3000"`.

---

## Key env (see `.env.example` + setup.md)

| Required local | Purpose |
|----------------|---------|
| `NEXT_PUBLIC_INSFORGE_URL` / `ANON_KEY` | Auth + DB |
| `NEXT_PUBLIC_APP_URL` | OAuth callback origin (e.g. `http://localhost:3000`) |
| `COMPOSIO_API_KEY` | Prefer **`ak_…` project key** |
| `OPENROUTER_API_KEY` | Chat + brief LLM (or InsForge AI gateway) |

---

## Migrations

Under `migrations/` — apply with:

```bash
npx @insforge/cli db migrations up --all
```

Tables: profiles, threads, messages, tasks, connections, agent_runs, tool_runs, artifacts, …

---

## Resume protocol for agents / future you

1. Read **this file** + portfolio boundaries.  
2. `git status` / `git log -5` on `main`.  
3. Prefer project Composio key before debugging “empty Gmail”.  
4. Touch only Ozyman scope; deep-link siblings, don’t absorb them.  
5. Atomic commits; no secrets in git.

**Last focused session themes:** tool accuracy (Gmail CLI offload hydrate), deterministic kicks, Settings UX, project-key multi-user path, portfolio charter, soft InsForge timeouts.
