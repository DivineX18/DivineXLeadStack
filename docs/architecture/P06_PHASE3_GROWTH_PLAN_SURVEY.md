# P0.6 Phase 3 — Growth Plan survey (step 1, before implementation)

**Status:** survey only. No code changed.

## Headline: there is no Growth Plan object, and there should not be one

Five plan-adjacent concepts exist. **None of them is a plan.** They are a
diagnosis, a history, a static template library, and a set of artifacts.
Creating a `growth_plans` table would be "Growth Plan #6" — a sixth concept
that duplicates truths the other five already own.

**Home is already the plan surface.** It has been since Production Experience
2.0 Phase C. What it lacks is the execution half.

## What exists, and what each actually owns

| Concept | Where | Owns | Is it a plan? |
|---|---|---|---|
| `growth_scans` (`topOpportunities`, `biggestBottleneck`, `fullReportJson`) | Ascend | **The diagnosis** — the authoritative "what matters now" | No — a finding |
| `strategy_snapshots` (`payload` jsonb) | Ascend | An immutable point-in-time strategy render | No — a snapshot |
| `growth_timelines` (`businessEvolution`, `categoryDeltas`, `recommendationProgress`) | Ascend | **Change over time**, incl. `recommendationProgress` (completed / improved / outstanding / new_opportunity) | No — history, but see below |
| `strategyEngine.ts` recommendation templates | Ascend | Static copy keyed by constraint | No — a library |
| `funnels/{id}` (`status`, `visualRequirements`, `criticVerdict`) | Flow | **Execution + approval state** (P0.4 states) | No — the artifact |
| `CustomerCompletion` (`96aeb54`) | Flow | The one customer-facing completion message | No — transient |
| `resolveHomeDashboard` → `recommendedNextAction` | Flow | The projection that already answers "what should I do next" | **Closest thing** |

### Home already answers two of the five questions

`src/app/app/home/page.tsx` is explicitly ordered as an argument:

1. *What should I do next* — `RecommendedNextActionCard`
2. *How is the business doing* — health strip
3. *What does DivineX know* — intelligence, recessive

So **"What matters now?"** and **"What are we doing about it?"** already have a
home, sourced through one sanctioned entry point (`resolveHomeDashboard`).

### What is genuinely missing

Three of the five questions have no surface anywhere:

- **What has been built?**
- **What needs my review?**
- **What should happen next?** (for work already underway, not the next
  diagnosis-driven recommendation)

A customer who has Zeno build a landing page can only find it through chat
history or the Create library. Nothing connects the build back to the strategy
that prompted it.

**The authority for all three already exists** — `funnels/{id}.status` (the
P0.4 state machine), `visualRequirements` (outstanding review items) and
`criticVerdict` (reviewed or not). None of it needs duplicating; it needs
projecting.

## Recommended architecture

**Growth Plan is Home, extended with an execution strip** — a projection, not
a new authority, exactly like the Super Admin surfaces.

- **Location in final IA: Home.** No sixth destination. Home already opens
  with "what should I do next"; the execution state belongs directly beneath
  it, so strategy and execution read as one argument.
- **Strategy** stays owned by Ascend (`resolveHomeDashboard`).
- **Execution/approval** stays owned by the artifact (`funnels/{id}.status`).
- **State mapping** is derived at read time from the artifact's own status —
  never stored, so it cannot drift from the artifact:

  | Artifact status | Growth Plan reads |
  |---|---|
  | `draft` + unresolved required visuals | Built → Needs your photos |
  | `draft` | Built → Needs review |
  | `ready_for_review` | Built → Needs review |
  | `changes_requested` | Changes requested |
  | `approved` | Approved → Not published yet |
  | `scheduled` | Scheduled |
  | `published` | **Live** |
  | `paused` / `archived` | Paused / Archived |

  `approved` deliberately reads *"Not published yet"* so the surface can never
  imply Approved = Published.

### The one genuinely open design question

Linking an artifact back to the *recommendation* that prompted it is the only
relationship that does not exist today. **It may not be needed for Phase 3**:
"what has been built and needs review" is answerable from the artifacts alone.
If it is added later, the minimal form is one nullable reference on the
artifact — not a join table, and not a plan object.

## Effect on carried-forward item H

`growth_timelines.recommendationProgress` already classifies recommendations
as completed / improved / outstanding / new_opportunity, and
`growth_scans.topOpportunities` / `biggestBottleneck` hold the diagnosis.
**These are a real existing seam** — but they live in Ascend's Postgres and
are *not* in `DivinexProfileSnapshot`, which is what Flow reads.

So H is unchanged: the data exists, the contract does not carry it.
**Documented for final P0.6 consideration; not extended in Phase 3.**

## Explicitly not proposed

No `growth_plans` table. No task board, kanban, assignees, comments, due
dates or templates. No second planning authority. No duplication of
diagnosis or artifact state into a new store.
