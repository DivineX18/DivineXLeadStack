/**
 * One-off content-deployment script for the DivineX Reconnect Series —
 * NOT a reusable product feature. Builds the actual Workflow doc (trigger
 * + node graph) + a starter-content preset entry directly for the
 * DivineX sub-account, using the {{tagLink:slug}} primitive shipped in
 * this same branch (lib/automations/tag-link-token.ts,
 * lib/workflows/engine.ts).
 *
 * Usage:
 *   AUTOMATIONS_TOKEN_SECRET=... FIREBASE_ADMIN_*=... \
 *     npx tsx scripts/seed-divinex-reconnect-series.mts --dry-run
 *   ... --execute
 *
 * Dry-run (default) only prints the node graph + email bodies for review.
 * --execute writes the Workflow doc (status: "draft" — the operator flips
 * it to "active" from the dashboard once reviewed, and applies the
 * reconnect-campaign-2026 tag to the target audience via CSV import /
 * bulk-tag to actually enroll anyone). This script never sends an email
 * and never enrolls a contact by itself.
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const DRY_RUN = !process.argv.includes("--execute");
const SUB_ACCOUNT_ID = process.env.RECONNECT_SUB_ACCOUNT_ID || "x4NOJFn8bTyav7OeJc1v"; // DivineX sub-account

const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2]!.trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  env[m[1]!] = v;
}

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();

// ─── Tags ──────────────────────────────────────────────────────────────────
const TAG_KICKOFF = "reconnect-campaign-2026";
const TAG_BUSINESS = "reconnect-business";
const TAG_PERSONAL = "reconnect-personal";
const TAG_BOTH = "reconnect-both";
const TAG_TRANSITION = "reconnect-transition";

// ─── Email bodies (plain text; {{merge tags}} resolved by the engine) ──────
// Framing rule honored throughout: never "I've been building Ascend" — always
// "the next chapter of my mission, and Ascend is one expression of it."

const EMAIL_1 = `Hi {{contact.firstName}},

It's been a while — long enough that I almost didn't send this.

You've been on my list since the days when this was mostly just me sharing what I was learning about growth, purpose, and becoming who we're actually meant to be. A lot has happened since then. For me, and probably for you too.

I'm not writing to sell you anything today. I'm writing because I've been building something — the next chapter of my mission — and before I say anything else about it, I wanted to actually reconnect first. Find out where you're at now, not where you were when you first joined.

So — quick, one-click question. What best describes where you are right now?

[button secondary: Building a business]({{tagLink:reconnect-business}})

[button secondary: Working on personal growth]({{tagLink:reconnect-personal}})

[button secondary: Honestly, both]({{tagLink:reconnect-both}})

[button secondary: Still figuring out what's next]({{tagLink:reconnect-transition}})

Whichever one it is, I'll send you something built for exactly that. No funnel, no catch — just picking the conversation back up where it actually applies to your life right now.

Talk soon,
{{owner.firstName}}`;

const EMAIL_2 = `Hi {{contact.firstName}},

One thing changed everything for me, and it wasn't a strategy or a tactic. It was clarity.

For years I mistook busy for productive, and effort for progress. I'd throw myself at a problem — in business, in life, wherever it showed up — without ever stepping back to ask if I was even solving the right one.

The moment that shifted for me was the moment I got honest about what I actually saw, instead of what I hoped was true or what I was afraid was true. Clarity first. Everything else — the decisions, the discipline, the direction — got easier once that was in place.

That's still the thread running through everything I do now, whether it shows up in how I coach someone through a hard season or in the tools I've been building lately. Clarity before action. Always.

More soon — and it'll be shaped by what you told me in the last email.

{{owner.firstName}}`;

// Business track (clicked "Building a business")
const EMAIL_3_BUSINESS = `Hi {{contact.firstName}},

You told me you're building a business right now, so let me tell you what I've actually been building on my end — the next chapter of my mission, and it's called Ascend.

Here's the short version: most businesses don't fail because the owner isn't working hard enough. They stall because nobody ever gets a clear, honest read on what's actually the constraint — the ONE thing that, if fixed, would unlock the most growth. Everything else is just noise until that's answered.

Ascend starts there. You give it your website and a few details about your business, and it hands you back a real, specific diagnosis: your biggest bottleneck, what it's costing you, and a 90-day plan to fix it. Not generic advice — an actual read on your business.

It's free to run. Takes about two minutes.

[button: Run your free Growth Scan]({{bookingLink}})

Curious what it'll tell you.

{{owner.firstName}}`;

const EMAIL_4_BUSINESS = `Hi {{contact.firstName}},

Here's something I've watched happen over and over, in my own business and in the ones I've worked with: people spend years — sometimes a decade — solving the wrong problem really, really well.

They optimize their ads when the real issue is their offer. They redesign their website when the real issue is nobody follows up with a lead after day one. They hire more people when the real issue is there's no system for the people they already have.

None of that is stupidity. It's just what happens without a clear diagnosis. You fix what you can see, not necessarily what's actually holding you back.

That's the entire reason I built the Growth Scan the way I did — it doesn't guess, and it doesn't hand you a generic checklist. It looks at your actual business and tells you the one constraint that matters most right now, so you stop spending years on the wrong fix.

If you haven't run yours yet:

[button: Run your free Growth Scan]({{bookingLink}})

{{owner.firstName}}`;

const EMAIL_5_BUSINESS = `Hi {{contact.firstName}},

Quick honest take: AI isn't the answer to growing your business. Better decisions are. AI is just one tool that can help you make them faster, if you already know what you're deciding.

That distinction matters more than people think. A lot of what's being sold right now is "AI will figure it out for you" — and that's backwards. The businesses that actually grow are the ones where the owner has clarity on priorities first, then uses whatever tools (AI included) to execute on that clarity faster.

That's the role Ascend plays for me — not a magic answer machine, but something that helps prioritize. It looks at everything happening in your business and tells you what actually matters most right now, so your time and your team's time goes toward the thing that moves the needle instead of the thing that's just loud.

Still free to try, still about two minutes:

[button: Run your free Growth Scan]({{bookingLink}})

{{owner.firstName}}`;

const EMAIL_6_BUSINESS = `Hi {{contact.firstName}},

I want to properly introduce you to what I've been building, since the last few emails have been circling it.

It's called DivineX, and Ascend is the first real expression of the next chapter of my mission — the same one that had me writing to you years ago about clarity, purpose, and growth. It just also happens to help businesses grow now, not just people.

Ascend starts with a free Growth Scan: a real diagnosis of your biggest growth constraint, not generic advice. From there it builds out a 90-day roadmap — the lead magnets, the messaging, the follow-up systems — that most businesses are missing entirely.

If you run your business and you've been putting off getting a clear, honest read on what's actually holding it back, this is that.

[button: Run your free Growth Scan]({{bookingLink}})

Whatever it tells you, I'd genuinely like to know what you find.

{{owner.firstName}}`;

// Personal-growth track (clicked "Working on personal growth")
const EMAIL_3_PERSONAL = `Hi {{contact.firstName}},

You told me you're focused on personal growth right now, so that's exactly where I want to meet you.

I'm not going to pitch you anything today. What I want to say is simpler: whatever season you're in — rebuilding, healing, figuring out who you are outside of what you do — that work matters, and it's not separate from everything else in your life. It's the foundation everything else gets built on.

The thread that's run through everything I've ever written to you is the same one I still believe in most: clarity about who you are and what you're actually here to do changes everything downstream of it. Not as a slogan — as something I've had to relearn myself, more than once.

So here's my honest question for you: what does growth actually look like for you right now? Reply and tell me — I read these.

{{owner.firstName}}`;

const EMAIL_4_PERSONAL = `Hi {{contact.firstName}},

It's been a few weeks since I asked what growth looks like for you right now — no pressure if you didn't reply, I know life gets full.

I wanted to share something small, not a pitch: lately, the "next chapter of my mission" I mentioned a while back has started reaching people who are building businesses too, not just people doing the kind of inner work you're focused on. It surprised me a little, honestly — I didn't expect the same thread (clarity first, then everything else) to matter just as much in a spreadsheet as it does in a journal entry.

I'm not bringing it up to redirect you toward it. Your path right now doesn't need a business tool attached to it. I just wanted you to know the mission is still the same one, even where it shows up in unexpected places.

Whatever you're working through — I'm glad you're still here.

{{owner.firstName}}`;

// Transition track (clicked "Still figuring out what's next")
const EMAIL_3_TRANSITION = `Hi {{contact.firstName}},

Feeling stuck isn't failure. Sometimes it's just transition — and transition doesn't announce itself, it just quietly makes everything that used to feel certain feel unclear instead.

I know that place. Years ago I left engineering with no real plan for what came next — just a growing sense that the path I was on wasn't actually mine. What followed wasn't a straight line to clarity. It was a long stretch of not knowing, second-guessing, starting things that didn't work, and slowly, unglamorously, figuring out what I actually wanted to build my life around.

If I'm honest, the not-knowing lasted a lot longer than I expected it to. What got me through it wasn't a system or a five-step plan — it was being willing to stay honest about where I actually was, instead of performing certainty I didn't feel.

I don't have a neat answer for you, and I'm not going to pretend I do. But I'd genuinely like to hear where you're at. Just reply and tell me your story — what's the "next" you're trying to figure out?

{{owner.firstName}}`;

// "Both" track — gets both worlds, converges into Ascend naturally
const EMAIL_3_BOTH = `Hi {{contact.firstName}},

You said "honestly, both" — and I think that's the most honest answer of the four, because for most of us, personal growth and building something in the world were never actually separate.

The business you build ends up being an extension of the person you've become. Every constraint you hit in your work is usually a mirror of something you're still working through personally — clarity, confidence, follow-through, what you believe you deserve. I've watched that be true in my own life more times than I'd like to admit.

So over the next couple emails I want to speak to both sides at once — where you're at personally, and where that shows up in what you're building. No false split between the two.

More soon.

{{owner.firstName}}`;

const EMAIL_4_BOTH = `Hi {{contact.firstName}},

Here's the pattern I keep seeing, in my own life and in everyone I've worked with who's serious about both personal growth and building something real: the business stalls exactly where the person hasn't grown yet.

Not always obviously. It shows up as "I can't find the right people," or "I know what to do but I don't do it," or "the offer isn't landing." Underneath almost all of it is something more personal — clarity about who you are, what you actually believe you're capable of, what you're willing to be honest about.

That's not a reason to wait until you're "ready" to build. It's the opposite — building is often exactly where that growth happens, if you let it. The business becomes the mirror, and the mirror becomes the teacher.

That's the lens I bring to everything now, including the next chapter of my mission — which I'll properly introduce you to next.

{{owner.firstName}}`;

const EMAIL_5_BOTH = `Hi {{contact.firstName}},

I want to introduce you to the next chapter of my mission — it's called DivineX, and Ascend is its first real expression.

Given everything I've said the last couple emails about the business being a mirror for the person — Ascend actually starts from a place I think you'll appreciate: honest clarity, not hype. You give it your website and a few details, and it hands you back a real diagnosis of your biggest growth constraint, then a 90-day roadmap to work through it.

It's not separate from the personal-growth thread that's run through everything I've sent you over the years. It's the same clarity-first philosophy, just now also pointed at the thing you're building in the world.

[button: Run your free Growth Scan]({{bookingLink}})

Whatever it shows you, I'd love to hear what you find — and how it lands against everything else you've been working through.

{{owner.firstName}}`;

// ─── Node graph ─────────────────────────────────────────────────────────────
// id -> node. Kept flat + explicit rather than a builder helper — this is a
// one-off content deployment, not reusable graph-construction code.
const WAIT_DAYS = (d: number) => ({ seconds: d * 24 * 60 * 60 });

const nodes: Record<string, unknown> = {
  n1_email1: { id: "n1_email1", type: "send_email", config: { subject: "It's been a while", body: EMAIL_1 }, next: "n2_wait1" },
  n2_wait1: { id: "n2_wait1", type: "wait", config: WAIT_DAYS(3), next: "n3_email2" },
  n3_email2: { id: "n3_email2", type: "send_email", config: { subject: "One thing changed everything for me", body: EMAIL_2 }, next: "n4_wait2" },
  n4_wait2: { id: "n4_wait2", type: "wait", config: WAIT_DAYS(2), next: "n5_check_both" },

  n5_check_both: { id: "n5_check_both", type: "if_else", config: { conditions: { all: [{ field: "tags", op: "has_tag", value: TAG_BOTH }] } }, branches: { whenTrue: "n_both_1", whenFalse: "n6_check_business" } },
  n6_check_business: { id: "n6_check_business", type: "if_else", config: { conditions: { all: [{ field: "tags", op: "has_tag", value: TAG_BUSINESS }] } }, branches: { whenTrue: "n_biz_1", whenFalse: "n7_check_personal" } },
  n7_check_personal: { id: "n7_check_personal", type: "if_else", config: { conditions: { all: [{ field: "tags", op: "has_tag", value: TAG_PERSONAL }] } }, branches: { whenTrue: "n_pers_1", whenFalse: "n8_check_transition" } },
  n8_check_transition: { id: "n8_check_transition", type: "if_else", config: { conditions: { all: [{ field: "tags", op: "has_tag", value: TAG_TRANSITION }] } }, branches: { whenTrue: "n_trans_1", whenFalse: null } },

  // Business track
  n_biz_1: { id: "n_biz_1", type: "send_email", config: { subject: "What I've been building", body: EMAIL_3_BUSINESS }, next: "n_biz_wait_1" },
  n_biz_wait_1: { id: "n_biz_wait_1", type: "wait", config: WAIT_DAYS(3), next: "n_biz_2" },
  n_biz_2: { id: "n_biz_2", type: "send_email", config: { subject: "Solving the wrong problem, really well", body: EMAIL_4_BUSINESS }, next: "n_biz_wait_2" },
  n_biz_wait_2: { id: "n_biz_wait_2", type: "wait", config: WAIT_DAYS(3), next: "n_biz_3" },
  n_biz_3: { id: "n_biz_3", type: "send_email", config: { subject: "AI isn't the answer. Better decisions are.", body: EMAIL_5_BUSINESS }, next: "n_biz_wait_3" },
  n_biz_wait_3: { id: "n_biz_wait_3", type: "wait", config: WAIT_DAYS(3), next: "n_biz_4" },
  n_biz_4: { id: "n_biz_4", type: "send_email", config: { subject: "Meet Ascend", body: EMAIL_6_BUSINESS }, next: null },

  // Personal-growth track
  n_pers_1: { id: "n_pers_1", type: "send_email", config: { subject: "What does growth look like for you right now?", body: EMAIL_3_PERSONAL }, next: "n_pers_wait_1" },
  n_pers_wait_1: { id: "n_pers_wait_1", type: "wait", config: WAIT_DAYS(14), next: "n_pers_2" },
  n_pers_2: { id: "n_pers_2", type: "send_email", config: { subject: "Still here", body: EMAIL_4_PERSONAL }, next: null },

  // Transition track
  n_trans_1: { id: "n_trans_1", type: "send_email", config: { subject: "Feeling stuck isn't failure", body: EMAIL_3_TRANSITION }, next: null },

  // Both track
  n_both_1: { id: "n_both_1", type: "send_email", config: { subject: "Honestly, both", body: EMAIL_3_BOTH }, next: "n_both_wait_1" },
  n_both_wait_1: { id: "n_both_wait_1", type: "wait", config: WAIT_DAYS(3), next: "n_both_2" },
  n_both_2: { id: "n_both_2", type: "send_email", config: { subject: "The business stalls exactly where the person hasn't grown yet", body: EMAIL_4_BOTH }, next: "n_both_wait_2" },
  n_both_wait_2: { id: "n_both_wait_2", type: "wait", config: WAIT_DAYS(3), next: "n_both_3" },
  n_both_3: { id: "n_both_3", type: "send_email", config: { subject: "Meet Ascend", body: EMAIL_5_BOTH }, next: null },
};

const EMAIL_COUNT = Object.values(nodes).filter((n) => (n as { type: string }).type === "send_email").length;

async function main() {
  console.log(`Reconnect Series — ${Object.keys(nodes).length} nodes, ${EMAIL_COUNT} emails, dry-run=${DRY_RUN}`);
  console.log("Target sub-account:", SUB_ACCOUNT_ID);
  console.log("Kickoff tag (apply to audience to enroll):", TAG_KICKOFF);

  if (DRY_RUN) {
    console.log("\n--- DRY RUN: node ids + subjects only. Re-run with --execute to write the draft Workflow. ---");
    for (const [id, n] of Object.entries(nodes)) {
      const node = n as { type: string; config: Record<string, unknown> };
      console.log(`${id} [${node.type}]`, node.type === "send_email" ? node.config.subject : "");
    }
    return;
  }

  const subSnap = await db.doc(`subAccounts/${SUB_ACCOUNT_ID}`).get();
  if (!subSnap.exists) throw new Error(`Sub-account ${SUB_ACCOUNT_ID} not found`);
  const agencyId = subSnap.data()!.agencyId as string;

  const ref = db.collection("workflows").doc();
  await ref.set({
    subAccountId: SUB_ACCOUNT_ID,
    agencyId,
    createdByUid: "seed-script",
    name: "DivineX Reconnect Series",
    status: "draft",
    trigger: {
      type: "contact.tag.added",
      filters: { all: [{ field: "tags", op: "has_tag", value: TAG_KICKOFF }] },
    },
    startNodeId: "n1_email1",
    nodes,
    stats: { enrolled: 0, completed: 0 },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log("\nCreated DRAFT workflow:", ref.id);
  console.log("Review it in the dashboard, then flip status to 'active' when ready.");
  console.log(`To enroll the dormant list: bulk-add the tag "${TAG_KICKOFF}" to those contacts (CSV import mapsTo tags, or bulk-tag action).`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
