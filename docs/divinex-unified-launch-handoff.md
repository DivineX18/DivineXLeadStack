# DivineX Unified — launch handoff

Continuation artifact for the Unified launch pass. A fresh context should read
the Master Spec, then this, then confirm real git/staging state before working.
**Actual code + behavioural evidence beats anything written here.**

## State

| | SHA | Staging | Production |
|---|---|---|---|
| Flow | see `git log -1` | verify `GET /api/version` | UNTOUCHED |
| Ascend | `841c421` | verified behaviourally | UNTOUCHED |

Staging: `https://flow-growth-scan-staging.onrender.com`
Complete-mode workspaces: `MEYB8CbWlE5fxAn3TJOp` (DivineX), `gXQ6oH73xtvv7LsV1sQT` (Ascend-linked probe)
Enter via `/sa/<id>/switch` then `/` — the shell needs an active workspace.

## Completed + behaviourally certified

- CP1 trustworthy creation; CP2 intelligence→execution, unified create, email
- CP3 customer journey; landing-page quality battery (3 businesses)
- Unified navigation integrity (20/20 routes, 0 shell escapes)
- Clean customer URLs (`/create`, `/leads`, … ; root = Home)
- Light/dark + theme toggle; floating Zeno (human-confirmed)
- Funnel edit loop: preview → Edit → load → save → preview
- Plan-survives-edit: `argumentRole` / `servesBelief` / `canvas`

## Completed — VISUAL FUNNEL EDITOR (canvas layer)

Behaviourally certified on staging (`scripts/verify-visual-editor.mts`):
real page canvas, section selection, reorder handle, duplicate, delete,
desktop/mobile toggles, order persists, and argumentRole/servesBelief/canvas
all survive reorder.

Done this session:
- `api/sub-accounts/[id]/media` — shared workspace media (GET list, POST upload).
  Reuses the EXISTING chunked `funnelAssets` store + `/api/funnel-asset/[id]`.
- `components/media/media-picker.tsx` — Upload / My media / Brand library /
  Paste link. Stock + Generate deliberately absent (no real provider).
- `lib/funnels/video-url.ts` — YouTube/Vimeo normalisation, unit-verified.

- `components/funnels/visual-canvas.tsx` — renders `PublicFunnelView` per
  section (NOT a second renderer) with selection + `@dnd-kit` vertical reorder.
  `@dnd-kit/modifiers` is not installed; the axis lock is inline.
- `funnel-builder.tsx` — Visual/Fields views of ONE document, desktop/mobile
  viewport, `duplicateSection` (spreads the section, new id only) and
  `reorderSections` (arrayMove) so plan fields are moved, never rebuilt.

Also certified: media picker wired into ALL seven section media fields
(no media input reads e.target.value any more), VideoField normalises pasted
YouTube/Vimeo links, and Add Section works from canvas insertion points with a
registry-driven picker (27 types). New sections start empty and are refused by
the existing publish guard — verified, not assumed.

Contextual Zeno is DONE and certified (`scripts/verify-editor-zeno.mts`):
`page-context.ts` now projects the real section order + selected section from
the STORED doc (client selection is a hint, never an authority); Zeno
recognised 6/7 sections with real headlines, scoped to the selected FAQ, and
disclosed nothing for a foreign funnel id.

DONE since: imagery guidance (`lib/funnels/imagery-guidance.ts`, reuses the
Image Director — no second rule set; never fabricates), and `revise_funnel_copy`
so Zeno can actually change a page it can see. The confirm card IS the review
gate: `summarize()` prints the real replacement text. Copy fields are an
ALLOWLIST — priceCents/formId/stripePriceId are unreachable — and the
capability cannot add/delete/reorder/retype sections, so structural change
stays with the human in the editor.

Discovery: the page-context card was deliberately id-free, so Zeno had no way
to learn funnel_id/section_id and guessed. The card now carries a TOOL
REFERENCES line (ids may reach the model, never customer prose). Only found by
running the full loop — the capability passed in isolation.

DONE since: **campaign persistence** (`lib/server/campaigns-service.ts`,
`campaigns/{id}`, server-only rule deployed) extending the EXISTING
`CampaignIntent`/`CampaignPlan` — `offerState`, `approved` decisions, per-step
status with stable asset references, `distribution.social` (social is content,
NOT follow-up), and change-awareness. 17 checks green against real Firestore
including tenancy both ways and "stale steps are flagged, never rewritten".

**Campaign threading** is implemented as a context CARD in the chat route
(`divinex-active-campaign`), not a new param on every capability — generators
untouched, and no campaign simply means no card.

### BLOCKED ON EXTERNAL CONFIG (not a code defect)
Staging model calls return 502 ("couldn't reach the model"). OpenRouter's own
API answers 200, and these SAME suites passed earlier the same session, so the
staging `OPENROUTER_API_KEY` is the likely cause (credits/validity). Affected
and currently UNAVAILABLE, not failed:
`verify-campaign-inheritance`, `verify-editor-zeno`.
Re-run both once the key is restored — they are written to exit UNAVAILABLE
rather than fail, so a green run is still required before claiming these.

### NEXT — first incomplete items, in order
1. Re-run the two UNAVAILABLE suites once the staging model key works.
2. Campaign Plan control centre UI (YES / NO / CHANGES per step) — read/write
   via `campaigns-service`; do not add a second state model.
3. Series generation (email, SMS, social) from the approved plan, reusing
   `create_email` / `apply_workflow_plan` / the social publisher.
4. Social connection + final campaign review. Meta App Review still pending.

Optional polish, not blocking: page-level structural Zeno changes still have no
diff preview. Scoped edits are safe and reviewed; a whole-page restructure
capability does not exist yet, so nothing can bypass review today.

## Architectural discoveries (do not re-derive)

- `@dnd-kit/core` + `sortable` already a dependency — do not add another.
- Upload storage already existed (`lib/funnels/assets.ts`); only the surface
  was missing. `funnelId` on an asset is provenance, tenancy is `subAccountId`.
- Section registry = `SECTION_LABELS` in `components/funnels/funnel-builder.tsx`.
- 29 section renderers in `components/funnels/sections/`.
- **Campaign infra already exists** (`lib/divinex/campaign.ts`:
  `CampaignIntent`, `CampaignPlan`, `validateCampaignPlan`,
  `renderPlanSummary`) and `apply_workflow_plan` compiles a plan into a real
  draft workflow. The gap is that **CampaignPlan is never persisted**. Extend
  it; do not build a second campaign system.
- `types/conversion.ts::CampaignContext` is the NARROWER funnel/conversion
  context (traffic source, temperature, device, geo). Keep it separate.

## Product standard (LOCKED)

`docs/divinex-unified-product-standard.md` governs implementation decisions:
inventory, KEEP/IMPROVE/INTEGRATE/MISSING matrix, journey gaps, and the
P0–P3 roadmap with acceptance tests. Read it before proposing any feature.

Headline findings: pages are NOT the weak point (certified across 3
industries). The real gaps are **funnel measurement** (no view/conversion
telemetry exists anywhere), **recommendations are text not actions**, **Zeno
has no capability for forms/booking/products/social/agents** even though Flow
executes them, and **no multi-step qualification funnel model**.

## Do not reopen

- Sales Argument Engine, Landing Page Critic, Image Director
- Shell-escape fixes; clean-URL rewrites (root is a middleware REWRITE — a
  redirect loops against the `/app/home` entry chain)
- Any Flow component mounted under `/app` needs `SubAccountProvider`
  (`inAscendShell`) or it throws — caused two regressions already.

## External configuration required

- Meta App Review (`pages_manage_posts`, `instagram_content_publish`) before
  real social publishing. Code exists; approval does not.
- Stock media + AI image generation: no provider wired. Not a launch blocker.

## Verification suites

`verify-unified-navigation` · `verify-clean-urls` · `verify-funnel-edit-loop` ·
`verify-plan-survives-edit` · `verify-shell-safety` · `verify-unified-theme` ·
`verify-video-url` · `verify-staging-unified-create` · `verify-quality-battery`

## Production

UNTOUCHED. Do not merge main. Do not deploy production.
