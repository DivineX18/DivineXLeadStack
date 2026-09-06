import type { DesignPackId } from "@/lib/funnels/design-packs";
import type { DecisionComplexity, FunnelDepth } from "@/lib/funnels/frameworks";
import type { FunnelGenre } from "@/types/funnels";

/**
 * TEMPLATE LIBRARY (V1).
 *
 * A template is a NAMED, CURATED PAIRING of things this codebase already
 * builds and already certifies: a conversion framework (structure) and a
 * design pack (visual system), aimed at one real use case.
 *
 * That is the whole design, and it is deliberate. Hand-authoring 25 pages
 * would have produced 25 artifacts that publish, adapt to brand and stay
 * editable only if someone remembered to make them so. Composed this way,
 * every template is an ORDINARY FUNNEL from the moment it is created: it
 * renders through the same renderer, obeys the same publish boundary, passes
 * through the same Critic, and is edited in the same builder. Nothing about it
 * is special-cased, so nothing about it can rot separately.
 *
 * VARIATION IS STRUCTURAL, NOT COSMETIC. Seven frameworks give genuinely
 * different page architectures (a webinar registration page is not a
 * long-form VSL is not an application funnel); seven design packs give
 * genuinely different visual systems. The catalog below picks pairings that
 * suit each use case rather than shipping the same page in 25 colours.
 *
 * WHAT TEMPLATES DO NOT DO: they never carry testimonials, statistics,
 * credentials or logos. Those are claims about a business, and a template
 * cannot know them. Starter copy describes the OFFER SHAPE in the operator's
 * voice; the business's own facts arrive from its brand profile and from the
 * operator, and the imagery slots go through the existing Image Director,
 * which asks for a real photo rather than inventing one.
 */

export interface FunnelTemplate {
  id: string;
  /** What the operator picks it by. Names the OUTCOME, not the mechanism. */
  name: string;
  /** One line: who it is for and what it does. */
  description: string;
  /** Industries this suits — drives filtering and Zeno's selection. */
  industries: string[];
  genre: FunnelGenre;
  designPack: DesignPackId;
  depth?: FunnelDepth;
  complexity?: DecisionComplexity;
  /** Starter copy. Real sentences, not bracketed placeholders: an operator
   *  should be able to publish after editing, not after filling in blanks. */
  headline: string;
  subheadline: string;
  ctaLabel: string;
  /** Shown on the card so the structural difference is visible before
   *  choosing — the thing that makes this a library rather than a swatch. */
  structure: string;
}

export const FUNNEL_TEMPLATES: FunnelTemplate[] = [
  // ---------------------------------------------------------------- trades
  {
    id: "trades-quote-request",
    name: "Quote request",
    description: "For trades and home services who win work by quoting fast.",
    industries: ["Home services", "Trades", "Construction"],
    genre: "lead_gen",
    designPack: "local_business",
    headline: "Get a written quote this week",
    subheadline: "Tell us what you need and we'll come out, take a look, and put a price in writing.",
    ctaLabel: "Request my quote",
    structure: "Problem, how it works, proof, quote form",
  },
  {
    id: "trades-emergency-callout",
    name: "Emergency callout",
    description: "Urgent, phone-first page for after-hours and same-day work.",
    industries: ["Home services", "Trades", "Automotive"],
    genre: "lead_gen",
    designPack: "bold",
    depth: "lean",
    headline: "Need someone out today?",
    subheadline: "Call now and we'll tell you straight away whether we can get to you today.",
    ctaLabel: "Call now",
    structure: "One fold, call-first, service area, hours",
  },

  // ----------------------------------------------------------------- health
  {
    id: "dental-new-patient",
    name: "New patient offer",
    description: "Turns a first-visit offer into booked appointments.",
    industries: ["Dental", "Medical", "Allied health"],
    genre: "lead_gen",
    designPack: "wellness",
    headline: "New patient check-up and clean",
    subheadline: "A thorough first visit, an honest look at where things stand, and a plan you actually understand.",
    ctaLabel: "Book my first visit",
    structure: "Offer, what happens on the day, team, booking",
  },
  {
    id: "clinic-consultation",
    name: "Consultation booking",
    description: "For treatments people research before committing.",
    industries: ["Medical", "Cosmetic", "Allied health"],
    genre: "application",
    designPack: "premium",
    complexity: "high",
    headline: "Find out whether this is right for you",
    subheadline: "A private consultation, an honest assessment, and no pressure to go ahead.",
    ctaLabel: "Request a consultation",
    structure: "Qualification questions, expectations, consultation request",
  },

  // ---------------------------------------------------------------- fitness
  {
    id: "gym-trial",
    name: "Free trial week",
    description: "Trial offer for gyms and studios, built to fill a timetable.",
    industries: ["Fitness", "Gyms", "Studios"],
    genre: "lead_gen",
    designPack: "bold",
    headline: "Train free for a week",
    subheadline: "Come in, use everything, see whether you like it here. No card, no lock-in.",
    ctaLabel: "Claim my free week",
    structure: "Offer, what's included, timetable, signup",
  },
  {
    id: "coaching-transformation",
    name: "Transformation challenge",
    description: "A dated challenge with a start line, for programs that run in cohorts.",
    industries: ["Fitness", "Coaching", "Wellness"],
    genre: "challenge",
    designPack: "wellness",
    headline: "The six-week reset",
    subheadline: "A structured six weeks with a clear plan, weekly check-ins, and people doing it alongside you.",
    ctaLabel: "Join the next round",
    structure: "Challenge premise, week-by-week, who it's for, signup",
  },

  // --------------------------------------------------------------- coaching
  {
    id: "coach-strategy-call",
    name: "Strategy call",
    description: "Application-style page that filters before it books.",
    industries: ["Coaching", "Consulting", "Professional services"],
    genre: "application",
    designPack: "executive",
    complexity: "high",
    headline: "Book a strategy call",
    subheadline: "Thirty minutes on your situation, what's actually in the way, and what you'd do about it.",
    ctaLabel: "Apply for a call",
    structure: "Who it's for, what you'll leave with, qualification, application",
  },
  {
    id: "consultant-lead-magnet",
    name: "Guide download",
    description: "Trades a genuinely useful document for an email address.",
    industries: ["Consulting", "Professional services", "B2B"],
    genre: "lead_magnet",
    designPack: "classic",
    depth: "lean",
    headline: "The guide we send every new client",
    subheadline: "The same document we walk clients through in week one. Yours, free, no call required.",
    ctaLabel: "Send me the guide",
    structure: "One fold, what's inside, email capture",
  },

  // ------------------------------------------------------------ real estate
  {
    id: "realestate-appraisal",
    name: "Property appraisal",
    description: "For agents who win listings by valuing first.",
    industries: ["Real estate", "Property"],
    genre: "lead_gen",
    designPack: "premium",
    headline: "What is your property worth today?",
    subheadline: "A proper appraisal based on what is actually selling in your street, not an online estimate.",
    ctaLabel: "Book my appraisal",
    structure: "Offer, local market, process, appraisal request",
  },
  {
    id: "realestate-buyer-list",
    name: "Buyer waitlist",
    description: "Builds a list before a development or listing goes public.",
    industries: ["Real estate", "Property", "Developments"],
    genre: "lead_magnet",
    designPack: "executive",
    headline: "See it before it goes public",
    subheadline: "Join the list and you'll get the details, the pricing and first look before anyone else.",
    ctaLabel: "Join the list",
    structure: "One fold, the opportunity, waitlist form",
  },

  // ----------------------------------------------------------------- legal
  {
    id: "legal-case-review",
    name: "Case review",
    description: "Sober, credibility-first page for regulated professions.",
    industries: ["Legal", "Financial services", "Accounting"],
    genre: "lead_gen",
    designPack: "executive",
    complexity: "high",
    headline: "Talk to someone who has handled this before",
    subheadline: "A confidential first conversation about where you stand and what your options actually are.",
    ctaLabel: "Request a review",
    structure: "Situation, how we work, credentials, confidential enquiry",
  },
  {
    id: "finance-planning-session",
    name: "Planning session",
    description: "For advisers whose first meeting is the sale.",
    industries: ["Financial services", "Accounting", "Insurance"],
    genre: "application",
    designPack: "classic",
    complexity: "high",
    headline: "Get a plan you can actually follow",
    subheadline: "One session to map where you are now, what you're aiming at, and the gap between them.",
    ctaLabel: "Book a session",
    structure: "Who it suits, what happens, qualification, booking",
  },

  // ------------------------------------------------------------ beauty/spa
  {
    id: "medspa-treatment-offer",
    name: "Treatment offer",
    description: "A first-treatment offer designed to fill quiet weeks.",
    industries: ["Beauty", "Med spa", "Skincare"],
    genre: "tripwire",
    designPack: "premium",
    headline: "Your first treatment, at an introductory price",
    subheadline: "Come in once, see how your skin responds, and decide from there. No package required.",
    ctaLabel: "Book my treatment",
    structure: "Offer, what to expect, aftercare, booking",
  },
  {
    id: "salon-membership",
    name: "Membership offer",
    description: "Converts one-off clients into a recurring plan.",
    industries: ["Beauty", "Fitness", "Wellness"],
    genre: "vsl",
    designPack: "wellness",
    headline: "The easier way to keep it up",
    subheadline: "One monthly plan that covers your regular appointments, at a better rate than booking them one at a time.",
    ctaLabel: "See the plans",
    structure: "Video, what's included, comparison, signup",
  },

  // ------------------------------------------------------------------- B2B
  {
    id: "saas-demo-request",
    name: "Demo request",
    description: "For software sold through a conversation, not a signup form.",
    industries: ["SaaS", "B2B", "Technology"],
    genre: "lead_gen",
    designPack: "startup",
    complexity: "high",
    headline: "See it running on your own numbers",
    subheadline: "A working demo using your data, not a slide deck. Half an hour, and you'll know if it fits.",
    ctaLabel: "Request a demo",
    structure: "Problem, how it works, what's included, demo request",
  },
  {
    id: "b2b-webinar",
    name: "Webinar registration",
    description: "Dated registration page with agenda and presenter.",
    industries: ["B2B", "SaaS", "Professional services", "Education"],
    genre: "webinar",
    designPack: "startup",
    headline: "A live session on what's actually working now",
    subheadline: "Forty-five minutes, real examples, and time at the end for your questions.",
    ctaLabel: "Save my seat",
    structure: "Premise, agenda, presenter, registration",
  },
  {
    id: "agency-audit-offer",
    name: "Free audit",
    description: "Leads with diagnosis, which is how service businesses earn the meeting.",
    industries: ["Marketing", "Agencies", "B2B services"],
    genre: "lead_gen",
    designPack: "bold",
    headline: "Find out what is actually costing you leads",
    subheadline: "We look at what you have now and tell you the three things we would fix first.",
    ctaLabel: "Get my audit",
    structure: "Diagnosis framing, what you receive, process, request",
  },

  // ------------------------------------------------------ courses/education
  {
    id: "course-enrolment",
    name: "Course enrolment",
    description: "Long-form page for a paid program with a real curriculum.",
    industries: ["Education", "Coaching", "Training"],
    genre: "vsl",
    designPack: "classic",
    complexity: "high",
    headline: "Learn it properly, once",
    subheadline: "A structured course with a clear order to it, so you finish knowing what to do rather than what exists.",
    ctaLabel: "Enrol now",
    structure: "Video, curriculum, who it's for, guarantee, enrol",
  },
  {
    id: "workshop-signup",
    name: "Workshop signup",
    description: "Single-session workshop with a date and a cap.",
    industries: ["Education", "Training", "Community"],
    genre: "challenge",
    designPack: "wellness",
    depth: "lean",
    headline: "A hands-on session, in one afternoon",
    subheadline: "Small group, real practice, and something finished by the time you leave.",
    ctaLabel: "Reserve my place",
    structure: "What you'll do, the day, place limit, signup",
  },

  // ---------------------------------------------------------------- retail
  {
    id: "ecommerce-first-order",
    name: "First-order offer",
    description: "A first-purchase incentive for a physical product.",
    industries: ["E-commerce", "Retail", "Food and drink"],
    genre: "tripwire",
    designPack: "bold",
    depth: "lean",
    headline: "Try it once at a better price",
    subheadline: "A first order at an introductory price, so you can decide on the product rather than the promise.",
    ctaLabel: "Order now",
    structure: "Product, what's in it, first-order price, checkout",
  },
  {
    id: "hospitality-booking",
    name: "Table or booking page",
    description: "Local, visual page for venues that fill by reservation.",
    industries: ["Hospitality", "Restaurants", "Events"],
    genre: "lead_gen",
    designPack: "local_business",
    depth: "lean",
    headline: "Book your table",
    subheadline: "Tell us when and how many, and we'll confirm straight back.",
    ctaLabel: "Book a table",
    structure: "Venue, what's on, hours and location, booking",
  },

  // -------------------------------------------------------------- services
  {
    id: "pet-services-booking",
    name: "Service booking",
    description: "Warm, local page for appointment-based services.",
    industries: ["Pet services", "Personal services", "Home services"],
    genre: "lead_gen",
    designPack: "local_business",
    headline: "Book them in this week",
    subheadline: "Tell us what they need and when suits, and we'll confirm a time.",
    ctaLabel: "Book now",
    structure: "Services, how it works, area served, booking",
  },
  {
    id: "wellness-first-session",
    name: "First session",
    description: "Gentle, low-pressure page for therapy and wellbeing practices.",
    industries: ["Wellness", "Therapy", "Allied health"],
    genre: "lead_gen",
    designPack: "wellness",
    headline: "Start with one session",
    subheadline: "No package, no commitment. One session to see whether this feels like the right fit.",
    ctaLabel: "Book a session",
    structure: "Approach, what a session is like, practitioner, booking",
  },
  {
    id: "nonprofit-supporter",
    name: "Supporter signup",
    description: "For causes that need people on a list before they need money.",
    industries: ["Nonprofit", "Community", "Education"],
    genre: "lead_gen",
    designPack: "classic",
    headline: "Stay close to the work",
    subheadline: "Updates on what's actually happening, where support goes, and what changed because of it.",
    ctaLabel: "Keep me posted",
    structure: "The cause, the work, where support goes, signup",
  },
];

export function getFunnelTemplate(id: string): FunnelTemplate | undefined {
  return FUNNEL_TEMPLATES.find((t) => t.id === id);
}

/** Every industry in the catalog, for the browse filter. */
export function templateIndustries(): string[] {
  return [...new Set(FUNNEL_TEMPLATES.flatMap((t) => t.industries))].sort();
}
