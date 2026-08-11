# Ascend Standalone — Growth Experience & Conversion Engine (LOCKED)

**Status:** Locked implementation specification for Ascend Standalone V1.

This document governs the evolution of the standalone Ascend experience after launch certification.

Its purpose is to transform the Growth Scan from a diagnostic report into the highest-converting sales experience in the platform.

This phase exists **before** the unified Ascend + Flow experience.

**Do not** expand this scope into the unified frontend.

**Do not** expose Flow as a product.

Flow operates only as DivineX's internal customer lifecycle platform during this phase.

> **Where this lives:** the actual implementation surface for this spec (Growth Scan report, Asset Studio, trial onboarding, analytics) is the Ascend BI repo (`DivineX-Business-Intelligence`, `artifacts/divinex` frontend + `artifacts/api-server` backend) — not this repo. This doc is filed alongside [DIVINEX_V1_NORTH_STAR.md](DIVINEX_V1_NORTH_STAR.md) for a single place to find every locked governing spec. Flow (this repo) is touched only where the spec calls for "Flow lifecycle integration" verification — lead capture, attribution storage, nurture, lifecycle triggers — never as a customer-facing product surface during this phase.

---

## Mission

Ascend is not simply a website auditor.

It is a Business Intelligence Platform.

The Growth Scan should not end with a diagnosis.

It should naturally lead users into the next step of their growth journey.

The report itself becomes the product demonstration.

---

## Core Philosophy

Do not sell software.

Sell clarity. Sell strategy. Sell momentum. Sell outcomes.

The customer should leave believing:

> "This platform understands my business and already knows what I should do next."

The trial simply allows them to continue.

---

## Customer Journey

```
Google Ads
  ↓
Affiliate
  ↓
Organic Search
  ↓
Email
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

---

## Product Boundary

This phase is Ascend only. Flow is invisible.

Flow should never be marketed during this phase.

Flow exists only to:
- Capture leads
- Store attribution
- Run nurture
- Manage lifecycle
- Track conversions
- Trigger onboarding

Customers buy Ascend. Not Flow.

---

## Primary Objective

Transform the Growth Report into a personalized product demonstration.

Every recommendation should naturally answer: **"What can Ascend help me do next?"**

Never present generic upgrade banners. Never interrupt the customer. Never ask for payment before demonstrating value.

---

## Sales Experience Framework

Every major finding should follow this progression:

```
Current Finding
  ↓
Why This Matters
  ↓
What Ascend Can Do
  ↓
Live Preview
  ↓
Expected Outcome
  ↓
Continue Inside Ascend
```

Never:

```
Finding
  ↓
Upgrade Now
```

### Example

**Finding:** Your website is losing visitors because there is no structured follow-up.

**Why It Matters:** Most businesses lose over 90% of visitors after they leave. Without follow-up, marketing becomes increasingly expensive because you're constantly replacing lost opportunities.

**What Ascend Can Build:** Ascend can generate email nurture sequences, lead magnets, landing page messaging, offer positioning, lead capture strategy, growth roadmap.

**Preview:** Show the first email, lead magnet title, landing page hero, offer statement, roadmap summary. Use real business context whenever possible. **Never fabricate examples.**

**CTA:** "Continue Building Inside Ascend" / "Start My Trial" / "Build My Growth Plan"

Avoid: "Upgrade" / "Buy Now" / "Unlock Premium"

The CTA should feel like the natural continuation of the report.

---

## Feature Demonstration Engine

Every Growth Scan category should have associated Ascend capabilities, previewed (not just described):

| Category | Preview |
|---|---|
| Marketing | Landing page copy, lead magnet, offer messaging, email sequence, content strategy |
| SEO | Content calendar, topic clusters, authority roadmap, optimization priorities |
| Conversion | Landing page redesign, CTA improvements, page hierarchy, trust strategy, offer improvements |
| Sales | Offer positioning, value proposition, sales messaging, customer journey |
| Operations | 90-day roadmap, priority planner, strategic recommendations, Growth Timeline |
| Brand | Messaging framework, positioning, differentiation, brand voice |

Each preview should **demonstrate** capability. Not simply describe it.

---

## Asset Preview System

Whenever appropriate, show previews of: landing pages, email campaigns, lead magnets, ads, website copy, sales pages, funnels, business roadmap, Growth Timeline, Business Memory, recommendations, blueprints, action plans.

Customers should begin experiencing Ascend before starting a trial.

---

## The 90-Day Growth Roadmap

Every report should conclude with a personalized roadmap.

**Month One:** Clarify messaging, improve homepage, create lead magnet, launch nurture strategy.

**Month Two:** Improve conversion, optimize SEO, publish authority content, expand lead generation.

**Month Three:** Scale acquisition, increase lifetime value, improve retention, create automation opportunities.

The roadmap creates momentum. The CTA becomes: **"Continue Building Month One Inside Ascend."**

---

## Product Demonstration Rules

Do not show every premium feature. Only demonstrate features relevant to the customer's findings.

- If Marketing scored well → don't sell Marketing assets.
- If SEO scored poorly → lead with SEO.
- If Conversion is weak → lead with conversion.

Everything should feel contextual.

---

## Trial Experience

The trial should continue exactly where the report stopped. Never restart the journey.

When the user enters Ascend they should immediately see: their scan, their roadmap, their priorities, their recommendations, their generated assets, their Growth Timeline.

Nothing should feel disconnected.

---

## Conversion Principles

Always educate before selling. Always demonstrate before asking. Always personalize before promoting.

Every CTA should answer: **"Why should this customer continue?"**

If the answer is weak, do not show the CTA.

---

## Lead Lifecycle (Internal Only)

Flow manages the customer lifecycle. Customers should never need to understand this architecture.

```
Growth Scan
  ↓
Lead Created
  ↓
Affiliate Stored
  ↓
UTMs Stored
  ↓
Source Stored
  ↓
Trial Started
  ↓
Email Sequence
  ↓
Behavior Tracking
  ↓
Subscription
  ↓
Onboarding
```

Flow remains invisible.

---

## Affiliate Readiness

The Growth Experience must preserve: referral source, affiliate ID, UTMs, campaign, ad group, keyword, landing page, trial attribution, subscription attribution, future commission attribution.

**Do not build affiliate dashboards during this task.** Simply preserve attribution throughout the customer journey.

---

## Analytics

Instrument the complete funnel. Track: Growth Scan starts, Growth Scan completions, report views, time on report, section engagement, feature preview views, feature preview clicks, CTA clicks, trial starts, trial completion, subscription conversion, revenue, affiliate source, traffic source, campaign, keyword, landing page, industry, business type, growth score, primary bottleneck, conversion by bottleneck, conversion by industry, conversion by score.

Everything should become measurable.

---

## User Experience Principles

The report should feel: premium, consultative, personalized, helpful, professional, strategic.

Never: salesy, pushy, generic, AI-generated, template-driven, banner-heavy.

Customers should forget they're reading software. It should feel like a consultant reviewing their business.

---

## Future State Visualization

Do not only show current problems. Show the future business.

```
Current
  ↓
Potential
  ↓
Roadmap
  ↓
Ascend
```

People buy the future. Not the diagnosis.

---

## Engineering Principles

**Before writing code:**
- Audit the current report architecture
- Audit trial onboarding
- Audit entitlements
- Audit Asset Studio
- Audit analytics
- Audit CTA components
- Audit Flow lifecycle integration

Reuse existing infrastructure. Do not create parallel systems.

**Spend 80% understanding the architecture. 20% implementing.** (Same discipline as [DIVINEX_V1_NORTH_STAR.md](DIVINEX_V1_NORTH_STAR.md).)

---

## Testing

Certify: desktop, tablet, mobile, report rendering, trial transition, generated previews, tracking, affiliate attribution, lead capture, email lifecycle, repeat visits, returning users, subscription conversion.

No broken states.

---

## Deliverables

Provide: architecture plan, reuse analysis, files changed, components reused, analytics events added, CTA locations, preview components added, trial journey updates, Flow lifecycle verification, attribution verification, testing evidence, screenshots, remaining gaps, production recommendation.

---

## Definition of Done

A customer should complete a free Growth Scan and think:

> "This platform already understands my business better than anyone else I've talked to."

The report should naturally transition into: **"Let's keep building."**

The customer should want to continue because they've already experienced the value — not because they encountered another paywall.

---

## Final Mandate

The Growth Scan is no longer just a diagnostic report. It becomes Ascend's primary salesperson.

Every recommendation should educate. Every preview should inspire. Every CTA should feel like the obvious next step.

The objective is not to maximize clicks. The objective is to maximize confidence.

When customers begin their trial, they should already believe Ascend is the strategic partner that will help them grow their business.

---

## Process note — how this gets executed

Per the user's own explicit recommendation attached to this spec (2026-08-11): the first deliverable against this document is an **audit of the current Growth Scan report architecture + wireframes for the new sales experience** — not code. That audit/wireframe pass gets its own dedicated Explore-then-Plan cycle and user approval checkpoint before any implementation starts, matching how every other major feature this project ships gets scoped. It is sequenced behind the in-flight work already committed to at the time this spec landed (digital product delivery, DivineX Reconnect Series) rather than interrupting them mid-build.
