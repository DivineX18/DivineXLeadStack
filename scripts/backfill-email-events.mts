/**
 * Recover the email history the log never captured.
 *
 * The sent-email log starts the day it shipped, so everything a team sent
 * before that is absent from the dashboard. It is not lost, though: every
 * manual send already wrote an `email_sent` activity on the contact, and
 * every bulk send already wrote a `broadcasts/{id}/sends/{contactId}` row.
 * Both carry enough to reconstruct a log row: recipient, subject, who sent
 * it, when, and the provider message id.
 *
 * THE ONE RULE THIS SCRIPT EXISTS TO RESPECT: a recovered row is marked
 * `backfilled: true` and never claims engagement. Nothing was watching those
 * sends, so their opens are UNKNOWN, not zero. Writing them as plain rows
 * would quietly drag every open rate towards zero and make a team look worse
 * than it actually performed, which is worse than having no history at all.
 *
 * Idempotent: the doc id is the provider message id, the same key the live
 * path uses, so re-running updates in place and can never duplicate. A row
 * already written by the live path is left completely alone — it has real
 * engagement data this script must not overwrite.
 *
 * Usage:
 *   npx tsx@4 scripts/backfill-email-events.mts --dry
 *   npx tsx@4 scripts/backfill-email-events.mts --sub=<subAccountId>
 *   npx tsx@4 scripts/backfill-email-events.mts --all
 */
import { readFileSync } from "node:fs";
import admin from "firebase-admin";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  }),
});
const db = admin.firestore();

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const ALL = args.includes("--all");
const ONE = args.find((a) => a.startsWith("--sub="))?.slice("--sub=".length);

if (!ALL && !ONE) {
  console.error("Pass --sub=<subAccountId> or --all. Add --dry to preview.");
  process.exit(1);
}

const subIds: string[] = ONE
  ? [ONE]
  : (await db.collection("subAccounts").get()).docs.map((d) => d.id);

let created = 0;
let skippedLive = 0;
let skippedNoId = 0;
let scanned = 0;

/** Resolve a uid to an email once, so a 5,000-row backfill does not make
 *  5,000 identical Auth calls. */
const emailCache = new Map<string, string | null>();
async function emailForUid(uid: string | null): Promise<string | null> {
  if (!uid || uid.startsWith("system:") || uid.startsWith("import:")) return null;
  if (emailCache.has(uid)) return emailCache.get(uid) ?? null;
  let email: string | null = null;
  try {
    email = (await admin.auth().getUser(uid)).email ?? null;
  } catch {
    // A removed teammate's sends still belong in the log; they just lose the
    // friendly label.
  }
  emailCache.set(uid, email);
  return email;
}

/**
 * Write one recovered row, unless the live path already wrote it.
 * `merge` is deliberately NOT used: a live row carries real engagement data
 * and must not be touched by a reconstruction.
 */
async function writeRow(messageId: string, data: Record<string, unknown>) {
  const ref = db.collection("emailEvents").doc(messageId);
  const existing = await ref.get();
  if (existing.exists && existing.data()?.backfilled !== true) {
    skippedLive++;
    return;
  }
  if (DRY) {
    created++;
    return;
  }
  await ref.set(data);
  created++;
}

for (const subAccountId of subIds) {
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) continue;
  const agencyId = (subSnap.data()?.agencyId as string) ?? "";

  // ---- Source 1: per-contact `email_sent` activities (manual + quote sends)
  const contacts = await db
    .collection("contacts")
    .where("subAccountId", "==", subAccountId)
    .get();

  for (const c of contacts.docs) {
    const contact = c.data();
    const acts = await c.ref
      .collection("activities")
      .where("type", "==", "email_sent")
      .get();

    for (const a of acts.docs) {
      scanned++;
      const act = a.data();
      const messageId = act.meta?.messageId as string | undefined;
      if (!messageId) {
        // Pre-dates the messageId being recorded. Without it there is no
        // stable key, so a re-run would duplicate the row. Skipped rather
        // than invented.
        skippedNoId++;
        continue;
      }
      const subject =
        (act.meta?.subject as string | undefined) ??
        String(act.content ?? "").replace(/^Email:\s*/, "") ??
        "(no subject)";

      await writeRow(messageId, {
        messageId,
        agencyId: contact.agencyId ?? agencyId,
        subAccountId,
        contactId: c.id,
        toEmail: contact.email ?? "",
        subject,
        sentByUid: act.createdBy ?? null,
        sentByEmail: await emailForUid(act.createdBy ?? null),
        source: "manual",
        sourceId: null,
        replyTo: null,
        status: "sent",
        sentAt: act.createdAt ?? null,
        openedAt: null,
        clickedAt: null,
        bouncedAt: null,
        complainedAt: null,
        openCount: 0,
        clickCount: 0,
        failureDetail: null,
        backfilled: true,
        backfillSource: "activity",
      });
    }
  }

  // ---- Source 2: broadcast send rows (bulk email)
  const broadcasts = await db
    .collection("broadcasts")
    .where("subAccountId", "==", subAccountId)
    .get();

  for (const b of broadcasts.docs) {
    const bc = b.data();
    const sends = await b.ref.collection("sends").get();
    for (const s of sends.docs) {
      scanned++;
      const row = s.data();
      const messageId = row.resendMessageId as string | undefined;
      // Skipped and failed rows never got a message id, and a send that never
      // happened does not belong in a log of what went out.
      if (!messageId) {
        skippedNoId++;
        continue;
      }
      await writeRow(messageId, {
        messageId,
        agencyId: row.agencyId ?? agencyId,
        subAccountId,
        contactId: row.contactId ?? s.id,
        toEmail: row.toEmail ?? "",
        subject: bc.subject ?? bc.templateName ?? "(bulk email)",
        // A broadcast is not attributable to a person the way a one-to-one
        // email is: it was configured once and fanned out by the queue.
        sentByUid: null,
        sentByEmail: null,
        source: "broadcast",
        sourceId: b.id,
        replyTo: null,
        status: "sent",
        sentAt: row.sentAt ?? null,
        openedAt: null,
        clickedAt: null,
        bouncedAt: null,
        complainedAt: null,
        openCount: 0,
        clickCount: 0,
        failureDetail: null,
        backfilled: true,
        backfillSource: "broadcast",
      });
    }
  }
}

console.log(
  `${DRY ? "[dry run] " : ""}scanned ${scanned} historical records across ${subIds.length} workspace(s)\n` +
    `  recovered:          ${created}\n` +
    `  left alone (live):  ${skippedLive}\n` +
    `  no message id:      ${skippedNoId}`,
);
if (DRY) console.log("\nNothing was written. Re-run without --dry to apply.");
process.exit(0);
