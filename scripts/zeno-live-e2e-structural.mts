import { ask, show, db, SA } from "./zeno-live-e2e.mts";
const { createFormServerSide } = await import("../src/lib/server/forms-service");
const { createGroupServerSide } = await import("../src/lib/server/community-service");
const { createSubscription } = await import("../src/lib/firestore/webhook-subscriptions");

const UID = "irkY5HKIzxb64l5qCyHroTrudJa2";
const AG = String((await db.doc(`subAccounts/${SA}`).get()).data()?.agencyId ?? "");
const made: string[] = [];
const STAMP = String(Date.now()).slice(-6);
const snap = async (p: string) => { const s = await db.doc(p).get(); return s.exists ? s.data()! : null; };
const cmp = (b: Record<string, unknown>, a: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) {
    const B = JSON.stringify(b[k]), A = JSON.stringify(a[k]);
    console.log(`    ${k.padEnd(14)} ${B === A ? "preserved" : `CHANGED ${String(B).slice(0,70)} -> ${String(A).slice(0,70)}`}`);
  }
};

try {
  // ---------------- COMMUNITY ----------------
  const g = await createGroupServerSide({ subAccountId: SA, agencyId: AG, createdByUid: UID,
    name: `ZENO E2E TEST - DELETE community ${STAMP}`, tagline: "Original tagline", about: "Temporary certification record.",
    access: "paid", priceCents: 4900, currency: "usd", joinPolicy: "approval" } as never);
  const gPath0 = (await db.doc(`communityGroups/${g.id}`).get()).exists ? `communityGroups/${g.id}` : `subAccounts/${SA}/communityGroups/${g.id}`;
  made.push(gPath0);
  const gPath = gPath0;
  const gB = (await snap(gPath))!;
  console.log(`\n=== COMMUNITY ${g.id}\nBEFORE tagline="${gB.tagline}" access=${gB.access} price=${gB.priceCents} join=${gB.joinPolicy}`);
  show("community: change the tagline only",
    await ask([`Change the tagline of the "ZENO E2E TEST - DELETE community ${STAMP}" community to "Where operators compare notes".`, "Yes, go ahead."], { autoConfirm: true }));
  const gA = (await snap(gPath))!;
  console.log(`AFTER  tagline="${gA.tagline}"`);
  console.log(`    tagline changed: ${gB.tagline !== gA.tagline}`);
  cmp(gB, gA, ["access", "priceCents", "currency", "joinPolicy", "slug", "name", "memberCount", "subAccountId"]);
} finally {
  for (const p of made) await db.doc(p).delete().catch(()=>{});
  console.log(`\ncleaned up ${made.length} temporary records`);
}
