export type ContentBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "list"; items: string[] };

export interface ResourcePost {
  slug: string;
  title: string;
  metaDescription: string;
  dek: string;
  readingMinutes: number;
  publishedAt: string; // ISO date
  category: string;
  body: ContentBlock[];
}

// Educational, evergreen content grounded in real mechanics of how the
// platform's shipped features work — no fabricated statistics, no
// invented case studies, no claimed outcomes attributed to real or
// implied customers. Where a number is used, it's a well-known industry
// concept (e.g., "five minutes" as a commonly cited lead-response
// benchmark), not a specific claim about this product's own results.
export const RESOURCE_POSTS: ResourcePost[] = [
  {
    slug: "speed-to-lead-first-five-minutes",
    title: "Speed-to-Lead: Why the First Five Minutes Decide the Deal",
    metaDescription:
      "Why response time is the single highest-leverage lever in lead follow-up, and how automated speed-to-lead sequences close the gap between form submission and first contact.",
    dek: "A lead that waits an hour for a reply has usually already moved on. Here's why response speed outweighs almost everything else in the first contact.",
    readingMinutes: 5,
    publishedAt: "2026-04-02",
    category: "Follow-Up",
    body: [
      { type: "p", text: "A lead fills out a form, and then what? For most businesses, the honest answer is: it depends who's free, how busy the day is, and whether anyone actually saw the notification. That gap — between a lead raising their hand and someone actually responding — is the single most expensive, most fixable problem in most sales processes." },
      { type: "h2", text: "Why speed matters more than almost anything else" },
      { type: "p", text: "A lead who just submitted a form is at peak interest. They were thinking about the problem, found you, and took action. Every minute that passes after that is a minute their attention drifts back to whatever else is competing for it — including, often, a competitor's form." },
      { type: "p", text: "This isn't a subtle effect. It's widely cited in sales research that the odds of actually qualifying a lead drop sharply once you're past the first few minutes of response time, and drop further after the first hour. The lead didn't stop being interested — they just moved on to the next thing, and whoever responded first got the conversation." },
      { type: "h2", text: "Why manual follow-up loses this race" },
      { type: "p", text: "The problem isn't that people don't care about responding fast. It's that manual follow-up depends on someone being available, checking the right inbox, and prioritizing that lead over whatever else is on their plate at that exact moment. That's a lot of conditions to line up consistently, especially outside business hours or during a busy stretch." },
      { type: "list", items: [
        "A form submits at 6pm — the team's already gone for the day.",
        "A lead comes in during a packed morning — it sits in an inbox behind a dozen other things.",
        "A lead arrives on a weekend — the reply doesn't happen until Monday, if it's remembered at all.",
      ] },
      { type: "h2", text: "What automated speed-to-lead actually looks like" },
      { type: "p", text: "The fix isn't asking people to respond faster — it's removing the dependency on a person being available at all for the first response. A form submission can trigger an SMS and email within seconds, confirming receipt and setting expectations, while the lead's attention is still on you. Where it fits, an AI agent can go a step further: answering initial questions, qualifying the lead, and handing off a clear summary to a human for anything that needs judgment." },
      { type: "p", text: "The human follow-up still matters — automated speed-to-lead isn't a replacement for a real conversation, it's what keeps the lead warm long enough for that conversation to happen." },
      { type: "h2", text: "Where to start" },
      { type: "p", text: "If nothing else exists today, the highest-leverage first step is a simple automated acknowledgment the moment a lead comes in — even just confirming you received their message and telling them when to expect a real reply closes most of the gap. Layering in AI-qualified first response after that is where the bigger gains show up." },
    ],
  },
  {
    slug: "build-a-pipeline-that-matches-how-you-sell",
    title: "Building a Sales Pipeline That Matches How You Actually Sell",
    metaDescription:
      "Generic sales-stage templates rarely fit how a specific business actually moves a lead to a close. Here's how to design pipeline stages around your real process instead.",
    dek: "A pipeline copied from a template you don't recognize your own sales process in isn't tracking anything useful. Here's how to build one that actually is.",
    readingMinutes: 6,
    publishedAt: "2026-04-16",
    category: "Pipeline",
    body: [
      { type: "p", text: "Most CRMs ship with a default pipeline: New, Contacted, Qualified, Proposal, Won, Lost. It's a reasonable starting point — and for a lot of businesses, it's also not quite right. If your actual sales process doesn't map cleanly onto those six words, the pipeline stops being useful fast, because nobody's sure which stage a given deal is actually in." },
      { type: "h2", text: "The test: can you place every real deal without hesitating?" },
      { type: "p", text: "A pipeline stage should be unambiguous. If you have to think about which stage a deal belongs in, or if two people on your team would categorize the same deal differently, the stages themselves are the problem — not the deal, and not the people using the tool." },
      { type: "p", text: "A coaching business's real stages might be: Inquiry, Discovery Call Booked, Proposal Sent, Enrolled. A home-services business's might be: New Lead, Estimate Scheduled, Quote Sent, Job Booked. Neither of those maps neatly onto \"Qualified\" or \"Contacted\" — and forcing them to just adds a layer of translation nobody needed." },
      { type: "h2", text: "Design stages around decisions, not activities" },
      { type: "p", text: "A common mistake is building stages around what you did (\"Called\", \"Emailed\", \"Followed Up\") instead of where the deal actually stands (\"Waiting on Their Decision\", \"Ready to Close\"). Activity-based stages tell you what happened; decision-based stages tell you what to do next — which is the entire point of looking at a pipeline in the first place." },
      { type: "list", items: [
        "Bad: \"Called Once\", \"Called Twice\", \"Called Three Times\"",
        "Better: \"Awaiting Response\", \"Objection Raised\", \"Ready to Decide\"",
      ] },
      { type: "h2", text: "Keep the number of stages honest, not comprehensive" },
      { type: "p", text: "More stages feels like more precision, but in practice a pipeline with twelve stages just means more clicking and more disagreement about which one applies. Somewhere between four and seven stages covers almost every real sales process without turning stage management into its own chore." },
      { type: "h2", text: "Revisit it once, not constantly" },
      { type: "p", text: "The instinct to keep tweaking stages as edge cases come up usually makes things worse, not better — a pipeline that changes shape every month stops being a reliable place to look for \"where do things actually stand.\" Get the stages right once, live with them for a real sales cycle, and only adjust based on a pattern you've actually seen repeat, not a single unusual deal." },
    ],
  },
  {
    slug: "where-ai-agents-belong-in-follow-up",
    title: "Where AI Agents Actually Belong in Your Follow-Up Process",
    metaDescription:
      "AI agents are good at some parts of lead follow-up and genuinely bad at others. A practical breakdown of where automation helps and where a human still needs to take over.",
    dek: "Automating everything isn't the goal — automating the right five minutes is. Here's a practical line between what AI should handle and what a person should.",
    readingMinutes: 5,
    publishedAt: "2026-05-01",
    category: "AI Agents",
    body: [
      { type: "p", text: "\"Should this be automated?\" is the wrong first question to ask about AI in a sales process. The better question is: which part of this conversation is actually a judgment call, and which part is just execution? Automation is strong at the second and weak at the first — and most follow-up processes have both." },
      { type: "h2", text: "What AI agents are genuinely good at" },
      { type: "p", text: "The first response to an inbound message — a web chat question, a text, an inbound call after hours — is mostly execution. Confirm what the person is asking about, capture their contact details, answer the questions you already know the answers to, and either book the next step or flag it for a human. None of that requires creativity or judgment; it requires consistency and speed, which is exactly what automation is built for." },
      { type: "list", items: [
        "Answering common questions instantly, at any hour",
        "Capturing name, contact info, and what the person actually wants",
        "Booking a call or appointment directly, without back-and-forth",
        "Recognizing when a conversation needs a human and escalating it",
      ] },
      { type: "h2", text: "What still needs a person" },
      { type: "p", text: "Anything that involves negotiation, an unusual situation, an emotionally sensitive topic, or a decision that isn't spelled out anywhere — that's where a human needs to take over, not because AI can't produce plausible-sounding text, but because the cost of a wrong call in those moments is high and the judgment required isn't really rule-based." },
      { type: "p", text: "A well-configured AI agent knows the difference. Escalation rules — specific keywords, specific situations — are what decide when a conversation gets handed off instead of answered automatically. That handoff is the actual design decision, not \"should we use AI at all.\"" },
      { type: "h2", text: "The failure mode to avoid" },
      { type: "p", text: "The version of this that goes wrong isn't \"too much automation\" — it's automation with no escalation path, where a frustrated or confused visitor just keeps talking to a bot with no way out. Business hours, escalation keywords, and a clear handoff to a real person aren't optional extras; they're what makes the automated part trustworthy in the first place." },
      { type: "h2", text: "Start narrow, expand deliberately" },
      { type: "p", text: "The lowest-risk starting point is usually after-hours coverage — a channel that would otherwise get zero response outside business hours picks up an automated one instead. From there, expanding into business-hours first response is a deliberate choice, not a default, and it works best once the escalation rules have actually been tested against real conversations." },
    ],
  },
  {
    slug: "real-cost-of-tool-sprawl",
    title: "The Real Cost of Tool Sprawl",
    metaDescription:
      "When your CRM, texting tool, booking tool, and quoting tool don't talk to each other, the cost isn't just the subscriptions — it's the leads that fall through the seams between them.",
    dek: "Five tools that don't talk to each other aren't five conveniences. They're five places a lead can quietly disappear.",
    readingMinutes: 4,
    publishedAt: "2026-05-15",
    category: "Operations",
    body: [
      { type: "p", text: "Tool sprawl doesn't usually happen on purpose. A texting tool gets added because the CRM didn't do SMS well. A booking tool gets added because scheduling was painful. A quoting tool gets added because building estimates in a document editor took too long. Each decision made sense on its own. The result, a year later, is a lead's information scattered across four systems that don't know about each other." },
      { type: "h2", text: "The subscription cost is the smallest part" },
      { type: "p", text: "It's easy to add up the monthly fees for four or five separate tools and call that the cost of sprawl. That's real, but it's rarely the biggest problem. The bigger cost is what happens in the gaps between tools — the places where information has to be manually copied, where nobody's quite sure which system has the current status, and where a lead's history is split across systems that don't cross-reference each other." },
      { type: "h2", text: "Where leads actually get lost" },
      { type: "list", items: [
        "A text conversation that never makes it into the CRM, so the next person to talk to that lead has no context",
        "A booking made through a separate scheduling tool that never creates a corresponding pipeline entry",
        "A quote sent from a document, with no record of whether it was ever actually accepted",
        "A lead's full history split across three inboxes, none of which the whole team can see",
      ] },
      { type: "h2", text: "What \"one record\" actually solves" },
      { type: "p", text: "The value of consolidating onto one system isn't that it's more convenient to log into fewer apps — it's that every touchpoint with a lead becomes part of the same record, visible to anyone who needs it, instead of scattered across tools that require someone to manually reconcile. A text message, a booked appointment, and a sent quote showing up in the same activity timeline is the actual point, not a nice-to-have." },
      { type: "h2", text: "It doesn't have to happen all at once" },
      { type: "p", text: "Consolidating tool sprawl doesn't require ripping everything out on day one. The highest-leverage first move is usually whichever tool is causing the most information loss right now — often the texting or booking tool that isn't connected to anything else — and working outward from there." },
    ],
  },
  {
    slug: "no-shows-cost-more-than-empty-slots",
    title: "A No-Show Costs More Than an Empty Slot",
    metaDescription:
      "No-shows aren't just a scheduling inconvenience — they're a real cost to any appointment-based business. Here's how automatic confirmations and reminders actually reduce them.",
    dek: "An empty slot on the calendar is a missed opportunity. An unconfirmed booking that turns into a no-show is worse — it was never really booked at all.",
    readingMinutes: 4,
    publishedAt: "2026-06-03",
    category: "Booking & Scheduling",
    body: [
      { type: "p", text: "For any appointment-based business — a coach, a salon, a home-services estimate, a real estate showing — a no-show is a specific kind of loss. It's not just an open slot; it's a slot that was reserved, planned around, and then wasted, often on short notice that made it too late to fill with someone else." },
      { type: "h2", text: "Why bookings turn into no-shows" },
      { type: "p", text: "Most no-shows aren't intentional. They happen because the appointment slipped someone's mind, because there was no reminder close enough to the actual time, or because rescheduling felt like more friction than just not showing up. None of those are about the person not caring — they're about the booking process not doing enough to keep the appointment top of mind." },
      { type: "h2", text: "What actually reduces no-show rates" },
      { type: "list", items: [
        "An immediate confirmation the moment the booking is made, so it feels real right away",
        "A reminder close enough to the appointment time that it's actually front of mind, not just an email from a week ago",
        "An easy way to reschedule instead of just not showing up — removing the friction that turns \"I need to move this\" into a silent no-show",
      ] },
      { type: "h2", text: "Why manual reminders don't scale" },
      { type: "p", text: "Sending a personal reminder text to every booked appointment works — until the number of appointments makes it impractical to remember for every single one, every single day. It's exactly the kind of task that's simple in principle and unreliable in practice once volume goes up, which is why it needs to happen automatically rather than depend on someone remembering." },
      { type: "h2", text: "Booking pages that handle this on their own" },
      { type: "p", text: "A public booking link where someone picks their own slot, gets an automatic ICS-confirmed booking, and receives reminders on a schedule set once — not per appointment — removes the dependency on anyone remembering to follow up. The reschedule option matters just as much as the reminder: making it easy to move an appointment is often what prevents it from becoming a no-show in the first place." },
    ],
  },
];

export function getResourcePostBySlug(slug: string): ResourcePost | undefined {
  return RESOURCE_POSTS.find((p) => p.slug === slug);
}
