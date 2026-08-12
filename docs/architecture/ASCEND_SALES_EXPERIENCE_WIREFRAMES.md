# Ascend Sales Experience — Wireframes & Implementation Plan (v1 draft)

Companion to [ASCEND_STANDALONE_GROWTH_EXPERIENCE.md](ASCEND_STANDALONE_GROWTH_EXPERIENCE.md) (the locked spec). This is the "audit + wireframes before code" deliverable the spec's own process note calls for. Covers **Section 1 (Sales Experience)** in full implementation-ready detail; **Section 2 (Partner/Affiliate)** gets a shorter architecture-level treatment at the end — it's a genuinely separate system (commission accounting, payouts) that deserves its own dedicated pass once Section 1's direction is confirmed, per the spec's own sequencing note. Not locked — this is the draft to react to, not a second spec.

All file references are in `DivineX-Business-Intelligence` unless noted.

---

## What exists right now (grounding — confirmed by reading the actual code, not the audit summary)

`GrowthScanReportContent.tsx` renders the whole report. The gating logic already exists and is exactly right for what the new experience needs — **`isPublic` / `isFreeTier` / `needsUpgrade`** flags already branch behavior per section. This is the reuse story: the plumbing that decides "should this person see the real thing or a gate" is done. Only the *content* of the gate changes.

The current CTA, `ScoreBandCta` (lines 144–246), is score-tiered (80+/60+/40+/<40 → Solid Foundation / Growing / Needs Work / Rebuild Required) and already routes differently for `isPublic`/`isFreeTier` vs. entitled users. Copy today: **"Get Started with Ascend," "Fix the Gaps," "Unlock Full Report," "Sign Up Free," "Book Strategy Call."** This is the component the spec wants rewritten — not replaced, rewritten in place, since the score-band branching itself is correct and should stay.

`BlurGate` (line 39) is the existing "blur the content, show a CTA over it" pattern used for gated sections (positioning, lead magnets, etc. inside `zeno_blueprints`). This is the exact mechanical pattern the new "Interactive Preview" sections plug into — a preview is a `BlurGate`-style wrapper that shows *real, partial* content instead of *fully blurred* content.

---

## Wireframe 1 — Rewritten `ScoreBandCta` → "Finding → Preview → CTA" block

Today, one component renders a static finding + a single button. The new version renders the full spec progression inline, still gated by score band (reuse the exact same 4-tier logic):

```
┌─────────────────────────────────────────────────────────────┐
│ [band label, e.g. "GROWING · TARGETED FIXES NEEDED"]        │
│                                                                │
│ CURRENT PROBLEM                                               │
│ {existing band copy, e.g. "A few focused changes could       │
│  unlock significant growth."} — UNCHANGED, already good       │
│                                                                │
│ BUSINESS IMPACT                                                │
│ {new: 1 sentence, pulled from scan.biggestBottleneck +        │
│  scan.categoryScores — "X is costing you Y" framing,          │
│  reuses existing scan fields, no new AI call needed}          │
│                                                                │
│ WHAT ASCEND CAN BUILD                                          │
│ {new: 3-5 checklist items, mapped from scan.recommendedFunnel │
│  Type + scan.recommendedLeadMagnet — already on the scan row} │
│                                                                │
│ ┌─ INTERACTIVE PREVIEW ─────────────────────────────────────┐ │
│ │ Tabs: [Landing Page] [Lead Magnet] [Email #1] [Roadmap]   │ │
│ │                                                             │ │
│ │ If zeno_blueprints row exists for this scan:               │ │
│ │   → render REAL content (positioning.brandStatement,       │ │
│ │     leadMagnets[0].title, emailSequence[0], roadmap.month1)│ │
│ │ If no blueprint yet (the common case — free scan only):    │ │
│ │   → render a SAMPLE preview card, clearly labeled          │ │
│ │     "Example — yours will be built from your actual scan"  │ │
│ │     (never present a sample as if it's the user's own —    │ │
│ │     matches the spec's "never fabricate examples" rule)    │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                │
│ [Continue Building Inside Ascend →]  ← replaces "Get Started" │
└─────────────────────────────────────────────────────────────┘
```

**Reuse:** `scan.categoryScores`, `scan.biggestBottleneck`, `scan.recommendedFunnelType`, `scan.recommendedLeadMagnet` are already on every `growth_scans` row — the "Business Impact" and "What Ascend Can Build" sections need **zero new AI calls**, just better copy templating off data that already exists.

**New work:** the preview tabs component itself (new), and a fallback "sample preview" state for scans with no blueprint yet (new, but simple — static example content, not generated).

**CTA copy change:** "Get Started with Ascend" / "Fix the Gaps" / "Unlock Full Report" → **"Continue Building Inside Ascend"** everywhere. One shared label, not per-band — simpler than the current 4 separate labels and matches the spec's explicit CTA-language rule.

---

## Wireframe 2 — Category sections (Marketing/SEO/Conversion/Sales/Brand/Operations)

Today: `BlurGate`-wrapped sections show blurred real content + "Unlock Full Report." New: each category section gets a **preview strip** before the gate, matching the spec's "every category has a matching product demo" table:

```
┌─ SEO ──────────────────────────────────────────────────────┐
│ Score: 42/100                                                │
│                                                                │
│ {existing scored findings — unchanged}                       │
│                                                                │
│ ┌─ What Ascend builds for SEO ─────────────────────────────┐│
│ │ • Content calendar  • Topic clusters  • Authority roadmap ││
│ │ [Preview: Month 1 content calendar — 3 sample topics]      ││
│ └───────────────────────────────────────────────────────────┘│
│                                                                │
│ {BlurGate on deeper content — unchanged mechanism}            │
└────────────────────────────────────────────────────────────┘
```

**Contextual relevance rule from the spec** ("if SEO scored poorly, lead with SEO") is implemented by **sort order**, not visibility — render category sections sorted by ascending score (worst first) instead of the current fixed order. This is a small, contained change (one `.sort()` call) that delivers a real spec requirement.

---

## Wireframe 3 — The 90-Day Roadmap (report footer)

`zeno_blueprints.roadmap` already has `month1`/`month2`/`month3` shape (confirmed via a real row read earlier this session — `roadmap.month1.tasks: string[]`). Today this is gated behind `BlurGate` like everything else. New treatment:

```
┌─ YOUR NEXT 90 DAYS ──────────────────────────────────────────┐
│ [Month 1 — expanded, real tasks if blueprint exists]          │
│   ✓ Finalize your core positioning                            │
│   ✓ Create the lead magnet                                    │
│   ✓ Launch nurture strategy                                   │
│ [Month 2 — collapsed preview]  [Month 3 — collapsed preview]   │
│                                                                  │
│         [Continue Month One Inside Ascend →]                   │
└──────────────────────────────────────────────────────────────┘
```

Month 1 shown expanded+real when a blueprint exists (no new generation — already-existing data, just better presented). Months 2-3 stay collapsed teasers. No blueprint yet → same sample-labeled fallback as Wireframe 1.

---

## Trial state — the one piece with no existing foundation

This is real new work, confirmed by the audit (`EntitlementGate`'s own code comment: *"there is no free tier product"*). Minimal, additive design that doesn't touch the existing binary paid/unpaid gate:

- New column on the user/entitlement join (or a new `trials` table): `trial_started_at`, `trial_expires_at` (e.g. 7 days), `trial_source` (which scan/report triggered it).
- `checkEntitlement()` gets one new branch: if no paid entitlement but an active trial exists, return true with a `via: "trial"` flag the frontend can use to show a "Trial — N days left" badge instead of hiding the upgrade path entirely.
- `EntitlementGate` redirect target changes from unconditional `/pricing` to: has trial → let through; no trial and never had one → `/start-trial` (new, one-click, no payment info — matches spec's "never ask for payment before demonstrating value"); trial expired → `/pricing`.
- **Reuse:** the entitlement CHECK function, the gate component, the Stripe webhook plumbing for eventual paid conversion — none of that changes. Only the "what counts as entitled" predicate grows one more OR branch.

---

## Analytics — smallest viable instrumentation, not a platform

The spec asks for a long event list. Rather than build a custom analytics platform, the pragmatic v1: pick **one** existing, cheap, privacy-respecting tool (PostHog is the natural fit — self-hostable or their free cloud tier, has both frontend + backend SDKs, session-replay is a bonus for later UX iteration) and instrument exactly the funnel events the spec names: `scan_started`, `scan_completed`, `report_viewed`, `preview_clicked` (per category), `cta_clicked` (per CTA location), `trial_started`, `trial_converted`. That's 7 events, not the full 25-item list on day one — the rest (revenue-by-industry, conversion-by-score cuts) are queries against those 7 events' properties (`score`, `bottleneck`, `industry` already exist on `growth_scans` — just attach them as event properties), not separate instrumentation work.

---

## Section 2 (Partner & Affiliate) — architecture-level only, needs its own pass

Confirmed: zero scaffolding on the DivineX/Postgres side. Flow's existing affiliate system (`src/types/affiliate.ts`, `src/lib/affiliate/*`, `/agency/affiliates/*`) is Firestore-based and not directly portable, but its **shape** is a strong reference: distinct `partners`/`clicks`/`referrals`/`payouts` entities, cookie-based last-click attribution, magic-link partner auth (no password), agency-side admin for approvals/payouts. Porting that shape to Drizzle/Postgres tables in the Ascend BI repo is a clean, well-precedented design — not a blank-page problem, even though it's a full new build here.

This deserves its own audit-to-wireframe pass (commission math, payout workflow, partner dashboard screens) rather than being squeezed into this document — flagging it as the next thing to scope once Section 1's direction is confirmed, per the locked spec's own sequencing note.

---

## Suggested build order (Section 1)

1. Trial state (schema + entitlement branch + `/start-trial`) — unblocks everything else being meaningfully "tryable" rather than "read-only."
2. Rewrite `ScoreBandCta` (Wireframe 1) — highest-visibility, most contained change.
3. Category section preview strips (Wireframe 2) + score-ascending sort.
4. Roadmap footer treatment (Wireframe 3).
5. Analytics (7 events) — instrument as each of the above ships, not as a separate pass at the end.

Each of those is independently shippable and testable — no need to build all of Section 1 before any of it is real.
