/**
 * Build-Campaign Orchestrator — the Campaign Plan (Conversion Engine, P1 —
 * Milestone 6a).
 *
 * The deterministic heart of the mandate's Phase 9 "Build Campaign": take ONE
 * Campaign Strategy and derive the entire coherent campaign as an inspectable
 * blueprint — landing page, form, thank-you, email sequence, CRM pipeline +
 * tags, automation workflow, and tracking plan — all message-matched from the
 * same strategy. This is the PLAN, not the build: no funnel/form/workflow doc
 * is created here (that's M6b, the execution wiring that maps each planned
 * piece onto create_funnel / forms / the workflow engine). Planning first,
 * deterministically, means the whole campaign can be reasoned about + tested
 * before anything touches a live system, and the operator can inspect/edit it
 * before publish.
 *
 * Pure — no LLM, no Firestore, no side effects. Reuses the real primitives it
 * plans against (FUNNEL_FRAMEWORKS for the page sequence, the workflow node +
 * trigger types, the canonical pipeline stages) so the plan can never
 * reference a section/node/trigger the platform doesn't actually have.
 */

import type { CampaignStrategy, CampaignObjective } from "@/types/conversion";
import type { FunnelGenre, FunnelSectionType } from "@/types/funnels";
import type { WorkflowNodeType, WorkflowTriggerType } from "@/types/workflows";
import { FUNNEL_FRAMEWORKS } from "@/lib/funnels/frameworks";

export const CAMPAIGN_PLAN_VERSION = "1.0.0";

export interface PlannedLandingPage {
  genre: FunnelGenre;
  sectionSequence: FunnelSectionType[];
  frameworkStack: string[];
  centralPromise: string | null;
  ctaStrategy: string | null;
}
export interface PlannedForm {
  fields: string[];
  conversionEvent: string | null;
}
export interface PlannedThankYou {
  /** What actually happens next for the visitor — the real next step, not filler. */
  nextStep: string;
}
export interface PlannedEmail {
  order: number;
  purpose: string;
  recipientState: string;
  /** Human timing, e.g. "immediate", "day 2", "1 hour before". */
  delay: string;
  primaryIdea: string;
  cta: string;
}
export interface PlannedEmailSequence {
  archetype: string;
  frameworkId: string; // always "post-conversion-sequence-design"
  /** The convert-and-stop transition, so no one is stuck in the wrong sequence. */
  stopCondition: string;
  emails: PlannedEmail[];
}
export interface PlannedCrm {
  pipelineStages: string[];
  tags: string[];
}
export interface PlannedWorkflow {
  trigger: WorkflowTriggerType;
  nodes: { type: WorkflowNodeType; note: string }[];
}
export interface PlannedTracking {
  events: string[];
  preserveParams: string[];
}
export interface CampaignPlan {
  version: string;
  strategyRef: { pageType: string | null; objective: CampaignObjective | null; priced: boolean };
  landingPage: PlannedLandingPage;
  form: PlannedForm;
  thankYou: PlannedThankYou;
  emailSequence: PlannedEmailSequence;
  crm: PlannedCrm;
  workflow: PlannedWorkflow;
  tracking: PlannedTracking;
  /** The one promise the whole campaign carries, applied to every asset. */
  messageMatch: { centralPromise: string | null; note: string };
  /** Carried from the strategy — what every asset must write AROUND, not invent. */
  unknowns: string[];
}

// Canonical 6-stage pipeline (New → Contacted → Qualified → Proposal → Won / Lost).
const STAGE = { NEW: "New", CONTACTED: "Contacted", QUALIFIED: "Qualified", PROPOSAL: "Proposal", WON: "Won" } as const;

const BASE_TRACKING = [
  "landing_page_view", "landing_page_cta_clicked", "form_started", "form_submitted",
  "lead_created", "email_delivered", "email_opened", "email_clicked", "unsubscribe",
];
const PRESERVE_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "landing_page", "referrer"];

function formFieldsFor(objective: CampaignObjective | null): string[] {
  switch (objective) {
    case "appointment":
    case "consultation":
      return ["name", "email", "phone"];
    case "application":
      return ["name", "email", "phone", "company", "message"];
    case "webinar_registration":
    case "event_registration":
      return ["name", "email"];
    case "free_trial":
    case "purchase":
      return ["name", "email"]; // checkout collects the rest
    case "audit_request":
      return ["name", "email", "website"];
    default:
      return ["name", "email"];
  }
}

function triggerFor(objective: CampaignObjective | null): WorkflowTriggerType {
  return objective === "appointment" || objective === "consultation" ? "booking.created" : "form.submitted";
}

function conversionEventFor(objective: CampaignObjective | null): string {
  switch (objective) {
    case "appointment":
    case "consultation":
      return "booking_completed";
    case "free_trial":
      return "trial_started";
    case "purchase":
      return "purchase_completed";
    case "application":
      return "application_submitted";
    default:
      return "form_submitted";
  }
}

function crmStagesFor(objective: CampaignObjective | null): string[] {
  switch (objective) {
    case "appointment":
    case "consultation":
      return [STAGE.NEW, STAGE.CONTACTED, STAGE.QUALIFIED];
    case "application":
      return [STAGE.NEW, STAGE.QUALIFIED];
    case "purchase":
      return [STAGE.NEW, STAGE.WON];
    case "free_trial":
      return [STAGE.NEW, STAGE.CONTACTED, STAGE.QUALIFIED];
    default:
      return [STAGE.NEW, STAGE.CONTACTED];
  }
}

function trackingFor(objective: CampaignObjective | null): string[] {
  const extra: string[] = [];
  if (objective === "appointment" || objective === "consultation") extra.push("booking_started", "booking_completed");
  if (objective === "purchase") extra.push("checkout_started", "purchase_completed");
  if (objective === "free_trial") extra.push("trial_started");
  return [...BASE_TRACKING, ...extra];
}

/** The email-sequence outline per objective — length + timing set by the ask,
 *  each email advancing the conversation (post-conversion-sequence-design). */
function emailSequenceFor(objective: CampaignObjective | null): { archetype: string; stopCondition: string; emails: PlannedEmail[] } {
  const e = (order: number, purpose: string, recipientState: string, delay: string, primaryIdea: string, cta: string): PlannedEmail =>
    ({ order, purpose, recipientState, delay, primaryIdea, cta });
  switch (objective) {
    case "appointment":
    case "consultation":
      return {
        archetype: "appointment nurture (short, no-show-reducing)",
        stopCondition: "Stop the reminder sequence once the appointment is attended; branch to a no-show flow if missed.",
        emails: [
          e(1, "Confirm + set expectations", "just booked", "immediate", "Booking confirmed — here's what to expect and how to prepare.", "Add to calendar"),
          e(2, "Reduce no-show + pre-frame value", "booked, day before", "1 day before", "A quick reminder + the one thing to have ready so the call is worth it.", "Confirm you're coming"),
          e(3, "Same-day nudge", "booked, day of", "1 hour before", "See you soon — here's the link/details.", "Join / directions"),
        ],
      };
    case "free_trial":
      return {
        archetype: "trial onboarding (activation-paced)",
        stopCondition: "Stop pre-trial nurture on trial start; stop the conversion push the moment they upgrade.",
        emails: [
          e(1, "Welcome + first action", "trial started", "immediate", "You're in — do this one thing first to get value fast.", "Take the first step"),
          e(2, "Drive activation", "trial, not yet activated", "day 1", "The fastest path to your first real result inside the trial.", "Set it up"),
          e(3, "Show the outcome", "activated", "day 4", "Here's what you can now do that you couldn't before.", "See your results"),
          e(4, "Handle the objection", "mid-trial", "day 8", "The most common reason people hesitate — and the honest answer.", "Keep going"),
          e(5, "Convert before expiry", "trial ending", "day 12", "Your trial ends soon — keep everything you've built.", "Upgrade now"),
        ],
      };
    case "purchase":
      return {
        archetype: "post-purchase onboarding",
        stopCondition: "Stop the sales sequence on purchase; start onboarding.",
        emails: [
          e(1, "Receipt + reassure", "just purchased", "immediate", "Thanks — here's your access and what happens next.", "Get started"),
          e(2, "First win", "new customer", "day 1", "Do this first to get value from what you bought.", "Start here"),
          e(3, "Next step / cross-sell", "onboarded", "day 5", "Now that you're set up, here's the natural next step.", "See what's next"),
        ],
      };
    case "application":
      return {
        archetype: "application review nurture",
        stopCondition: "Stop once a call is booked or the applicant is disqualified.",
        emails: [
          e(1, "Confirm receipt + next step", "applied", "immediate", "Got your application — here's what happens next and when.", "Book your call"),
          e(2, "Pre-frame + qualify", "under review", "day 1", "What we look for, so the call is a fit for both of us.", "Book your call"),
          e(3, "Follow up on no-book", "applied, no call booked", "day 3", "Still want to move forward? Grab a time here.", "Book your call"),
        ],
      };
    case "audit_request":
      return {
        archetype: "audit delivery + education",
        stopCondition: "Stop once a call is booked or the offer is taken.",
        emails: [
          e(1, "Confirm + set delivery expectation", "requested audit", "immediate", "Your audit is on the way — here's when to expect it.", "What to prepare"),
          e(2, "Deliver + explain", "audit delivered", "on delivery", "Your results, and the single biggest opportunity we found.", "See the opportunity"),
          e(3, "Turn insight into action", "reviewed audit", "day 2", "How to actually fix the #1 issue — and how we can help.", "Book a call"),
        ],
      };
    default: // lead_generation / donation / event fallback
      return {
        archetype: "lead nurture (value → mechanism → offer)",
        stopCondition: "Stop on conversion (booked / purchased / replied); stop all marketing on unsubscribe.",
        emails: [
          e(1, "Deliver the promised value", "new lead", "immediate", "Here's what you asked for — plus the fastest way to use it.", "Get it now"),
          e(2, "Educate on the problem", "engaged lead", "day 2", "Why the obvious fix usually fails, and what to do instead.", "Learn more"),
          e(3, "Reveal the mechanism", "warming lead", "day 4", "The specific approach that actually moves the needle here.", "See how it works"),
          e(4, "Handle the top objection", "considering", "day 6", "The main reason people hesitate — answered honestly.", "Take the next step"),
          e(5, "Make the offer", "ready", "day 8", "If you want help doing this, here's the offer and the next step.", "Get started"),
        ],
      };
  }
}

function workflowNodesFor(objective: CampaignObjective | null, seq: PlannedEmail[]): { type: WorkflowNodeType; note: string }[] {
  const nodes: { type: WorkflowNodeType; note: string }[] = [];
  nodes.push({ type: "add_tag", note: "Tag the contact with the campaign tag + source (drives audiences + reporting)." });
  const midStage = crmStagesFor(objective)[1] ?? STAGE.CONTACTED;
  nodes.push({ type: "move_stage", note: `Move the contact to "${midStage}".` });
  seq.forEach((email, i) => {
    if (i > 0) nodes.push({ type: "wait", note: `Wait until ${email.delay}.` });
    nodes.push({ type: "send_email", note: `Email ${email.order}: ${email.purpose}.` });
    // After the value/activation emails, check whether they've already
    // converted — if so, stop the sequence (convert-and-stop).
    if (i === Math.min(1, seq.length - 1)) {
      nodes.push({ type: "if_else", note: `If the conversion goal (${conversionEventFor(objective)}) is met, exit the sequence.` });
    }
  });
  nodes.push({ type: "goal", note: `Goal: ${conversionEventFor(objective)} — reaching it stops the campaign so a converted contact is never sold to again.` });
  return nodes;
}

/** Build the full deterministic campaign blueprint from a strategy. */
export function buildCampaignPlan(strategy: CampaignStrategy): CampaignPlan {
  const objective = strategy.context.objective;
  const genre = (strategy.derived.pageType as FunnelGenre) || "lead_gen";
  const priced = typeof strategy.offer.priceCents === "number" && strategy.offer.priceCents > 0;
  const sectionSequence = (FUNNEL_FRAMEWORKS[genre] ?? FUNNEL_FRAMEWORKS.lead_gen).map((s) => s.section);
  const seq = emailSequenceFor(objective);

  return {
    version: CAMPAIGN_PLAN_VERSION,
    strategyRef: { pageType: strategy.derived.pageType, objective, priced },
    landingPage: {
      genre,
      sectionSequence,
      frameworkStack: strategy.derived.frameworkStack,
      centralPromise: strategy.derived.centralPromise,
      ctaStrategy: strategy.derived.ctaStrategy,
    },
    form: {
      fields: formFieldsFor(objective),
      conversionEvent: conversionEventFor(objective),
    },
    thankYou: {
      nextStep: strategy.derived.followUpStrategy ?? "Confirm capture, set expectations, and hand off to the email sequence.",
    },
    emailSequence: {
      archetype: seq.archetype,
      frameworkId: "post-conversion-sequence-design",
      stopCondition: seq.stopCondition,
      emails: seq.emails,
    },
    crm: {
      pipelineStages: crmStagesFor(objective),
      tags: ["campaign", objective ? `objective:${objective}` : "objective:unspecified"],
    },
    workflow: {
      trigger: triggerFor(objective),
      nodes: workflowNodesFor(objective, seq.emails),
    },
    tracking: {
      events: trackingFor(objective),
      preserveParams: PRESERVE_PARAMS,
    },
    messageMatch: {
      centralPromise: strategy.derived.centralPromise,
      note: strategy.derived.centralPromise
        ? "Every asset restates this one promise — ad, page, form, thank-you, and emails must not drift."
        : "Central promise not yet set (AI-enrichment fills it) — all assets must still share ONE promise once written.",
    },
    unknowns: strategy.unknowns,
  };
}
