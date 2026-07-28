export interface IndustryPainPoint {
  title: string;
  body: string;
}

export interface IndustryHelp {
  title: string;
  body: string;
}

export interface IndustryFaq {
  question: string;
  answer: string;
}

export interface Industry {
  slug: string;
  name: string;
  shortName: string;
  metaTitle: string;
  metaDescription: string;
  heroEyebrow: string;
  heroTitleA: string;
  heroTitleB: string;
  heroSubtitle: string;
  painPoints: IndustryPainPoint[];
  howItHelps: IndustryHelp[];
  faqs: IndustryFaq[];
}

// Grounded in real, already-shipped features only — no industry-specific
// claims about functionality that doesn't exist (no HIPAA/compliance
// claims for healthcare-adjacent verticals, no fabricated stats). Each
// pain point + "how it helps" pairing maps a genuinely plausible
// operational challenge to a real feature, not an invented benefit.
export const INDUSTRIES: Industry[] = [
  {
    slug: "coaches-consultants",
    name: "Coaches & Consultants",
    shortName: "coaches and consultants",
    metaTitle: "CRM for Coaches & Consultants",
    metaDescription:
      "A CRM built for coaches and consultants: booking pages for discovery calls, a pipeline that tracks prospects through enrollment, and an AI agent that catches inquiries after hours.",
    heroEyebrow: "For Coaches & Consultants",
    heroTitleA: "Every discovery call",
    heroTitleB: "tracked from inquiry to enrolled client",
    heroSubtitle:
      "A booking link for discovery calls, a pipeline that matches how you actually sell, and follow-up that doesn't depend on you remembering to send it.",
    painPoints: [
      { title: "Discovery calls fall through the cracks", body: "A lead books a call, has a great conversation, and then... nothing. No system tracking who said they'd think about it or who was waiting on a follow-up email." },
      { title: "Inquiries come in whenever they come in", body: "DMs, website forms, texts — interested prospects reach out on their own schedule, and a slow response is often the difference between booking the call and losing the lead entirely." },
      { title: "Proposals live in email threads", body: "Package details, pricing, and terms get typed out fresh every time instead of sent as something a prospect can actually review and accept." },
    ],
    howItHelps: [
      { title: "A booking page for discovery calls", body: "Share one link. Prospects pick an open slot, get an ICS-confirmed booking, and reminders send themselves — no back-and-forth over availability." },
      { title: "A pipeline built around your actual process", body: "Track prospects through discovery, proposal sent, and enrolled — not a generic sales-stage template that doesn't match coaching." },
      { title: "An AI agent that catches after-hours interest", body: "Web chat and SMS can answer initial questions and capture contact details the moment someone reaches out, even outside your working hours." },
      { title: "Quotes for your packages", body: "Send a line-itemed package or engagement quote that a prospect can accept directly — no separate proposal tool." },
    ],
    faqs: [
      { question: "Can I set up a pipeline that matches my actual coaching process, not a generic sales funnel?", answer: "Yes — pipeline stages are configured during setup to match how you actually move someone from inquiry to enrolled client, not left as a generic default." },
      { question: "Does the AI agent replace the discovery call?", answer: "No — it handles the initial response and qualification (answering questions, capturing contact details, booking the call itself), not the coaching conversation." },
      { question: "Can past clients be tracked separately from active prospects?", answer: "Yes — contacts carry tags and pipeline stage independently, so a completed engagement doesn't get mixed in with active prospects." },
    ],
  },
  {
    slug: "agencies",
    name: "Marketing & Creative Agencies",
    shortName: "agencies",
    metaTitle: "CRM for Marketing & Creative Agencies",
    metaDescription:
      "A CRM built for agencies managing multiple client relationships at once: a pipeline per engagement, quotes for proposals, and AI-triaged inbound inquiries.",
    heroEyebrow: "For Agencies",
    heroTitleA: "Run every client relationship",
    heroTitleB: "without losing track of any of them",
    heroSubtitle:
      "One pipeline for new-business prospects, one system for proposals and quotes, and an AI agent that triages inbound inquiries before they hit your inbox.",
    painPoints: [
      { title: "New-business leads arrive across too many channels", body: "A form fill here, a referral email there, a DM somewhere else — without one place tracking all of it, prospects get missed or double-contacted." },
      { title: "Proposals take longer to send than they should", body: "Scope, pricing, and terms get rebuilt from scratch for every prospect instead of sent as a structured quote the client can review and sign off on." },
      { title: "Client status lives in someone's head", body: "Which prospects are warm, who's waiting on a follow-up, what stage each deal is at — often known only by whoever's been handling that relationship personally." },
    ],
    howItHelps: [
      { title: "One pipeline for every prospect", body: "New-business leads move through the same tracked stages regardless of which channel they came in on, with days-in-stage visible on every card." },
      { title: "Quotes that double as proposals", body: "Build a line-itemed quote with scope and terms, send it, and the client can accept directly from their inbox." },
      { title: "Forms that route straight into the pipeline", body: "A contact-us or intake form on your site creates a contact — and a deal, if you want one — the moment it's submitted." },
      { title: "An AI agent for first-line triage", body: "Web chat and SMS can answer initial questions and capture the details you need before a lead ever reaches a team member." },
    ],
    faqs: [
      { question: "Can I track multiple prospects at different stages at once?", answer: "Yes — the pipeline is a Kanban board with every active prospect visible by stage, not a list you have to filter to make sense of." },
      { question: "Can quotes include multiple line items for different services?", answer: "Yes — quotes support multiple line items with individual pricing, plus a global discount and tax if needed." },
      { question: "Does this replace project management tools we already use?", answer: "No — it covers the sales/relationship side (pipeline, quotes, follow-up), not delivery/project management, which most agencies keep as a separate tool." },
    ],
  },
  {
    slug: "home-services-trades",
    name: "Home Services & Trades",
    shortName: "home services and trades businesses",
    metaTitle: "CRM for Home Services & Trades",
    metaDescription:
      "A CRM built for contractors, plumbers, HVAC, and electricians: an AI agent that answers missed calls, quotes clients accept from their inbox, and booking pages for estimates.",
    heroEyebrow: "For Home Services & Trades",
    heroTitleA: "A missed call",
    heroTitleB: "doesn't have to be a missed job",
    heroSubtitle:
      "An AI agent that answers and qualifies calls you can't get to, quotes clients can accept without a callback, and booking pages for scheduling estimates.",
    painPoints: [
      { title: "A missed call is often a lost job", body: "When you're on a job site, the phone doesn't always get answered — and the caller frequently just tries the next contractor instead of leaving a voicemail." },
      { title: "Quotes get stuck waiting on a callback", body: "A homeowner gets a verbal estimate or a text, and then has to wait for a follow-up call to actually confirm and book the work." },
      { title: "Scheduling estimates means playing phone tag", body: "Back-and-forth to find a time that works for both sides, instead of the homeowner just picking an open slot themselves." },
    ],
    howItHelps: [
      { title: "AI-answered calls and texts", body: "Inbound calls and SMS get picked up and qualified automatically — capturing the job details and contact info even when nobody's available to answer live." },
      { title: "Quotes clients can accept from their inbox", body: "Send a line-itemed estimate; the homeowner can accept or ask questions right from the email, no callback required to move forward." },
      { title: "Booking pages for estimates", body: "Share one link for scheduling an in-home estimate — the homeowner picks a slot, gets a confirmation, and reminders send themselves." },
      { title: "A pipeline from inquiry to completed job", body: "Track every lead from first contact through estimate, accepted quote, and completed work — not a paper trail or a whiteboard." },
    ],
    faqs: [
      { question: "Can the AI agent actually answer the phone, not just texts?", answer: "Yes — the same AI agent that answers web chat and SMS can also answer inbound phone calls, qualify the caller, and book a callback if needed." },
      { question: "Can I text a quote directly instead of just emailing it?", answer: "Quotes send by email today; SMS-send for quotes is a planned addition, not yet available." },
      { question: "Does a missed-call auto-text-back exist?", answer: "Yes — a missed call can trigger an automatic text response so the caller gets an immediate reply even when the call itself wasn't answered." },
    ],
  },
  {
    slug: "real-estate",
    name: "Real Estate",
    shortName: "real estate professionals",
    metaTitle: "CRM for Real Estate Agents & Teams",
    metaDescription:
      "A CRM built for real estate agents: an AI agent for after-hours inquiries, booking pages for showings, and a pipeline that tracks buyers and sellers separately.",
    heroEyebrow: "For Real Estate",
    heroTitleA: "Inquiries don't wait",
    heroTitleB: "for business hours — your follow-up shouldn't either",
    heroSubtitle:
      "An AI agent that qualifies after-hours inquiries, booking pages for showings, and a pipeline that tracks buyers and sellers through their own stages.",
    painPoints: [
      { title: "Listing inquiries come in at all hours", body: "A prospect browsing listings at 9pm wants an answer now, not a callback the next business day — by which point they've often already contacted someone else." },
      { title: "Showings mean constant back-and-forth", body: "Coordinating a time that works for the buyer, the seller, and you, usually across several messages before anything's actually confirmed." },
      { title: "Buyers and sellers need different tracking", body: "A buyer's journey and a seller's journey don't look the same, but a lot of pipelines force both into one generic set of stages." },
    ],
    howItHelps: [
      { title: "AI-qualified after-hours inquiries", body: "Web chat, SMS, and inbound calls can be answered around the clock — qualifying the lead and capturing what they're looking for before you ever pick up the phone." },
      { title: "Booking pages for showings", body: "Share one link. Prospects pick an open slot, get an ICS-confirmed booking, and reminders send themselves." },
      { title: "A pipeline built for buyers and sellers", body: "Track buyer-side and seller-side prospects through the stages that actually apply to each, not one undifferentiated funnel." },
      { title: "Fast follow-up from one record", body: "Every call, text, and email with a client lives in one activity timeline — no piecing together the history across separate tools." },
    ],
    faqs: [
      { question: "Can I separate buyer leads from seller leads?", answer: "Yes — pipeline stages and tags are configured to reflect the two journeys separately during setup." },
      { question: "Can the AI agent answer questions about a specific listing?", answer: "It answers using the persona and knowledge base you configure — including details you add about active listings — rather than guessing." },
      { question: "Does the booking page work for both showings and consultations?", answer: "Yes — booking pages aren't limited to one appointment type; set up separate pages for showings, listing consultations, or buyer consultations as needed." },
    ],
  },
  {
    slug: "local-service-businesses",
    name: "Local Service Businesses",
    shortName: "local service businesses",
    metaTitle: "CRM for Local Service Businesses",
    metaDescription:
      "A CRM built for salons, studios, and appointment-based local businesses: booking pages with automatic reminders, SMS follow-up, and a full history for repeat clients.",
    heroEyebrow: "For Local Service Businesses",
    heroTitleA: "Fewer no-shows,",
    heroTitleB: "more repeat clients, less manual reminding",
    heroSubtitle:
      "Booking pages with automatic reminders, SMS follow-up that doesn't rely on you remembering, and a full history for every repeat client.",
    painPoints: [
      { title: "No-shows cost real money", body: "An unconfirmed appointment is a real risk of a no-show — and a manual reminder call or text is one more thing to remember to do for every booking." },
      { title: "Repeat clients get treated like strangers", body: "Without a shared record, whoever answers the phone or the door doesn't necessarily know this client's history, preferences, or last visit." },
      { title: "Follow-up after a visit rarely happens", body: "A simple \"see you again in six weeks\" nudge is easy to mean to send and easy to never actually get around to." },
    ],
    howItHelps: [
      { title: "Booking pages with automatic reminders", body: "Clients pick their own slot from a public link, get an ICS-confirmed booking, and reminders send themselves ahead of the appointment." },
      { title: "A shared contact history", body: "Every booking, message, and note lives on the client's profile — so anyone on the team can see the full history, not just whoever handled them last time." },
      { title: "SMS and email from one place", body: "Send a quick text or email straight from a client's profile; replies route back to your own inbox, not a shared number nobody checks." },
      { title: "An AI agent for after-hours booking requests", body: "Web chat and SMS can answer basic questions and point a visitor to the booking page even outside business hours." },
    ],
    faqs: [
      { question: "Do reminders send automatically, or do I have to trigger them?", answer: "Automatically — reminder timing is configured once on the booking page and applies to every booking made through it." },
      { question: "Can clients reschedule themselves?", answer: "Yes — the booking confirmation includes a way to reschedule or cancel without needing to call or message you directly." },
      { question: "Can I see a client's full visit history in one place?", answer: "Yes — every booking, message, and note on a contact's profile is merged into one activity timeline." },
    ],
  },
];

export function getIndustryBySlug(slug: string): Industry | undefined {
  return INDUSTRIES.find((i) => i.slug === slug);
}
