# P0.6 Phase 2 — Zeno context survey (step 1, before implementation)

**Status:** survey only. No code changed. Written because the Phase 2 brief
required tracing the architecture before implementing, and the trace changed
what Phase 2 actually needs to build.

## Headline finding

**Business and brand context already reaches Zeno.** The "Never Ask Known
Facts" foundation is largely built and was shipped as DivineX Slice 7. The
real Phase 2 gap is much narrower than "Zeno doesn't know the business" — it
is that **Zeno has no idea where the customer is or what they are looking at.**

## Current architecture, end to end

| Concern | Where | State |
|---|---|---|
| Zeno UI mount | `src/components/ai-suite/zeno-launcher.tsx`, mounted once in `src/app/(dashboard)/layout.tsx` | **Already global** across the authenticated shell |
| Chat route | `src/app/api/ai-suite/chat/route.ts` (469 lines) | Assembles cards → `buildAiSuiteSystemPrompt` |
| Prompt builder | `src/lib/ai-suite/prompt.ts` | Single source of truth; one persona |
| Retrieval | `src/lib/ai-suite/retrieve.ts` + `knowledge-base.ts` | Keyword-matched app how-to cards |
| Confirm/execute | `src/app/api/ai-suite/confirm/route.ts` | U1 boundary lives here (`96aeb54`) |
| Business/Brand profile | `getDivinexProfileSnapshot(subAccountId)` → `divinex-business-profile` card | **Already injected** |
| Conversion frameworks | `renderFrameworksAsCards(CONVERSION_FRAMEWORKS)` | Already injected |
| Ascend framework library | `listAscendFrameworks()` | Already injected |
| Workspace context | `caller.workspaceName` + `workspaceRole`, resolved server-side | **Already correct** |
| Conversation persistence | `/api/ai-suite/thread` | Exists; not per-route |

### What Zeno already knows (verified in source, not assumed)

The `divinex-business-profile` card carries business name, type, website,
audience, primary offer, offers with ids, brand voice, brand visual, and the
approved asset inventory — and closes with the instruction:

> "never ask the customer for anything above — you already know it."

Caller identity, workspace name and workspace role are resolved **server-side
from the session**, never from the model or client.

### What Zeno does NOT know — the actual Phase 2 gap

`AiSuiteChatRequest` is the whole client contract:

```ts
interface AiSuiteChatRequest {
  level: AiSuiteLevel;
  subAccountId?: string;
  messages: AiSuiteChatMessage[];
}
```

There is **no route, no page, and no artifact reference**. Consequently:

1. **No page awareness.** Zeno cannot tell Create from Leads from Performance
   from Intelligence. A customer on a landing page must still say "I'm looking
   at my landing page."
2. **No current-artifact awareness.** No funnel/campaign reference, so Zeno
   cannot discuss the thing on screen.
3. **No growth diagnosis / opportunities.** Ascend *frameworks* are injected;
   the workspace's actual diagnosis and Growth Opportunities are not. Zeno can
   still ask the customer to re-explain what Ascend already concluded.
4. **Profile card is sub-account-level only**, inside a conditional block.

## Smallest coherent context boundary (proposed)

One context contract with route-specific fields, not four prompt systems and
not a new authority:

1. Extend `AiSuiteChatRequest` with `pageContext?: { route: string; artifactRef?: { kind: string; id: string } }`.
2. **Treat both as context, never authorization.** The route is a hint. The
   `artifactRef` must be re-resolved server-side against the authenticated
   workspace; a funnel not owned by that workspace never enters context. This
   is the security-critical part of Phase 2 — an artifact reference from a
   client is exactly the shape a cross-tenant read would take.
3. Render one additional card ("What the customer is looking at right now")
   plus a diagnosis card sourced from existing Ascend intelligence.
4. Reuse `getDivinexProfileSnapshot` and the existing card mechanism —
   `buildAiSuiteSystemPrompt` needs no structural change, exactly as Slice 7
   found.

No new Business Profile, no new memory system, no Ascend/Flow conversation
merge, no second agent.

## Consequence for Phase 2 scope

The work is: **context contract + server-side artifact resolution + two cards
+ the certification suite.** It is not a Zeno rebuild. The persistence
requirement (F) is largely already satisfied — the launcher is mounted once in
the dashboard layout, so it survives route changes today; the certification
still needs to prove it behaviorally.

## Carried-forward unresolved item

**Production Stripe positive control not yet established** (from Phase 1).
Must be resolved or documented as a blocker before final P0.6 certification.
