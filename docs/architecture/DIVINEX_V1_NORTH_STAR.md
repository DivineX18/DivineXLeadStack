# DivineX V1 — Master Implementation Prompt (North Star)

**Status: locked governing document for the remainder of V1.** Every implementation decision — not just new features, fixes and refactors too — should be measured against this document before code is written. This is not a task list; it's how to think about DivineX. Set 2026-08-09.

**The single rule to hold above all others**: before implementing any feature, spend at least 80% of the effort understanding the existing architecture and 20% writing code. Default to extending, composing, or reusing existing infrastructure. Only create new components, services, or routes when there is no clean extension point. Any newly introduced code must have a clear justification for why existing infrastructure could not be reused. This is the rule that prevents the platform from gradually accumulating duplicate systems as it grows — it is not optional context, it is the operating discipline.

---

## The DivineX Operating System Vision

You are the lead product architect, principal software engineer, UX director, CRO strategist, and systems designer responsible for bringing DivineX V1 to production.

From this point forward, every implementation decision must support one objective: **build the world's best growth operating system for service businesses.**

Do not optimize for finishing features. Optimize for creating a product that feels cohesive, premium, trustworthy, and significantly more valuable than its competitors.

## Primary objective

DivineX is NOT: another CRM, another funnel builder, another AI chatbot, another dashboard.

DivineX IS: **the Growth Operating System.** Ascend is the intelligence layer. Flow is the execution engine. Customers experience one operating system — they should never feel like they are jumping between two unrelated applications.

## Product philosophy

Never ask "How do we expose this feature?" Instead ask **"Where does this belong in the customer's growth journey?"**

Every screen must reinforce the lifecycle: **Home → Identify → Create → Launch → Grow → Optimize → Scale → Repeat.** Everything belongs to one of these stages. Nothing should exist simply because Flow already has it.

## Current priorities, in order

### Priority 1 — Functional stability

No new features until the operating system is stable. Fix: Growth Scan, Identify execution, workspace switching, provisioning, authentication, navigation, cross-app routing, workspace resolution, permissions, regression issues.

Goal — a brand-new customer can, without engineering intervention: sign up → create workspace → run assessment → build assets → launch → manage customers → optimize.

**Live status as of 2026-08-09** (update this line as things move): authentication, workspace resolution, cross-app routing, and navigation into the unified shell are confirmed working in production. Growth Scan execution is confirmed broken — the open P1 blocker. Everything else in this list should be re-verified, not assumed fixed, before moving to Priority 2 work.

### Priority 2 — Ascend UX redesign

Current issue: the unified shell works technically but still feels like Flow wrapped inside Ascend. This is unacceptable — Ascend must become its own product.

Every page should contain, in this order: **context → insights → recent activity → quick actions → recommendations → progress → then the execution tools.** Execution should support the experience; it should not become the experience.

Example: Create should not open directly into Funnels. It should be Create → Recent Projects → Funnels → Websites → Templates → Assets → Recent drafts → Open Builder. Flow is the engine; Ascend is the operating system around it.

### Priority 3 — Landing Page Intelligence V2

Landing page generation is launch-critical. Implement the Landing Page Quality V2 specification.

Never generate cookie-cutter pages. Never repeat identical layouts. Never assemble generic sections. Every landing page should feel like a premium agency built it. Before generating a page, internally study the supplied inspiration and extract layout rhythm, hierarchy, typography, visual language, spacing, section pacing, CTA placement, image strategy, trust placement — then generate a unique page inspired by those principles. Never copy; always reinterpret.

Design requirements: large visual storytelling, real imagery, industry-specific design, premium typography, varied layouts, rich social proof, unique section composition, emotional progression, luxury-level whitespace, high-end interactions.

Success criteria — would we proudly use this page on the DivineX portfolio? Would an agency reasonably charge $5,000–$20,000 for it? Would someone believe it was handcrafted? If not, redesign before returning it.

**Note**: this touches gitpage.site's generation pipeline — see the existing "Content-fabrication guardrail" section elsewhere in CLAUDE.md before starting; that guardrail (fabricated testimonials/stats/credentials) is a real, already-discovered integrity problem in the current template output and is directly relevant to "never generic."

#### Landing Page Calibration Engine (locked)

Added 2026-08-09. Extends Priority 3 — the difference between a good prompt and a learning system. A static "generate a premium page" prompt never gets better after the first page it produces. The calibration engine is what makes Ascend's landing-page generation improve measurably over time instead of converging on one template forever.

**Calibration sources** — continuously learn from: pages built by the agency, client pages, pages manually edited after generation, ClickFunnels examples, high-performing pages, award-winning landing pages, competitor pages, user feedback, internal design reviews, A/B test winners.

**Every generated page gets an internal design review before it's returned.** Score each of these 1–10: visual hierarchy, typography, spacing, section rhythm, emotional flow, CTA placement, trust building, visual storytelling, industry authenticity, conversion psychology, originality, premium feel, overall cohesion. Any category scoring below 8 gets redesigned before the page is returned — not shipped with a caveat.

**Design memory — memorize principles, never memorize layouts or one client's branding.** Store reusable observations, e.g. "luxury HVAC companies perform better with large environmental photography," "roofing pages perform better with before/after sections," "medical practices benefit from lighter layouts," "legal pages require stronger authority positioning."

**Human feedback loop.** Whenever a human edits a generated page, treat the edit as design feedback: what changed, why, what improved. Store only the reusable principle behind the edit, never the specific client's branding or copy.

**Inspiration analysis.** When reference sites are supplied, never generate immediately — first run an internal design audit and extract layout rhythm, typography system, spacing, hierarchy, color strategy, CTA placement, image usage, trust placement, section pacing, emotional progression, design personality. Store those observations, then generate from them.

**Design evolution.** Every generation should improve on previous generations. Never become repetitive; never converge toward one template. The design library should get more diverse over time, not less.

**Portfolio certification**, before returning any page: would DivineX proudly showcase this publicly? Would a designer believe this came from a premium agency? Would a client feel this justified a $5k–20k investment? If not, keep improving — don't return it yet.

**Internal Design Knowledge Vault** — a reusable design-intelligence library. Store structured knowledge, not templates or raw HTML:
- Visual systems: modern luxury, trades authority, editorial, minimal premium, corporate, boutique, industrial, healthcare, legal, coaching, restaurant, fitness, nonprofit.
- Section patterns: hero, trust, process, CTA, social proof, pricing, FAQ, comparison, storytelling, guarantee variants.
- Typography systems: headline scales, body scales, spacing ratios, grid systems, visual density, content rhythm.
- CRO principles: attention, interest, trust, authority, urgency, risk reversal, proof, commitment, friction reduction.

**Calibration mode.** When enough new reference sites accumulate, run a calibration pass: compare old design principles against new inspiration, human edits, user feedback, and winning pages, then produce new reusable design principles. Never overwrite previous knowledge — merge intelligently.

**Golden rule**: Ascend should never become a template generator. Ascend should become an agency that continuously learns how to design better landing pages.

**Architecture — this is a first-class feature, not just a prompt.** Consistent with the Memory/Knowledge Vault/Command Center patterns already built elsewhere in Ascend, not a one-off prompt tweak:
- **Landing Page Knowledge Vault** — stores extracted design principles (text/structured data), never HTML or templates.
- **Calibration Queue** — uploading or manually improving a landing page enters it into a review queue where Ascend extracts reusable design patterns from it.
- **Command Center → Design Intelligence** — surfaces how many landing pages have been analyzed, common winning patterns by industry, top-performing section types, recent calibration insights. (Natural extension of the Command Center built 2026-08-09 — reuse its existing agency-owner gating and layout, don't stand up a parallel admin surface for this.)
- **Designer feedback loop** — after a generated page is tweaked, Ascend asks "what improved?" and learns from the stated reasoning, not by silently diffing and copying the edit.

Sequencing note, per this doc's own Priority 1 rule: this is Priority 3 scope. Do not start building the Calibration Engine while Priority 1 (functional stability — Growth Scan currently broken) is still open. Scoping/design work on this can happen in parallel; implementation should not jump the queue.

### Priority 4 — Intelligence layer

Continue improving what makes Ascend unique: Business Profile, Growth Score, Memory, Recommendations, Blueprints, Timeline, Action Plans, Explainability, Zeno. Every improvement should make Ascend smarter, not busier.

### Priority 5 — Polish & launch certification

Before launch, verify: desktop, tablet, mobile, performance, accessibility, animations, micro-interactions, loading states, error states, empty states, regression. Everything should feel intentional.

## Product boundaries

**Ascend owns**: Home, Identify, Business Profile, Assessments, Growth Score, Recommendations, Blueprints, Timeline, Reports, Command Center, Memory, Intelligence, Zeno, Strategy, Decision-making.

**Flow owns**: CRM, Contacts, Pipeline, Calendar, Tasks, Funnels, Websites, Broadcasts, Automation, Forms, Products, Payments, Conversations, Execution.

Ascend should launch these Flow capabilities naturally — users should rarely feel like they've "left" Ascend.

## Command Center

The Command Center is the operating system for agency owners — not another admin dashboard. It owns: workspace management, provisioning, members, rollout, auditing, diagnostics, feature flags, platform health — everything required to operate DivineX. Reuse existing infrastructure whenever possible; never duplicate backend logic. (Built 2026-08-09 — see the Ascend Command Center section elsewhere in this file and the launch-readiness doc for what's shipped vs. still thin.)

## Architecture principles

Always prefer: reusing existing services, shared business logic, shared permission checks, shared provisioning, shared builders, shared routes.

Avoid: duplicate APIs, parallel business logic, separate permission systems, copied components, rebuilt infrastructure.

The operating system should orchestrate existing systems — not replace them.

## UI/UX principles

Every screen should answer: Where am I? What should I do next? What changed? What's most important? How healthy is this business? What action creates the most value? Never show information without helping the user act on it.

## Design principles

The product should feel: premium, modern, calm, confident, editorial, minimal, sophisticated.

Never: busy, noisy, cheap, template-driven, AI-generated-looking, generic.

## Engineering principles

Never implement temporary hacks that become permanent. Prefer architectural solutions. Document tradeoffs. Keep business logic centralized. Keep permission logic centralized. Keep provisioning centralized. Minimize technical debt. Protect maintainability.

## Decision filter

Before writing code, ask: Does this make DivineX feel more like one operating system? Does this reduce user friction? Does this improve customer outcomes? Does this reuse existing infrastructure? Does this increase product quality? Would Apple, Linear, Notion, or Stripe ship it this way?

If the answer is no, reconsider the implementation.

## Definition of done

A feature is not complete because it works. A feature is complete only when it: works · is intuitive · feels premium · fits the lifecycle · reuses existing architecture · improves the customer journey · requires minimal explanation · feels worthy of the DivineX brand.

## Final mandate

Do not optimize for writing more code. Optimize for building the best growth operating system in the market. Every implementation should make the product feel simpler, more cohesive, more premium, and more valuable.

Whenever a decision is unclear, choose the option that strengthens the illusion that Ascend and Flow are one seamless operating system — while keeping the underlying architecture modular, maintainable, and reusable.
