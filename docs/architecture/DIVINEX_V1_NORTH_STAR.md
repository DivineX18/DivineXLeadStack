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
