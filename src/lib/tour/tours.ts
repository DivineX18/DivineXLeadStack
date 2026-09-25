/**
 * FLOW'S TWO TOURS.
 *
 * They are deliberately INDEPENDENT of the Ascend tour — not a "step 7" of
 * it. A customer arrives here through the certified SSO handoff, which
 * carries no tour state and must not be changed to carry any. Flow decides on
 * its own what to show, from workspace state it already holds.
 *
 *   FLOW_OPERATIONS — for a workspace with an ACTIVE Ascend Operations grant.
 *     Explains that they are now in the execution half and how to get back.
 *   FLOW_ONLY — for a standalone Flow workspace. Never mentions Ascend,
 *     Intelligence, or anything they do not own.
 */

export interface TourStepDef {
  anchor?: string;
  fallbackAnchor?: string;
  title: string;
  body: string;
}

export interface TourDef {
  id: string;
  version: number;
  steps: TourStepDef[];
}

/**
 * The continuation for an Ascend customer who just crossed over.
 *
 * Short on purpose: they have already been told what Ascend is. What they
 * need here is "you are somewhere else now, here is what it does, here is the
 * way back".
 */
export const FLOW_OPERATIONS_TOUR: TourDef = {
  id: "flow-operations",
  version: 1,
  steps: [
    {
      title: "You're in Flow, your Operations workspace",
      body:
        "This is the execution half of your growth system. Ascend tells you what to do; " +
        "Flow is where you do it.",
    },
    {
      anchor: "nav-contacts",
      title: "Everything you operate lives here",
      body:
        "CRM and leads, pipelines, funnels and websites, forms and booking, campaigns, " +
        "follow-up and automations, all in this workspace.",
    },
    {
      anchor: "nav-intelligence-return",
      title: "Move between Intelligence and Operations anytime",
      body:
        "Need strategy, a Growth Scan, or new marketing assets? Return to Intelligence. " +
        "Ready to manage leads, build funnels, automate follow-up, or operate your business? " +
        "Stay in Flow.",
    },
  ],
};

/**
 * Standalone Flow. Built around the working sequence rather than a tour of
 * every tab, and it never implies an Ascend entitlement this customer does
 * not have.
 */
export const FLOW_ONLY_TOUR: TourDef = {
  id: "flow-only",
  version: 1,
  steps: [
    {
      title: "Welcome to your workspace",
      body:
        "Everything here follows one path: capture a lead, manage it, convert it, " +
        "automate the follow-up, and measure what worked. Here's where each part lives.",
    },
    {
      anchor: "nav-forms",
      title: "Capture",
      body:
        "Forms and booking pages turn visitors into contacts. Every submission creates a " +
        "contact automatically, and booking pages let people put time straight in your calendar.",
    },
    {
      anchor: "nav-contacts",
      title: "Manage",
      body:
        "Contacts is your CRM, every lead, their history, and every conversation in one place. " +
        "Pipeline tracks each deal through its stages.",
    },
    {
      anchor: "nav-funnels",
      title: "Convert",
      body:
        "Funnels and websites are the pages that do the selling. Build them here and publish " +
        "them without leaving the workspace.",
    },
    {
      anchor: "nav-workflows",
      title: "Automate",
      body:
        "Workflows handle the follow-up for you, respond the moment a lead arrives, nurture " +
        "over time, and chase what goes quiet. Broadcasts send to a whole segment at once.",
    },
    {
      anchor: "nav-reports",
      title: "Measure",
      body:
        "Reports show what's actually working: where leads come from, what converts, " +
        "and what revenue closed.",
    },
  ],
};

/** Which tour applies. Reads workspace state the app already holds; it takes
 *  no part in authorization, and a wrong answer only means a different
 *  explanation, never different access. */
export function tourForWorkspace(ascendGrantActive: boolean): TourDef {
  return ascendGrantActive ? FLOW_OPERATIONS_TOUR : FLOW_ONLY_TOUR;
}
