# Portfolio product boundaries

| Field | Value |
|-------|--------|
| **Status** | Locked (keep separate) |
| **Date** | 2026-07-19 |
| **Owner** | Anmol |
| **Canonical copies** | Same file in `Ozyman`, `Disha`, `Scholar-Loop`, and `IdeaForge` under `docs/` |
| **Active products** | Ozyman · Disha · Scholar-Loop · IdeaForge (scaffold) |

**Rule of one:** each product owns one *job-to-be-done*. When a feature fits two products, put it in the **narrower** owner and *link* from the other — never fork the same capability into both codebases.

---

## One-line theses

| Product | Path | Thesis | Primary user moment |
|---------|------|--------|---------------------|
| **Ozyman** | `~/Projects/Ozyman` | Private **operator buddy** — mail, GitHub, tasks, Top-3 kicks, confirm before irreversible actions | “What should I do *today* with my tools?” |
| **Disha** | `~/Projects/Disha` | **Market intelligence** for India’s AI/ML jobs — find, score, compare, recommend apply/learn gaps | “Which roles fit me and should I apply?” |
| **Scholar-Loop** | `~/Projects/Scholar-Loop` | **Spaced-repetition learning companion** — FSRS learn/quiz digests over a personal knowledge base | “What do I study this morning / quiz tonight?” |
| **IdeaForge** *(aka IdeaWeaver / Forge)* | `~/Projects/IdeaForge` | **Creative synthesis engine** — deliberate diverge → evaluate → recombine → persist novel ideas | “Help me invent / reframe *without* bland most-probable output” |

All four live under `~/Projects/`. **Do not merge** codebases or grow one product into another’s core loop.

---

## Ownership matrix (who does what)

| Capability | Ozyman | Disha | Scholar-Loop | IdeaForge |
|------------|:------:|:-----:|:------------:|:---------:|
| Gmail / Slack triage & draft+confirm send | **Owner** | — | email *delivery only* | — |
| GitHub PRs / issues / repo focus | **Owner** | — | — | optional later as *inspiration source* only |
| Personal tasks / Top-3 kicks / morning brief | **Owner** | — | — | — |
| Job board scrape / match score / LPA fit | — | **Owner** | — | — |
| Company / financial style analysis for roles | — | **Owner** | — | — |
| “Should I apply to X vs Y?” | — | **Owner** | — | can *ideate* career pivots, not score listings |
| FSRS schedule / learn cards / quiz grades | — | skill-gap *hints* only | **Owner** | may *generate* study analogies; does not own scheduling |
| Knowledge notes corpus (DSA/SD/ML) | — | — | **Owner** | may *read* exports later; does not own notes DB |
| Divergent ideation / novelty scoring / idea graph | — | — | — | **Owner** |
| Image/sound gen as core product | — | — | — | **out of v1** (optional tool later) |
| Health/medical companion | **out** | **out** | **out** | **out** (WellnessMate/MedPal stay elsewhere) |

---

## Product cards

### 1. Ozyman — Personal Operator OS

**In scope**
- Companion shell: home kicks, chat, tasks, settings/apps
- Live tools: Gmail, GitHub, Slack (Composio or successors)
- Morning/evening briefs grounded in *real* mail/GH/task data
- Confirm-gated irreversible actions (send email, etc.)
- Buddy personality (Kicker-shaped, career/ops domain)

**Out of scope (do not grow into)**
- Job *discovery* / board scraping / ranked apply lists → **Disha**
- FSRS / curriculum digests → **Scholar-Loop**
- Creative diverge–evaluate engines, idea graphs, novelty research → **IdeaForge**
- Multimodal creative studio (image/video/music as the product)

**Allowed thin edges**
- A kick that says “Open Disha for roles matching X” (deep link / URL)
- A kick that says “Scholar-Loop quiz due — open study” (deep link)
- A task titled from a job application *you already chose* (manual or paste) — not auto-scrape

**Success metric:** You open it every morning and trust Top-3 + chat for *ops*, not for job market research.

---

### 2. Disha — Career / market intelligence

**In scope**
- Query → multi-agent scrape/normalize job listings
- Profile-aware scoring (skills, LPA, location, experience)
- Company/financial-style analysis for India tech
- Apply/learn recommendations with explicit reasoning
- Chat + structured job cards (FastAPI + Next as today)

**Out of scope**
- Inbox operator / send-email / GH PR triage → **Ozyman**
- Daily FSRS card deck ownership → **Scholar-Loop** (may *suggest* skills to learn)
- Freeform creative invention loops → **IdeaForge**

**Allowed thin edges**
- “Export top 3 roles as Ozyman tasks” (optional integration later)
- “Skill gaps → open Scholar-Loop topic” (link)

**Success metric:** Better apply decisions and ranked matches, not a general life OS.

---

### 3. Scholar-Loop — Learning companion

**In scope**
- Knowledge notes + FSRS state
- Morning Learn / evening Quiz email digests
- Topic allocation (DSA, SD, ML, papers, …)
- Grade capture / review history

**Out of scope**
- Live Gmail ops beyond *sending digests* and receiving grades
- Job board intelligence → **Disha**
- General operator tasks / PR review → **Ozyman**
- Creative idea OS → **IdeaForge** (may consume *generated* analogies later)

**Success metric:** Consistent spaced practice with low friction, not “chat about everything.”

---

### 4. IdeaForge — Creative synthesis engine

**Status**
- Folder: `~/Projects/IdeaForge` (scaffold + charter; not a shipping app yet)
- Origin: Grok.com ideation ([chat](https://grok.com/c/5a36d763-a625-44ba-8bdb-d10e44f93f33)) — System 1/2 creativity; working names Forge / IdeaWeaver / IdeaForge
- **Not** Ozyman, Disha, or Scholar-Loop. Do not implement IdeaForge core inside those three.

**In scope (as it is built)**
- Explicit diverge → evaluate → synthesize → persist
- Novelty / diversity metrics; multi-agent muse + critic
- Persistent idea memory (likely CodexEngine-class backbone, *not* Ozyman)
- Workflow templates: research hypotheses, product ideation, learning analogies, career *pivots as ideas* (not job scrape)

**Out of scope**
- Morning ops brief / Gmail send / GH tools as core → **Ozyman**
- Job board ranking → **Disha**
- FSRS scheduling → **Scholar-Loop**
- Multimodal gen as v1 identity (optional tools only)

**Success metric:** Novel-but-useful ideas with provenance and eval scores — not another chat with temperature turned up.

---

## Anti-mess rules (hard)

1. **No shared “god agent” repo** that owns mail + jobs + FSRS + creativity.
2. **No duplicate core loops.** If Ozyman starts scraping Greenhouse, stop — that belongs in Disha.
3. **Integrations are links and optional exports**, not merged schemas.
4. **Personality can rhyme; domain must not.** Buddy tone is fine in more than one app; *job-to-be-done* must not.
5. **When unsure, write the feature in one sentence:**  
   - “Does this help me operate *accounts I already have today*?” → Ozyman  
   - “Does this help me *choose among market roles*?” → Disha  
   - “Does this help me *retain knowledge on a schedule*?” → Scholar-Loop  
   - “Does this help me *invent non-obvious ideas deliberately*?” → IdeaForge  
6. **New product pressure:** if a feature needs a fourth DB and a third UI home, it is probably a new product or a hard no.

---

## Integration map

```text
    ┌──────────────┐              ┌──────────────┐
    │   Ozyman     │──deep-link──►│    Disha     │
    │  operate day │◄─────────────│  market fit  │
    └──────┬───────┘              └──────┬───────┘
           │                             │
           │         ┌──────────────┐    │
           └────────►│ Scholar-Loop │◄───┘
                     │   retain     │
                     └──────┬───────┘
                            │ optional later
                     ┌──────▼───────┐
                     │  IdeaForge   │  invent / reframe
                     └──────────────┘
```

- Arrows = **URL / deep-link / export file**, not shared process memory in v1.
- No product may *block* on another being up.

---

## Ozyman-specific scope correction

Earlier design text mixed “job search with guardrails” into Ozyman. **Portfolio lock:**

| Keep in Ozyman | Move / leave to Disha |
|----------------|------------------------|
| Tasks you already decided (apply packet checklist) | Scrape, score, rank openings |
| “Follow up on application email” via Gmail | “Find roles above 20 LPA in Bangalore” |
| Celebrate a sent application *after the fact* | Company financial-style scoring |

Update future Ozyman features against this doc before implementing.

---

## Repo hygiene checklist

| Product | Path | Do not put in that tree |
|---------|------|-------------------------|
| Ozyman | `~/Projects/Ozyman` | Job scrapers, FSRS core, IdeaForge creative engine |
| Disha | `~/Projects/Disha` | Composio Gmail operator loop, FSRS digests, IdeaForge core |
| Scholar-Loop | `~/Projects/Scholar-Loop` | Operator chat shell, job boards, IdeaForge core |
| IdeaForge | `~/Projects/IdeaForge` | Gmail operator, job scrapers, FSRS ownership |

Keep this file **in sync** across all four `docs/portfolio-product-boundaries.md` copies when the split changes.

---

## Review cadence

- Before any large feature: 2-minute check against the ownership matrix.
- If two products gain the same table/entity type (e.g. both store “jobs”), stop and re-read this file.
- Revisit only when deliberately merging products (explicit decision, not creep).
