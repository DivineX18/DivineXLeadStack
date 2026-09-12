/**
 * THE FIVE LANDING-PAGE FIXTURES — one definition, shared by every harness.
 *
 * Chosen to span the decisions the generator makes: genre, emotional
 * transformation, whether an opt-in exists, whether money changes hands. If the
 * generator only knows one page shape, these five will look the same, and that
 * is the finding.
 *
 * They live here rather than inside one script because more than one harness
 * now needs them — the rendered-quality battery and the composition inspector
 * must judge THE SAME pages, or a fix proven in one is unproven in the other.
 *
 * Every fixture deliberately specifies NO layout, section order, image count or
 * hero treatment: those are the decisions under test. Trust facts (years in
 * business, ratings, review counts, certifications, warranties, insurance,
 * awards, customer counts) are UNKNOWN and must not appear on a generated page.
 */
export const FIXTURES = [
  {
    // FIXTURE #1 — Summit Roofing & Exteriors, the owner's exact business facts.
    // Deliberately specifies NO layout, section order, media subject, image
    // count or hero treatment: those are the decisions under test.
    // Trust facts (years in business, ratings, review counts, certifications,
    // warranties, insurance, awards, customer counts) are UNKNOWN and must not
    // appear on the generated page.
    id: "summit-roofing",
    label: "Summit Roofing (local service lead-gen)",
    args: {
      funnel_name: "Summit Roofing & Exteriors",
      genre: "lead_gen",
      headline: "Find out what condition your roof is actually in",
      subheadline: "A free 25-point inspection for Houston homeowners, with photos of what we find and a written recommendation before any work begins.",
      bullets: "Free 25-point roof inspection, Photo documentation of any damage we find, Written recommendations before any work begins",
      cta_label: "Schedule My Free Roof Inspection",
      media_subject: "residential roof inspection in Houston",
      emotional_transformation: "uncertainty_to_confidence",
      awareness: "problem_aware",
      traffic_temperature: "warm",
      sales_argument: {
        prospect: "A Houston homeowner with an aging roof or possible storm damage",
        arrival_context: "Worried after a storm, unsure whether the roof is actually damaged",
        current_belief: "Anyone I call will just try to sell me a whole new roof",
        belief_chain: [
          "You cannot decide about a roof you have never seen the condition of",
          "A documented inspection separates what is actually damaged from what a salesperson says is damaged",
          "Photos and a written recommendation let you decide before any money is committed",
          "Booking the free inspection costs nothing and leaves the decision with you",
        ],
        old_way: "Call a roofer, get a salesperson on the roof and a replacement quote the same afternoon",
        why_old_way_fails: "The person telling you what is wrong is the person selling the repair, so you never learn the actual condition",
        mechanism: "A 25-point inspection that documents the actual condition with photos",
        core_promise: "Know exactly what condition your roof is in before spending anything",
        primary_objection: "I do not know if I need a new roof and do not want to be sold one",
        close_reason: "The inspection is free and ends with a written recommendation, not a quote",
      },
    },
  },
  {
    id: "consultant",
    label: "Consultant / professional service",
    args: {
      funnel_name: "Operations Strategy Review",
      genre: "application",
      headline: "Your revenue grew. Your operations did not.",
      subheadline: "A structured review of where delivery breaks when volume doubles.",
      bullets: "For services businesses past the founder-led stage, Written findings in ten working days, Fixed scope and fixed fee",
      cta_label: "Apply for a review",
      emotional_transformation: "stagnation_to_clarity",
      awareness: "solution_aware",
      traffic_temperature: "warm",
      sales_argument: {
        prospect: "A services founder whose delivery is straining at higher volume",
        arrival_context: "Reading after another week of firefighting",
        current_belief: "We need to hire our way out of this",
        belief_chain: [
          "Headcount multiplies an unclear process rather than fixing it",
          "The stall is somewhere in the delivery path, not in the number of people",
          "Mapping where the work actually stops shows which constraint to fix first",
          "A fixed-scope written review answers that before the next hire",
        ],
        old_way: "Hire another delivery lead and hope the backlog clears",
        why_old_way_fails: "A new person inherits the same unclear handoffs, so the firefighting scales with the headcount",
        mechanism: "A delivery-path map that finds where the work actually stalls",
        core_promise: "Know what to fix before you hire again",
        primary_objection: "Consultants produce a deck and disappear",
        close_reason: "Fixed scope, written findings, no retainer attached",
      },
    },
  },
  {
    id: "lead-magnet",
    label: "Lead magnet",
    args: {
      funnel_name: "The First 30 Nights Guide",
      genre: "lead_magnet",
      headline: "The one schedule change that ends most toddler night waking",
      subheadline: "An 18-page guide written for 1 to 3 year olds, readable in a single sitting.",
      bullets: "Built around wake windows rather than sleep training, Nothing to buy to use it, Written by a paediatric sleep consultant",
      cta_label: "Send me the guide",
      emotional_transformation: "discouragement_to_possibility",
      awareness: "problem_aware",
      traffic_temperature: "cold",
      sales_argument: {
        prospect: "A parent of a toddler who has not slept through in months",
        arrival_context: "Searching at 2am after another broken night",
        current_belief: "Every method has failed so something is wrong with my child",
        belief_chain: [
          "The method was never the problem, the schedule underneath it was",
          "Wake windows decide whether a toddler can settle at all, before any method is applied",
          "Usually one mistimed nap is carrying the whole pattern",
          "An 18-page guide is enough to find it and test the change tonight",
        ],
        old_way: "Pick a sleep-training method, commit for two weeks, then try the next one when it fails",
        why_old_way_fails: "Every method assumes the child is tired at bedtime, which a mistimed nap quietly prevents",
        mechanism: "A wake-window audit that finds the one mistimed nap",
        core_promise: "Know the single change to make tonight",
        primary_objection: "I have tried everything already",
        close_reason: "It is free, and it takes one evening to test",
      },
    },
  },
  {
    id: "booking",
    label: "Appointment / booking",
    args: {
      funnel_name: "New Patient Consultation",
      genre: "lead_gen",
      headline: "Dental care designed for people who dread the dentist",
      subheadline: "Longer appointments, sedation options, and no lecture about flossing.",
      bullets: "Tell us your worries before you arrive, Sedation available for any treatment, Evening appointments twice a week",
      cta_label: "Book my first visit",
      emotional_transformation: "fear_to_safety",
      awareness: "problem_aware",
      traffic_temperature: "warm",
      sales_argument: {
        prospect: "An adult who has avoided the dentist for years out of anxiety",
        arrival_context: "Finally looking because something now hurts",
        current_belief: "I will be judged for how long I left it",
        belief_chain: [
          "Avoidance is a treatment-design problem, not a character flaw",
          "What is being avoided is the lecture and the loss of control, not the dentistry",
          "A first visit that is assessment only removes both of those from the day",
          "Booking commits you to a conversation and an exam, not to treatment",
        ],
        old_way: "Book an appointment and find out what happens to you once you are in the chair",
        why_old_way_fails: "Not knowing what will happen on the day is the thing being avoided, so the booking itself is the hard part",
        mechanism: "A first visit that is assessment only, with no treatment on the day",
        core_promise: "Get seen without being lectured or surprised",
        primary_objection: "They will start drilling on the first visit",
        close_reason: "The first appointment is a conversation and an exam, nothing else",
      },
    },
  },
  {
    id: "paid-offer",
    label: "Paid offer",
    args: {
      funnel_name: "Pricing Teardown",
      genre: "tripwire",
      headline: "Your pricing page is costing you more than your ad budget",
      subheadline: "A recorded teardown of your pricing page with the three changes to make first.",
      bullets: "Recorded walkthrough of your own page, Three prioritised changes with the reasoning, Delivered within five working days",
      cta_label: "Get my teardown",
      price_cents: 4900,
      emotional_transformation: "confusion_to_clarity",
      awareness: "solution_aware",
      traffic_temperature: "warm",
      sales_argument: {
        prospect: "A founder whose traffic converts worse than it should",
        arrival_context: "Has traffic and knows the page is the weak link",
        current_belief: "I need more traffic before pricing matters",
        belief_chain: [
          "Pricing decides what the traffic you already have is worth",
          "Buyers compare options in a specific order, and most pricing pages fight that order",
          "A teardown of your own page finds where that comparison breaks",
          "Three prioritised changes are few enough to ship and test this week",
        ],
        old_way: "Buy more traffic and send it to the same pricing page",
        why_old_way_fails: "More visitors reaching a page that loses them costs more without changing the conversion rate",
        mechanism: "A teardown against how buyers actually compare options",
        core_promise: "Know the three changes to make first",
        primary_objection: "Generic advice I could have found myself",
        close_reason: "It is your page, recorded, not a checklist",
      },
    },
  },
] as const;
