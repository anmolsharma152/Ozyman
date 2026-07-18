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

Schema, agent loop, Composio, and morning brief land in later PRs.

## Do not commit

- Any `.env*` file except `.env.example` (real API keys stay in `.env.local` / InsForge secrets)
- `.insforge/` (CLI / project credentials)
