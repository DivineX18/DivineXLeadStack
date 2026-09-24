import type { FunnelSectionType, FunnelSectionConfig } from "@/types/funnels";
import type { FunnelTemplate } from "./templates";

/**
 * STARTER CONTENT FOR AUTHORED TEMPLATES — AND ONLY FOR THEM.
 *
 * Two rules that sound alike and are not:
 *
 *   A GENERATED PAGE must never invent content to fill a section, because
 *   anything it writes is a claim about a real business it cannot verify.
 *   `section-completeness.ts` is right: there, the remedy for an empty
 *   section is to OMIT it.
 *
 *   AN AUTHORED TEMPLATE has the opposite duty. A template exists so a
 *   non-designer does not have to invent the page architecture. Shipping it
 *   with every section empty means shipping the architecture and hiding it:
 *   empty sections render null, so "Emergency callout" published as a hero, a
 *   price-less offer card and a "Ready? / Get started" banner.
 *
 * So this module is wired into the from-template route ONLY. The generation
 * path does not import it and its behaviour is unchanged.
 *
 * WHAT MAY BE WRITTEN HERE. Prompts and structure — the shape of a good page
 * with the business's own words still to be filled in. What may NOT be
 * written here is anything that could be mistaken for a fact about the
 * business: no testimonial that reads like a real quote, no rating, no client
 * count, no certification, no guarantee terms, no price. Every placeholder
 * below is written so that publishing it unedited is obviously unfinished to
 * the operator rather than quietly false to a visitor — which is why the
 * proof placeholders say "Paste a real customer quote here" instead of
 * inventing a plausible one.
 */

/** Sections whose emptiness is the point: a video with no URL, a countdown to
 *  a date nobody chose, a checkout with no price. Left exactly as they were. */
const LEAVE_EMPTY: ReadonlySet<FunnelSectionType> = new Set([
  "video", "countdown", "checkout", "upsell_offer", "image_text",
  "photo_gallery", "multi_step_form", "ticket_tiers", "stats", "team",
]);

/** True when the template sells an urgent, call-first local service. Those
 *  pages answer "can you come today" before they answer anything else. */
function isUrgentLocal(t: FunnelTemplate): boolean {
  return /emergency|callout|urgent|same.day/i.test(`${t.id} ${t.name} ${t.headline}`);
}

/** True for templates whose whole job is an opt-in rather than a sale. */
function isLeadMagnet(t: FunnelTemplate): boolean {
  return t.genre === "lead_magnet";
}

/**
 * Starter config for one section of one template, or null to leave the
 * existing default untouched.
 */
export function starterConfigFor(
  type: FunnelSectionType,
  template: FunnelTemplate,
): Partial<FunnelSectionConfig> | null {
  if (LEAVE_EMPTY.has(type)) return null;
  const urgent = isUrgentLocal(template);
  const magnet = isLeadMagnet(template);

  switch (type) {
    case "problem_solution":
      return {
        problemHeadline: urgent ? "When it goes wrong, it cannot wait" : "The problem your customer has right now",
        problemText: "Describe the situation your customer is in before they call you. Use their words, not your industry's.",
        solutionHeadline: "How you fix it",
        solutionText: "Say plainly what you do about it and what changes for them afterwards.",
      };

    case "benefits_grid":
      return {
        items: [
          { title: "Name the first outcome", description: "One sentence on what the customer gets, not what you do." },
          { title: "Name the second outcome", description: "Pick the thing competitors in your area do not offer." },
          { title: "Name the third outcome", description: "Something concrete: a timeframe, a guarantee you really offer, a process." },
        ],
      };

    case "included":
      return {
        items: [
          { title: "What's included, item one", description: "Replace with a real deliverable." },
          { title: "What's included, item two", description: "Replace with a real deliverable." },
          { title: "What's included, item three", description: "Replace with a real deliverable." },
        ],
      };

    case "value_stack":
      return {
        items: [
          { title: "Main deliverable", description: "What they get first." },
          { title: "Supporting deliverable", description: "What makes the first one work." },
          { title: "Bonus or extra", description: "Only if you genuinely offer one." },
        ],
      };

    case "agenda":
      return {
        days: urgent
          ? [{ label: "How it works", title: "Three steps", bullets: ["You call", "We confirm a time window", "We arrive and fix it"] }]
          : [{ label: "Step 1", title: "What happens first", bullets: ["Replace with the first thing you do"] },
             { label: "Step 2", title: "What happens next", bullets: ["Replace with the second step"] },
             { label: "Step 3", title: "How it finishes", bullets: ["Replace with the outcome"] }],
      };

    case "faq":
      return {
        items: urgent
          ? [{ question: "How quickly can you get here?", answer: "Replace with your real response time." },
             { question: "Which areas do you cover?", answer: "List the suburbs, towns or postcodes you actually serve." },
             { question: "Do you charge a call-out fee?", answer: "Replace with your real pricing policy." },
             { question: "Are you available after hours?", answer: "Replace with your real hours." }]
          : magnet
          ? [{ question: "What exactly do I get?", answer: "Describe the thing they are downloading." },
             { question: "How will you use my email?", answer: "Replace with your real policy." },
             { question: "Is it really free?", answer: "Answer plainly." }]
          : [{ question: "How much does it cost?", answer: "Replace with your real pricing or how you quote." },
             { question: "How long does it take?", answer: "Replace with a real timeframe." },
             { question: "What happens after I get in touch?", answer: "Describe the first thing that happens." },
             { question: "What if it isn't right for me?", answer: "Answer honestly. Do not invent a guarantee." }],
      };

    // PROOF IS STRUCTURE ONLY. These read as instructions, never as a quote,
    // so an unedited page is obviously a draft rather than quietly dishonest.
    case "testimonials":
      return {
        items: [
          { quote: "Paste a real customer quote here. Do not write one on their behalf.", name: "Customer name", detail: "Where they are, or what you did for them" },
          { quote: "A second real quote, ideally naming a specific result.", name: "Customer name", detail: "Optional detail" },
        ],
      };

    case "guarantee":
      return {
        headline: "Your reassurance goes here",
        bodyText: "State a promise you actually keep. If you do not offer a guarantee, delete this section rather than inventing one.",
      };

    case "callout":
      return { text: urgent ? "Add the one line a worried customer needs to read first." : "Add a single line worth interrupting the page for." };

    case "story":
      return {
        byline: "Why this works",
        paragraphs: ["Replace with the short version of how you got here and why you do it this way."],
      };

    case "before_after":
      return {
        beforeItems: ["What their situation looks like now", "A second frustration they recognise", "A third"],
        afterItems: ["What it looks like once you have helped", "A second improvement", "A third"],
      };

    case "offer":
      return {
        headline: magnet ? "Get the guide" : urgent ? "Request a callout" : "Get started",
        bullets: ["Replace with what they get", "And a second thing", "And a third"],
      };

    case "cta_banner":
      // "Ready? / Get started" is the single most template-looking thing on
      // the published page, and it was on 22 of 24.
      return {
        headline: urgent ? "Need someone out today?" : magnet ? "Want the guide?" : "Ready to get started?",
        ctaLabel: urgent ? "Call now" : magnet ? "Send it to me" : "Get in touch",
      };

    case "business_footer":
      return { businessName: "Your business name" };

    // proof_strip and trust_badges stay EMPTY on purpose: a logo row or a
    // badge is a claim in itself, and there is no way to write a placeholder
    // logo that is not either invisible or a fake credential.
    case "proof_strip":
    case "trust_badges":
      return null;

    default:
      return null;
  }
}
