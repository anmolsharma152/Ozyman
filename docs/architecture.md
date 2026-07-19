# Architecture

Visual reference for Ozyman's data model and key flows.

## Database ERD

```mermaid
erDiagram
    auth_users["auth.users"] {
        uuid id PK
    }

    profiles {
        uuid id PK "FK → auth.users"
        text display_name
        text timezone "default Asia/Kolkata"
        text brief_cron_local
        boolean brief_email_enabled
        text digest_email
        text composio_entity_id "ozyman:<userId>"
        jsonb settings
        timestamptz created_at
        timestamptz updated_at
    }

    threads {
        uuid id PK
        uuid user_id FK "→ auth.users"
        text kind "chat | brief | job | system"
        text title
        text status "open | archived"
        jsonb metadata
        timestamptz created_at
        timestamptz updated_at
    }

    messages {
        uuid id PK
        uuid thread_id FK "→ threads"
        uuid user_id FK "→ auth.users"
        uuid agent_run_id FK "→ agent_runs (nullable)"
        text role "user | assistant | system | tool"
        text content
        jsonb parts
        timestamptz created_at
    }

    tasks {
        uuid id PK
        uuid user_id FK "→ auth.users"
        text title
        text notes
        text status "proposed | todo | doing | done | cancelled"
        smallint priority "0 = default"
        timestamptz due_at
        text source "user | brief | email | github"
        jsonb source_ref
        jsonb metadata
        timestamptz created_at
        timestamptz updated_at
    }

    connections {
        uuid id PK
        uuid user_id FK "→ auth.users"
        text toolkit "gmail | github | slack | ..."
        text status "active | expired | missing | error"
        text composio_account_id
        text alias
        timestamptz last_checked_at
        jsonb metadata
        timestamptz created_at
        timestamptz updated_at
    }

    agent_runs {
        uuid id PK
        uuid user_id FK "→ auth.users"
        uuid thread_id FK "→ threads (nullable)"
        text trigger "user | schedule | webhook"
        text mode "chat | brief | job_prepare"
        text status "queued | running | waiting_confirmation | ..."
        text input
        text output_summary
        text error
        jsonb metadata
        integer step_count
        text model
        timestamptz started_at
        timestamptz finished_at
        timestamptz created_at
    }

    tool_runs {
        uuid id PK
        uuid user_id FK "→ auth.users"
        uuid agent_run_id FK "→ agent_runs"
        text tool_slug "e.g. GMAIL_SEND_EMAIL"
        jsonb args_redacted "safe for client read"
        jsonb args_execute "SECRET — REVOKE'd from authenticated"
        text status "pending | awaiting_confirmation | succeeded | ..."
        text result_summary
        jsonb result_ref
        text error
        timestamptz expires_at
        timestamptz confirmed_at
        uuid confirmed_by FK "→ auth.users"
        timestamptz started_at
        timestamptz finished_at
        timestamptz created_at
    }

    artifacts {
        uuid id PK
        uuid user_id FK "→ auth.users"
        uuid thread_id FK "→ threads (nullable)"
        uuid agent_run_id FK "→ agent_runs (nullable)"
        uuid job_application_id
        text kind "brief | brief_html | email_draft | resume | ..."
        text title
        text storage_key
        text storage_url
        text mime_type
        jsonb body "inline JSON (e.g. MorningBriefPayload)"
        jsonb metadata
        timestamptz created_at
    }

    auth_users ||--|| profiles : "1:1"
    auth_users ||--o{ threads : "owns"
    auth_users ||--o{ messages : "owns"
    auth_users ||--o{ tasks : "owns"
    auth_users ||--o{ connections : "owns"
    auth_users ||--o{ agent_runs : "owns"
    auth_users ||--o{ tool_runs : "owns"
    auth_users ||--o{ artifacts : "owns"

    threads ||--o{ messages : "contains"
    threads ||--o{ agent_runs : "links"
    threads ||--o{ artifacts : "links"

    agent_runs ||--o{ tool_runs : "produces"
    agent_runs ||--o{ messages : "produces"
    agent_runs ||--o{ artifacts : "produces"
```

## Key constraints

| Table | Column | Restriction |
|-------|--------|-------------|
| `tool_runs` | `args_execute` | `REVOKE SELECT` from `authenticated`/`anon` — secret payloads only via admin client or `tool_runs_public` view |
| `tool_runs_public` | *(view)* | `security_invoker` — underlying RLS applies; excludes `args_execute` |
| `connections` | `(user_id, toolkit)` | `UNIQUE` — one connection per toolkit per user |
| `messages` | `agent_run_id` | Deferred FK (added in PR-03 migration); dual-parent RLS guard |
| `artifacts` | `body` | Inline JSON payload (added in brief-body migration) |
| Storage | `artifacts` bucket | Path-scoped RESTRICTIVE policies: `/{user_id}/...` only |

## Chat message flow

```mermaid
sequenceDiagram
    actor User
    participant UI as /chat (client)
    participant API as /api/agent/run
    participant Agent as lib/agent/loop
    participant LLM as OpenRouter
    participant Policy as ozyman-policy
    participant Composio as Composio SDK
    participant DB as InsForge Postgres

    User->>UI: Type message
    UI->>API: POST { threadId, message }
    API->>DB: Insert user message
    API->>DB: Upsert thread
    API->>Agent: runChatTurn(thread, userMsg)

    loop Max 20 steps
        Agent->>LLM: chat.completions.create(messages, tools)
        LLM-->>Agent: tool_call or final reply

        alt Tool call requested
            Agent->>Policy: evaluateToolPolicy(tool_slug, args)
            Policy-->>Agent: { allowed, requiresConfirmation, reason }

            alt Blocked
                Agent->>LLM: append tool error → retry
            else Requires confirmation
                Agent->>DB: Insert tool_run (awaiting_confirmation)
                Agent-->>UI: SSE event: awaiting_confirmation
                User->>UI: Confirm / Reject
                UI->>API: POST /api/agent/confirm { toolRunId, action }
                API->>DB: Update tool_run status
                alt Confirmed
                    API->>Composio: executeTool(slug, args)
                    Composio-->>API: result
                    API->>DB: Update tool_run (succeeded)
                    API->>Agent: resume loop with result
                else Rejected
                    API->>Agent: append rejection → retry
                end
            else Allowed (no confirmation)
                Agent->>Composio: executeTool(slug, args)
                Composio-->>Agent: result
                Agent->>DB: Insert tool_run (succeeded)
            end
        else Final reply
            Agent->>DB: Insert assistant message
            Agent-->>UI: SSE event: done
        end
    end
```

## Morning brief flow

```mermaid
sequenceDiagram
    participant Trigger as Cron / POST /api/brief/run
    participant Brief as lib/brief/run-morning-brief
    participant DB as InsForge Postgres
    participant Gmail as Composio Gmail
    participant GH as Composio GitHub
    participant LLM as OpenRouter
    participant Resend as Resend API

    Trigger->>Brief: runMorningBrief(userId)
    Brief->>DB: Fetch profile (timezone, brief_email_enabled)
    Brief->>DB: Fetch open tasks (todo + doing)

    par Gather signals
        Brief->>Gmail: GMAIL_FETCH_EMAILS (unread, 10)
        Gmail-->>Brief: emails
    and
        Brief->>GH: GITHUB_GET_ISSUES (assigned, open)
        GH-->>Brief: issues
    and
        Brief->>GH: GITHUB_LIST_PULL_REQUESTS (open)
        GH-->>Brief: PRs
    end

    Brief->>Brief: rankSignals(emails, issues, PRs, tasks)
    Brief->>Brief: Top-3 kicks (score > threshold)

    opt LLM summary
        Brief->>LLM: Summarize top kicks
        LLM-->>Brief: one-liner per kick
    end

    Brief->>DB: Insert artifacts row (kind=brief, body=JSON)
    Brief->>DB: Materialize kick tasks (proposed status)

    opt Email digest enabled
        Brief->>Resend: Send brief HTML
        Resend-->>Brief: delivered
    end

    Brief-->>Trigger: { ok: true, briefId, kicks[] }
```

## Composio entity resolution

```mermaid
sequenceDiagram
    participant Server as Next.js server
    participant Profile as profiles table
    participant Entity as lib/composio/entity
    participant Composio as Composio API

    Note over Server: Any tool-calling path
    Server->>Profile: Read composio_entity_id
    alt Entity ID exists
        Profile-->>Server: "ozyman:<uuid>"
    else First run / missing
        Server->>Entity: resolveEntityId(userId)
        Entity->>Composio: entity.getOrCreate("ozyman:<uuid>")
        Composio-->>Entity: entity
        Entity->>Profile: Update composio_entity_id
        Profile-->>Server: saved
    end

    Server->>Composio: Execute tool as entity
    Note over Composio: Scoped to this user's\nOAuth connections only
```

## RLS pattern

Every user-owned table follows the same pattern:

```sql
-- All queries use (SELECT auth.uid()) to avoid recursion
USING  (user_id = (SELECT auth.uid()))   -- read / update / delete
WITH CHECK (user_id = (SELECT auth.uid())) -- insert / update
```

Tables with dual-parent ownership (messages, tool_runs, artifacts) add an `EXISTS` subquery to verify the parent row also belongs to the same user:

```sql
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.threads t
    WHERE t.id = thread_id
      AND t.user_id = (SELECT auth.uid())
  )
)
```
