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

### NEXT — first incomplete items, in order
1. Contextual Zeno inside the editor: element / section / page scope, reusing
   the existing Zeno + AiSuiteChat. Selected section id is already tracked in
   the builder (`expanded`); the funnel doc is already loaded — pass both as
   chat context rather than building a second AI surface.
2. Human review for structural page-level Zeno changes (propose -> review ->
   apply); scoped element/section edits apply directly.
3. Imagery guidance from Image Director / `visualRequirements` — surface
   "this section would benefit from X" rather than inventing imagery.
4. Then Campaign persistence per the Master Spec (extend
   `lib/divinex/campaign.ts`; do NOT build a second campaign system).

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
