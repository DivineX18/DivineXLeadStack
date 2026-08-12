# DivineX Commercialization Sequence (LOCKED)

**Status:** Locked execution order for standalone Ascend commercialization through to the unified Growth OS transformation. Companion to [DIVINEX_V1_NORTH_STAR.md](DIVINEX_V1_NORTH_STAR.md), [ASCEND_STANDALONE_GROWTH_EXPERIENCE.md](ASCEND_STANDALONE_GROWTH_EXPERIENCE.md), and [ASCEND_SALES_EXPERIENCE_WIREFRAMES.md](ASCEND_SALES_EXPERIENCE_WIREFRAMES.md).

This is the order, not a menu — each phase is a prerequisite for the next, not parallel workstreams to pick from freely.

---

## 1. Finish Ascend Sales Experience now

- Real **Start Free Trial** entry point (in progress).
- Rewrite the report's CTA into the full sales flow: **Finding → Impact → What Ascend Builds → Interactive Preview → Trial CTA**.
- The CTA continues into the trial state, not straight to Stripe checkout.
- **Preserve the user's Growth Scan/business context when they enter the trial** — the scan that got them here should already be reflected in their account on arrival, not a blank slate they re-explain from scratch.
- The report must still feel **diagnostic first** — a consultant's finding, not an ad wall.
- Test **free scan → report → preview → trial → paid conversion** end to end before calling this phase done.

The trial entry point and the CTA rewrite are one task, not two — a trial button with nowhere good to send it, or a rewritten CTA with no real trial to send people to, both fail to close the loop. Build together.

## 2. Finish the internal acquisition machine

Flow stays fully internal here — it operates the business, it is not marketed as part of Ascend yet.

- Ascend lead → Flow contact (sync working).
- Reconnect sequence (dormant list — built, awaiting content review).
- Growth Scan nurture (new leads who haven't converted).
- Trial nurture/onboarding (people mid-trial).
- **Paid customer suppression** from prospect sequences — a converted customer must stop receiving prospect-stage nurture.
- Source/UTM/referral attribution preserved end to end.

## 3. Launch Ascend standalone

- Google Ads.
- Old list reactivation (the Reconnect Series, once reviewed).
- Partners/affiliates via **tracked links only** at first — the full Partner Dashboard is not a launch blocker. Attribution must already be preserved (phase 2) so nothing is lost by launching before the dashboard exists.
- Start collecting real scan → trial → paid behavior — this data is itself a launch goal, not just a side effect.

**Freeze point:** once the standalone acquisition experience (phase 1) is live and tested, stop iterating on it and start driving traffic. Revenue and real user data matter more at this point than further polish on an unused funnel.

## 4. Unified UX Transformation

This is where [DIVINEX_V1_NORTH_STAR.md](DIVINEX_V1_NORTH_STAR.md) and the unified Ascend + Flow shell work becomes the priority — not before.

**Flow disappears visually. Ascend becomes the OS.** Codebases are not merged — Flow's presentation layer is gradually replaced with Ascend-native experiences while Flow stays underneath as the execution engine.

Work happens **lifecycle-by-lifecycle**, not as one giant shell rewrite:

```
Home → Identify → Create → Launch → Grow → Optimize → Scale → Settings
```

Each lifecycle section follows the same structure:

```
Context → Intelligence → Recent Activity → Quick Actions → Recommendations → Progress → Execution
```

Concretely: **Create** doesn't open on a bare funnel builder — it opens on *what the business should create and why*, then reveals the existing builder underneath as the execution layer. **Grow** doesn't open on a CRM table — it opens on business health, pipeline movement, and what needs attention, then exposes contacts/pipeline/calendar as execution tools underneath. That progression — intelligence first, raw tooling revealed after — is how Flow actually disappears from the user's perception without being rebuilt from scratch.

---

## Why this order

Phase 1 without phase 2 converts leads nobody suppresses correctly. Phase 3 without phase 1 sends paid traffic into an unproven funnel. Phase 4 before phases 1-3 spends the biggest, riskiest engineering lift before there's any revenue or real usage data to design it against. Commercialize what exists, prove it works with real traffic and real money, *then* invest in making the unified product feel native — in that order, not reversed.
