/**
 * FOREIGN ID = MISSING ID, for every editor.
 *
 * Real records are created in one workspace, then each editor is called
 * with a DIFFERENT workspace in the context. The record must be refused,
 * must be left untouched, and the refusal must not reveal that it exists.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] ??= l.slice(i+1).trim().replace(/^["']|["']$/g,"");
}
const { getAdminDb } = await import("../src/lib/firebase/admin");
const { AI_SUITE_CAPABILITIES, CapabilityUserError } = await import("../src/lib/ai-suite/capabilities");
const db = getAdminDb();
const SA = "MEYB8CbWlE5fxAn3TJOp";
const FOREIGN = "zzz-not-this-workspace";
const AG = String((await db.doc(`subAccounts/${SA}`).get()).data()?.agencyId ?? "");
const UID = "irkY5HKIzxb64l5qCyHroTrudJa2";
const cap = (n: string) => AI_SUITE_CAPABILITIES.find((c) => c.name === n)!;
let fails = 0;
const ck = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` - ${d}` : ""}`); if (!ok) fails++; };

const made: string[] = [];
const attacker = { uid: UID, email: "x@example.com", displayName: "x", agencyId: AG, subAccountId: FOREIGN, subAccountRole: "admin" };

/** Words that would confirm the record exists to someone who cannot see it. */
const LEAKY = /ZENO E2E TEST|Original heading|Original tagline|example\.com\/zeno/i;

async function probe(label: string, capName: string, args: Record<string, unknown>, path: string) {
  const before = JSON.stringify((await db.doc(path).get()).data() ?? null);
  let outcome = "EXECUTED", message = "";
  try { await cap(capName).execute(attacker as never, args as never); }
  catch (e) { outcome = e instanceof CapabilityUserError ? "refused" : "threw"; message = e instanceof Error ? e.message : String(e); }
  const after = JSON.stringify((await db.doc(path).get()).data() ?? null);
  ck(`${label}: refused`, outcome === "refused", outcome === "EXECUTED" ? "IT WENT THROUGH" : message.slice(0, 60));
  ck(`${label}: record untouched`, before === after);
  ck(`${label}: refusal discloses nothing`, !LEAKY.test(message), message.slice(0, 80));
}

try {
  const { createTaskServerSide } = await import("../src/lib/server/tasks-service");
  const { createEventServerSide } = await import("../src/lib/server/events-service");
  const { createFormServerSide } = await import("../src/lib/server/forms-service");
  const { createBookingPageServerSide } = await import("../src/lib/server/booking-pages-service");
  const base = { subAccountId: SA, agencyId: AG, createdByUid: UID, mode: "live" as const };

  const t = await createTaskServerSide({ ...base, title: "ZENO E2E TEST - DELETE tenancy", notes: "", dueAt: new Date("2026-11-01T12:00:00Z"), contactId: null, dealId: null, eventId: null });
  made.push(`tasks/${t.id}`);
  await probe("task", "update_task", { taskId: t.id, title: "hijacked" }, `tasks/${t.id}`);

  const e = await createEventServerSide({ ...base, title: "ZENO E2E TEST - DELETE tenancy event", startAt: new Date("2026-11-01T12:00:00Z"), endAt: new Date("2026-11-01T12:30:00Z"), contactId: null, location: "", notes: "" });
  made.push(`events/${e.id}`);
  await probe("event", "update_event", { eventId: e.id, title: "hijacked" }, `events/${e.id}`);

  const f = await createFormServerSide({ subAccountId: SA, createdByUid: UID, name: "ZENO E2E TEST - DELETE tenancy form" });
  made.push(`forms/${f}`);
  await probe("form", "update_form", { formId: f, rename: "hijacked" }, `forms/${f}`);

  const SLUG = "zeno-e2e-tenancy-delete";
  await db.doc(`subAccounts/${SA}/bookingPages/${SLUG}`).delete().catch(()=>{});
  await createBookingPageServerSide({ subAccountId: SA, createdByUid: UID, data: {
    slug: SLUG, name: "ZENO E2E TEST - DELETE tenancy page", description: "", status: "draft",
    durationMinutes: 30, bufferMinutes: 0, timezone: "America/Chicago", visibleDays: 14,
    minNoticeHours: 1, maxPerDay: 5, workingHours: [{ dayOfWeek: 1, startMinute: 540, endMinute: 1020 }],
    intakeFields: [], remindersEnabled: false, reminderOffsetsMinutes: [], redirectAppendParams: false,
    confirmationMessage: "", redirectUrl: "", meetingUrl: "", logoUrl: "", accentColor: "", hosts: [] } });
  made.push(`subAccounts/${SA}/bookingPages/${SLUG}`);
  await probe("booking page", "update_booking_page", { bookingPageId: SLUG, durationMinutes: 90 }, `subAccounts/${SA}/bookingPages/${SLUG}`);

  // The same page named by its real public link, from the wrong workspace.
  await probe("booking page (by public link)", "update_booking_page",
    { bookingPageId: SLUG, linkWorkspaceId: SA, durationMinutes: 90 }, `subAccounts/${SA}/bookingPages/${SLUG}`);

  const wid = "zeno-e2e-tenancy-site";
  await db.doc(`subAccounts/${SA}/website/${wid}`).set({ name: "ZENO E2E TEST - DELETE tenancy site", status: "draft",
    jobId: null, liveUrl: null, config: { heading: "Original heading" }, createdAt: new Date(), updatedAt: new Date() });
  made.push(`subAccounts/${SA}/website/${wid}`);
  await probe("website", "update_website", { siteId: wid, heading: "hijacked" }, `subAccounts/${SA}/website/${wid}`);

  const mRef = db.doc(`subAccounts/${SA}/subAccountMembers/zeno-e2e-tenancy-uid`);
  await mRef.set({ uid: "zeno-e2e-tenancy-uid", email: "zeno-e2e-tenancy@example.com", displayName: "ZENO E2E TEST - DELETE",
    role: "collaborator", status: "active", subAccountId: SA, createdAt: new Date(), updatedAt: new Date() });
  made.push(`subAccounts/${SA}/subAccountMembers/zeno-e2e-tenancy-uid`);
  await probe("member", "update_member_role", { uid: "zeno-e2e-tenancy-uid", role: "admin" }, `subAccounts/${SA}/subAccountMembers/zeno-e2e-tenancy-uid`);
  const { createDealServerSide } = await import("../src/lib/server/deals-service");
  const { createGroupServerSide } = await import("../src/lib/server/community-service");
  const { createSubscription } = await import("../src/lib/firestore/webhook-subscriptions");

  const cRef = db.collection("contacts").doc();
  await cRef.set({ name: "ZENO E2E TEST - DELETE tenancy", email: `zeno-tenancy-${Date.now()}@example.com`,
    phone: "", company: "", source: "manual", tags: [], subAccountId: SA, agencyId: AG,
    createdByUid: UID, mode: "live", createdAt: new Date(), updatedAt: new Date() });
  made.push(`contacts/${cRef.id}`);
  const d = await createDealServerSide({ ...base, title: "ZENO E2E TEST - DELETE tenancy deal", value: 100,
    currency: "USD", contactId: cRef.id, stageId: "new", priority: "medium" });
  made.push(`deals/${d.id}`);
  await probe("deal", "move_deal_stage", { dealId: d.id, stageId: "won" }, `deals/${d.id}`);

  const sub = await createSubscription({ subAccountId: SA, agencyId: AG, mode: "test",
    url: "https://example.com/zeno-e2e-tenancy", description: "ZENO E2E TEST - DELETE tenancy",
    events: ["contact.created"], signingSecret: "whsec_zeno_tenancy" } as never);
  made.push(`subAccounts/${SA}/webhookSubscriptions/${sub.id}`);
  await probe("webhook", "update_webhook", { webhookId: sub.id, status: "paused" },
    `subAccounts/${SA}/webhookSubscriptions/${sub.id}`);

  const g = await createGroupServerSide({ subAccountId: SA, agencyId: AG, createdByUid: UID,
    name: `ZENO E2E TEST - DELETE tenancy community ${Date.now()}`, tagline: "Original tagline",
    about: "", access: "paid", priceCents: 1000, currency: "usd", joinPolicy: "approval" } as never);
  const gPath = (await db.doc(`communityGroups/${g.id}`).get()).exists
    ? `communityGroups/${g.id}` : `subAccounts/${SA}/communityGroups/${g.id}`;
  made.push(gPath);
  await probe("community", "update_community", { groupId: g.id, tagline: "hijacked" }, gPath);

} finally {
  for (const p of made) await db.doc(p).delete().catch(()=>{});
  console.log(`\ncleaned up ${made.length} temporary records`);
  console.log(fails === 0 ? "ALL PASS" : `${fails} FAILED`);
  process.exit(fails ? 1 : 0);
}
