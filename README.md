# Ozyman

Personal Operator OS — a private career + life operator buddy on **InsForge** + **Composio**.

| | |
|--|--|
| **Project** | `ozyman` |
| **API** | `https://sik8rdbp.ap-southeast.insforge.app` |
| **Design** | [docs/design-ozyman-personal-operator-os.md](./docs/design-ozyman-personal-operator-os.md) |
| **Setup / secrets** | [docs/setup.md](./docs/setup.md) |
| **Env template** | [`.env.example`](./.env.example) |

## Quick start (bootstrap)

```bash
cp .env.example .env.local
# Fill secrets — never commit .env.local
# See docs/setup.md for Resend-first digests, Composio entity seed, ai setup
```

App runtime (Next.js scaffold, schema, agent loop) lands in later PRs. This repo currently holds design + env/docs bootstrap only.

## Do not commit

- `.env`, `.env.local`, real API keys
- `.insforge/` (CLI / project credentials)
