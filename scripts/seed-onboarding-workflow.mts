/**
 * Seed the client-onboarding reminder sequence.
 *
 * Built entirely from node types the workflow engine already has. There is no
 * scheduling code here and none in the onboarding feature: QStash, the send
 * window, opt-out and retry-idempotency are all the engine's, already proven.
 *
 * HOW REMINDERS STOP. The engine re-reads the contact at every step, so an
 * if_else on a tag written days later decides whether the step that was
 * scheduled days earlier actually sends. Each checkpoint is two branches:
 * first "has the whole thing stopped", then "is this particular requirement
 * already done". whenTrue skips the reminder, whenFalse sends it, and both
 * arms converge on the next wait.
 *
 * Conditions are ANDed by the engine, so "stopped OR done" cannot be one
 * node. Chaining two is the honest way to express it.
 *
 * Seeded as a DRAFT. Nothing sends until a human activates it.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/seed-onboarding-workflow.mts <agencyId> [subAccountId]
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) {
    process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}

const agencyId = process.argv[2];
if (!agencyId) {
  console.error("Usage: seed-onboarding-workflow.mts <agencyId> [subAccountId]");
  process.exit(1);
}

const { getAdminDb } = await import("@/lib/firebase/admin");
const { FieldValue } = await import("firebase-admin/firestore");
const { resolveAgencyHomeWorkspaceId } = await import("@/lib/onboarding/home-workspace");
const { ONBOARDING_TAGS } = await import("@/lib/server/client-onboarding-service");

const db = getAdminDb();
const subAccountId = process.argv[3] ?? (await resolveAgencyHomeWorkspaceId(agencyId));
if (!subAccountId) {
  console.error("Could not resolve a workspace for that agency.");
  process.exit(1);
}

const DAY = 86_400;
const tag = (t: string) => ({ field: "tags", op: "has_tag", value: t });

/** Every marketing email needs the unsubscribe link; the engine enforces it. */
const SIGNOFF = "\n\nIf you need a hand with any of it, just reply to this email.\n\n{{unsubscribeLink}}";

const nodes: Record<string, unknown> = {
  // Day 0
  welcome: {
    id: "welcome",
    type: "send_email",
    config: {
      subject: "Welcome aboard, {{firstName}}",
      body:
        "Hi {{firstName}},\n\nWelcome aboard. We're glad you're here.\n\n" +
        "To get started we need a few things from you: some information about your business, " +
        "a handful of files, and access to the platforms we'll be working in. " +
        "Your onboarding link has all of it in one place, and it saves as you go, " +
        "so you can do it in pieces.\n\n" +
        "We never ask for your passwords. Every platform is an invitation you send, " +
        "and you can remove our access whenever you like." +
        SIGNOFF,
    },
    next: "w_day2",
  },

  // Day 2, intake reminder
  w_day2: { id: "w_day2", type: "wait", config: { seconds: 2 * DAY }, next: "b2_stopped" },
  b2_stopped: {
    id: "b2_stopped",
    type: "if_else",
    config: { conditions: { all: [tag(ONBOARDING_TAGS.stopped)] } },
    branches: { whenTrue: "done", whenFalse: "b2_intake" },
  },
  b2_intake: {
    id: "b2_intake",
    type: "if_else",
    config: { conditions: { all: [tag(ONBOARDING_TAGS.intakeDone)] } },
    branches: { whenTrue: "w_day4", whenFalse: "e_intake" },
  },
  e_intake: {
    id: "e_intake",
    type: "send_email",
    config: {
      subject: "Your onboarding form is waiting",
      body:
        "Hi {{firstName}},\n\nJust a nudge: your onboarding form still has a few sections to go.\n\n" +
        "It saves as you type, so you can do one section now and the rest later." +
        SIGNOFF,
    },
    next: "w_day4",
  },

  // Day 4, outstanding files and access
  w_day4: { id: "w_day4", type: "wait", config: { seconds: 2 * DAY }, next: "b4_stopped" },
  b4_stopped: {
    id: "b4_stopped",
    type: "if_else",
    config: { conditions: { all: [tag(ONBOARDING_TAGS.stopped)] } },
    branches: { whenTrue: "done", whenFalse: "b4_reqs" },
  },
  b4_reqs: {
    id: "b4_reqs",
    type: "if_else",
    config: { conditions: { all: [tag(ONBOARDING_TAGS.requirementsDone)] } },
    branches: { whenTrue: "w_day7", whenFalse: "e_reqs" },
  },
  e_reqs: {
    id: "e_reqs",
    type: "send_email",
    config: {
      subject: "A couple of things still to send us",
      body:
        "Hi {{firstName}},\n\nWe're still waiting on a few files and platform invitations.\n\n" +
        "Your onboarding link lists exactly what's outstanding, nothing else, so it should be " +
        "a short job." +
        SIGNOFF,
    },
    next: "w_day7",
  },

  // Day 7, final client reminder
  w_day7: { id: "w_day7", type: "wait", config: { seconds: 3 * DAY }, next: "b7_stopped" },
  b7_stopped: {
    id: "b7_stopped",
    type: "if_else",
    config: { conditions: { all: [tag(ONBOARDING_TAGS.stopped)] } },
    branches: { whenTrue: "done", whenFalse: "b7_complete" },
  },
  b7_complete: {
    id: "b7_complete",
    type: "if_else",
    config: { conditions: { all: [tag(ONBOARDING_TAGS.complete)] } },
    branches: { whenTrue: "done", whenFalse: "e_final" },
  },
  e_final: {
    id: "e_final",
    type: "send_email",
    config: {
      subject: "We're ready when you are",
      body:
        "Hi {{firstName}},\n\nWe're holding your start date, but we can't begin the build until " +
        "the last few pieces are in. Nothing here is urgent to us, it's just that the work " +
        "genuinely can't start without them.\n\n" +
        "If something is hard to find or you'd rather talk it through, reply and we'll sort it " +
        "out together." +
        SIGNOFF,
    },
    next: "w_day9",
  },

  // Day 9, internal escalation. No client email.
  w_day9: { id: "w_day9", type: "wait", config: { seconds: 2 * DAY }, next: "b9_stopped" },
  b9_stopped: {
    id: "b9_stopped",
    type: "if_else",
    config: { conditions: { all: [tag(ONBOARDING_TAGS.stopped)] } },
    branches: { whenTrue: "done", whenFalse: "b9_complete" },
  },
  b9_complete: {
    id: "b9_complete",
    type: "if_else",
    config: { conditions: { all: [tag(ONBOARDING_TAGS.complete)] } },
    branches: { whenTrue: "done", whenFalse: "t_followup" },
  },
  t_followup: {
    id: "t_followup",
    type: "create_task",
    config: { title: "Onboarding stalled: call {{firstName}} at {{company}}", dueInDays: 0 },
    next: "n_owner",
  },
  n_owner: {
    id: "n_owner",
    type: "notify",
    config: {
      recipient: "owner",
      to: "",
      subject: "Onboarding stalled: {{company}}",
      body:
        "{{firstName}} at {{company}} has not finished onboarding after 9 days and has stopped " +
        "responding to reminders. A task has been created. Worth a phone call.",
    },
    next: "done",
  },

  done: { id: "done", type: "goal", config: {}, next: null },
};

const existing = await db
  .collection("workflows")
  .where("subAccountId", "==", subAccountId)
  .where("name", "==", "Client onboarding")
  .limit(1)
  .get();
const ref = existing.empty ? db.collection("workflows").doc() : existing.docs[0].ref;

await ref.set(
  {
    subAccountId,
    agencyId,
    createdByUid: "script:seed-onboarding-workflow",
    name: "Client onboarding",
    // DRAFT. Nothing sends until a human turns it on.
    status: existing.empty ? "draft" : (existing.docs[0].data().status ?? "draft"),
    trigger: { type: "onboarding.created", filters: { all: [] } },
    startNodeId: "welcome",
    nodes,
    stats: existing.empty ? { enrolled: 0, completed: 0 } : (existing.docs[0].data().stats ?? { enrolled: 0, completed: 0 }),
    updatedAt: FieldValue.serverTimestamp(),
    ...(existing.empty ? { createdAt: FieldValue.serverTimestamp() } : {}),
  },
  { merge: true },
);

console.log(`${existing.empty ? "created" : "updated"} workflow ${ref.id} in ${subAccountId}`);
console.log(`status: ${existing.empty ? "draft (activate it by hand when you are ready)" : "unchanged"}`);
