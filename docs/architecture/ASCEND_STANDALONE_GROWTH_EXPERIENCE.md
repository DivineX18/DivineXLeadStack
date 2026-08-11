# Ascend Standalone — Growth Experience & Conversion Engine (LOCKED)

**Status:** Locked implementation specification for Ascend Standalone V1. Superseded/expanded 2026-08-11 with two first-class locked sections (Sales Experience, Partner & Affiliate Platform) replacing the original single-pass draft.

This document governs the evolution of the standalone Ascend experience after launch certification.

Its purpose is to transform the Growth Scan from a diagnostic report into the highest-converting sales experience in the platform, and to build the partner/affiliate ecosystem that scales acquisition around it.

This phase exists **before** the unified Ascend + Flow experience.

**Do not** expand this scope into the unified frontend.

**Do not** expose Flow as a product.

Flow operates only as DivineX's internal customer lifecycle platform during this phase.

> **Where this lives:** the actual implementation surface for this spec (Growth Scan report, Asset Studio, trial onboarding, partner platform, analytics) is the Ascend BI repo (`DivineX-Business-Intelligence`, `artifacts/divinex` frontend + `artifacts/api-server` backend) — not this repo. This doc is filed alongside [DIVINEX_V1_NORTH_STAR.md](DIVINEX_V1_NORTH_STAR.md) for a single place to find every locked governing spec. Flow (this repo) is touched only where the spec calls for "Flow lifecycle integration" verification — lead capture, attribution storage, nurture, lifecycle triggers, commission payout bookkeeping — never as a customer-facing product surface during this phase.

---

## Mission

Ascend is not simply a website auditor. It is a Business Intelligence Platform.

The Growth Scan should not end with a diagnosis. It should naturally lead users into the next step of their growth journey. The report itself becomes the product demonstration.

## Core Philosophy

Do not sell software. Sell clarity. Sell strategy. Sell momentum. Sell outcomes.

The customer should leave believing:

> "This platform understands my business and already knows what I should do next."

The trial simply allows them to continue.

## Customer Journey

```
Google Ads / Affiliate / Organic Search / Email
  ↓
Free Growth Scan
  ↓
Interactive Growth Report
  ↓
Feature Demonstrations
  ↓
Ascend Trial
  ↓
Ascend Subscription
  ↓
Flow quietly manages the lifecycle internally.
```

Customers should not feel like they are buying multiple products.

## Product Boundary

This phase is Ascend only. Flow is invisible. Flow should never be marketed during this phase.

Flow exists only to: capture leads, store attribution, run nurture, manage lifecycle, track conversions, trigger onboarding.

Customers buy Ascend. Not Flow.

---

# SECTION 1 — THE ASCEND SALES EXPERIENCE (LOCKED)

The Growth Scan is no longer a report. It is Ascend's primary salesperson.

The customer should finish the report already believing Ascend is the obvious next step. The objective is to let customers **experience** the product before asking them to buy it.

## Every Finding Becomes A Product Demonstration

Every recommendation must follow this structure:

```
Current Problem
  ↓
Why It Matters
  ↓
Business Impact
  ↓
What Ascend Can Build
  ↓
Interactive Preview
  ↓
Expected Outcome
  ↓
Start Free Trial
```

Never show generic upgrade banners. Never ask customers to buy without first demonstrating value.

### Example

**Finding:** Your website is not capturing leads.

**Business Impact:** Every visitor that leaves without taking action represents lost revenue.

**What Ascend Can Build:** Ascend can instantly generate a landing page, lead magnet, email nurture, CTA strategy, follow-up messaging, offer positioning.

**Interactive Preview:** Show the landing page hero → lead magnet title → Email #1 → growth roadmap → recommended CTA. This should be generated using the customer's **actual business**. Not placeholders.

**CTA:** "Continue Building" / "Start Free Trial"

The customer experiences Ascend. They don't imagine Ascend.

## Every Category Has A Matching Product Demo

| Category | Demo |
|---|---|
| Marketing | Landing pages, offers, ads, messaging |
| SEO | Content strategy, topic clusters, authority roadmap |
| Conversion | Landing page redesign, conversion roadmap, trust improvements |
| Sales | Offer positioning, sales messaging, pricing strategy |
| Brand | Brand messaging, positioning, voice, differentiation |
| Operations | 90-day roadmap, priority planner, Business Memory, Growth Timeline |

Every category should naturally transition into the feature that solves it.

## Preview System

Do not simply describe features. Actually preview them.

- **Landing page** → show first section
- **Lead magnet** → show title, outline, table of contents
- **Email sequence** → show first email, timeline, campaign overview
- **Growth roadmap** → show Month One
- **Business Memory** → show what Ascend will remember
- **Blueprint** → show first page
- **Action Plan** → show first three priorities

Customers should think: **"I already have part of this."**

## Product Experience Rules

Every recommendation should answer:
- What happens if I continue?
- What will Ascend actually create?
- How will my business improve?
- Why should I start now?

Never: "Upgrade" / "Unlock" / "Premium" / "Buy"

Instead: "Continue Building" / "Build My Growth Plan" / "Generate My Assets" / "Start My Roadmap"

## Future State Visualization

Every section should show:

```
Current
  ↓
Potential
  ↓
Transformation
  ↓
Ascend
```

People buy transformation. Not reports.

## Personalized Roadmap

Every report ends with **Your Next 90 Days**: Month One, Month Two, Month Three.

The CTA becomes: **"Continue Month One Inside Ascend."**

## Trial Experience

The trial should continue exactly where the report stopped. Never restart the journey. When the user enters Ascend they should immediately see their scan, roadmap, priorities, recommendations, generated assets, Growth Timeline. Nothing should feel disconnected.

## Conversion Principles

Always educate before selling. Always demonstrate before asking. Always personalize before promoting.

Every CTA should answer: **"Why should this customer continue?"** If the answer is weak, do not show the CTA.

## Product Demonstration Rules (contextual relevance)

Do not show every premium feature. Only demonstrate features relevant to the customer's findings — if Marketing scored well, don't sell Marketing assets; if SEO scored poorly, lead with SEO; if Conversion is weak, lead with conversion. Everything should feel contextual.

## User Experience Principles

The report should feel: premium, consultative, personalized, helpful, professional, strategic.

Never: salesy, pushy, generic, AI-generated, template-driven, banner-heavy.

Customers should forget they're reading software. It should feel like a consultant reviewing their business.

## Definition of Done (Section 1)

A customer should complete a free Growth Scan and think:

> "This platform already understands my business better than anyone else I've talked to."

The report should naturally transition into: **"Let's keep building."** The customer should want to continue because they've already experienced the value — not because they encountered another paywall.

---

# SECTION 2 — ASCEND PARTNER & AFFILIATE PLATFORM (LOCKED)

Ascend should become easy to recommend. The goal is to allow agencies, creators, consultants, educators, YouTubers, affiliates, and partners to confidently send traffic knowing they can transparently track performance and earn recurring commissions.

The affiliate system should feel like **a business platform** — not a simple referral link.

## Partner Types

Support multiple partner roles: Affiliate, Agency, Strategic Partner, Creator, Educator, Community, Referral Partner. Future roles may expand, but V1 should support flexible partner classification.

## Partner Dashboard

Every partner gets a dedicated dashboard displaying: referral link, QR code, clicks, Growth Scans started, Growth Scans completed, trial starts, paid subscribers, MRR referred, pending commissions, paid commissions, conversion rate, average customer value, top performing campaigns, leaderboard position (optional).

## Referral Attribution

Preserve attribution across the full lifecycle: partner ID, referral link, UTMs, campaign, source, medium, landing page → Growth Scan → trial → subscription → renewals → upgrades.

Do not lose attribution if the customer returns later. Support reasonable, configurable attribution windows.

## Commission Engine (V1)

Track: qualified leads, completed Growth Scans, trial activations, paid conversions, recurring subscription revenue, pending payouts, approved payouts, rejected commissions (with reason).

**No multi-level commissions in V1.** Keep the rules transparent and easy to audit.

## Partner Marketing Center

Provide ready-to-use promotional assets: referral links, email templates, social media posts, ad copy, landing pages, banners, logos, videos, brand guidelines, product screenshots, case studies. One-click copy buttons where appropriate. Make promoting Ascend effortless.

## Agency Experience

Agencies get an enhanced dashboard: view all referred businesses, track each client's status, see Growth Scan completion, monitor trial activity, track subscriptions, monitor recurring revenue, identify upsell opportunities.

**Future-ready hooks (not V1 implementation):** client management, white-label reports, implementation services, shared workspaces, agency analytics.

## Admin Partner Center

Internal management interface: all partners, performance metrics, top referrers, conversion rates, commission history, pending approvals, fraud indicators, manual adjustments, payout history, exportable reports.

## Partner Notifications

Automatically notify partners when: a referral completes a Growth Scan, a trial starts, a subscription begins, a renewal occurs, a payout is approved, monthly performance summaries are available.

## Analytics (Partner Funnel)

Track the complete acquisition funnel: impressions (if available), clicks, landing page conversion, Growth Scan starts/completions, report engagement, trial starts/conversions, subscription conversions, retention, churn, LTV, revenue by partner/campaign/industry, top performing assets.

## Future Expansion

Design the architecture so future versions can support partner tiers, performance bonuses, co-branded landing pages, agency implementation services, marketplace listings, white-label programs, certification programs, partner training — **without requiring a major rewrite.**

## Guiding Principle

The affiliate platform is not just about paying commissions. It is about creating an ecosystem where partners are motivated to grow alongside DivineX because they have visibility, trust, resources, and recurring value.

---

## Analytics (Growth Scan Funnel — Section 1)

Instrument the complete funnel: Growth Scan starts, Growth Scan completions, report views, time on report, section engagement, feature preview views, feature preview clicks, CTA clicks, trial starts, trial completion, subscription conversion, revenue, affiliate source, traffic source, campaign, keyword, landing page, industry, business type, growth score, primary bottleneck, conversion by bottleneck, conversion by industry, conversion by score.

Everything should become measurable.

## Lead Lifecycle (Internal Only)

Flow manages the customer lifecycle. Customers should never need to understand this architecture.

```
Growth Scan → Lead Created → Affiliate Stored → UTMs Stored → Source Stored
  → Trial Started → Email Sequence → Behavior Tracking → Subscription → Onboarding
```

Flow remains invisible.

---

## Engineering Principles (both sections)

**Before writing code, audit:** the current report architecture, trial onboarding, entitlements, Asset Studio, analytics, CTA components, Flow lifecycle integration — and, for Section 2, any existing referral/attribution scaffolding before assuming none exists.

Reuse existing infrastructure. Do not create parallel systems.

**Spend 80% understanding the architecture. 20% implementing.** (Same discipline as [DIVINEX_V1_NORTH_STAR.md](DIVINEX_V1_NORTH_STAR.md).)

## Testing

Certify: desktop, tablet, mobile, report rendering, trial transition, generated previews, tracking, affiliate attribution, lead capture, email lifecycle, repeat visits, returning users, subscription conversion, partner dashboard accuracy, commission calculation correctness, payout audit trail. No broken states.

## Deliverables

Provide: architecture plan, reuse analysis, files changed, components reused, analytics events added, CTA locations, preview components added, trial journey updates, Flow lifecycle verification, attribution verification, testing evidence, screenshots, remaining gaps, production recommendation.

## Final Mandate

The Growth Scan is no longer just a diagnostic report. It becomes Ascend's primary salesperson. Every recommendation should educate. Every preview should inspire. Every CTA should feel like the obvious next step. The objective is not to maximize clicks — it is to maximize confidence.

The affiliate platform is not a bolt-on referral link — it is a business platform partners are motivated to grow alongside DivineX.

Those two systems together become the commercial engine while the unified Ascend + Flow platform continues in parallel.

---

## Process note — how this gets executed

Per the user's own explicit recommendation attached to this spec: the first deliverable against **Section 1** is an **audit of the current Growth Scan report architecture + wireframes for the new sales experience** — not code. **Section 2** (Partner & Affiliate Platform) needs its own separate audit-first pass (existing attribution/UTM scaffolding, any prior referral-link work, entitlements model) before design, since it's a materially different system (commission accounting, payouts, partner-facing dashboards) from the report-experience work in Section 1 — treat them as two sequenced audits, not one combined pass.

Each audit/wireframe pass gets its own dedicated Explore-then-Plan cycle and user approval checkpoint before any implementation starts, matching how every other major feature this project ships gets scoped. Both are sequenced behind the in-flight work already committed to at the time this spec landed (digital product delivery, DivineX Reconnect Series) rather than interrupting them mid-build.
