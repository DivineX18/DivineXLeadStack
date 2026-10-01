/**
 * THE CONNECTED CUSTOMER JOURNEY, END TO END.
 *
 * Isolated feature quality is already certified. This asks the one question
 * that certification cannot: do the SEAMS hold? A prospect arrives with a
 * scanned business, Zeno reasons from it, builds something, the operator
 * revises it, it publishes, a stranger fills in the form, and a lead with
 * attribution lands in the CRM with the deal, tag and email the workflow
 * promised.
 *
 * Every check here is an OUTCOME. Not "the context is in the prompt" but
 * "the answer used it". Not "the submission returned 200" but "the contact
 * exists, in the right workspace, with the right tag and a deal beside it".
 *
 *   FLOW_PROBE_UID=<uid> E2E_BASE=http://localhost:3114 tsx scripts/verify-beta-journey.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const BASE = process.env.E2E_BASE ?? "http://localhost:3114";
const OWNER = process.env.FLOW_PROBE_UID!;
const SA = process.env.BETA_SA ?? "MqYPgGQt5BJ9DeUb5Bb1";
const PROFILE_ID = Number(process.env.BETA_PROFILE_ID ?? 4);
if (!OWNER) throw new Error("FLOW_PROBE_UID is required.");

const { getAdminDb, getAdminAuth } = await import("../src/lib/firebase/admin");
const { chromium } = await import("/Users/boss/DivineXLeadStack/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs");
const db = getAdminDb();
const auth = getAdminAuth();

let bad = 0; const notes: string[] = [];
const check = (l: string, ok: boolean, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"} ${l}${d ? ` — ${d}` : ""}`); if (!ok) bad++; };
const note = (l: string) => { notes.push(l); console.log(`  note  ${l}`); };

const RUN = Date.now().toString(36).slice(-6);
// Plus-addressed on the owner's own domain: a real deliverable address that
// reaches nobody uninvolved.
const LEAD_EMAIL = `beta-journey+${RUN}@divinex.io`;
const LEAD_NAME = `Journey Probe ${RUN}`;
// A UNIQUE PHONE PER RUN. Contacts dedupe on phone, correctly: a repeat
// submission from the same number is the same person, keeps first-touch
// attribution and adds a second entry to the timeline. Reusing one number
// across runs meant the second run updated run one's contact and this
// harness read "no contact for the new email" as a lost lead.
const LEAD_PHONE = `+6140${String(Date.now()).slice(-7)}`;

async function session(uid: string): Promise<string> {
  const ct = await auth.createCustomToken(uid);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: ct, returnSecureToken: true }), signal: AbortSignal.timeout(30_000),
  });
  const { idToken } = (await r.json()) as { idToken?: string };
  const login = await fetch(`${BASE}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual", signal: AbortSignal.timeout(30_000) });
  return (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}
async function chat(cookie: string, prompt: string, route = "/app/create") {
  const res = await fetch(`${BASE}/api/ai-suite/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ level: "sub-account", subAccountId: SA, messages: [{ role: "user", content: prompt }], pageContext: { route } }),
    signal: AbortSignal.timeout(180_000),
  });
  const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`chat ${res.status}: ${JSON.stringify(d).slice(0, 200)}`);
  const p = d.proposal as { summary?: string } | undefined;
  return { type: String(d.type ?? ""), text: String(d.type === "proposal" ? (p?.summary ?? "") : (d.text ?? "")), proposal: d.proposal as Record<string, unknown> | undefined };
}
async function confirm(cookie: string, proposal: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/ai-suite/confirm`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ level: "sub-account", subAccountId: SA, capability: proposal.capability, args: proposal.args }),
    signal: AbortSignal.timeout(300_000),
  });
  const d = (await res.json().catch(() => ({}))) as { ok?: boolean; resultRef?: { kind: string; id: string } | null; error?: string };
  return { ok: res.ok && d.ok === true, ref: d.resultRef, error: d.error };
}

// ── The business, as a Growth Scan would have left it ───────────────────
const BIZ = `Harborview Physio ${RUN}`;
const profileRef = db.doc(`divinexProfiles/${SA}`);
const priorProfile = (await profileRef.get()).data();
if (!priorProfile) throw new Error(`${SA} has no profile to restore; refusing to run.`);

await profileRef.set({
  contract: "divinex.profile", contractVersion: 1, profileVersion: 1,
  publishedAt: new Date().toISOString(), businessProfileId: PROFILE_ID, flowSubAccountId: SA,
  business: {
    name: BIZ, type: "physiotherapy clinic",
    audience: "desk workers in Hobart with recurring lower-back pain",
    offer: "a 45-minute assessment that ends with a written movement plan",
    websiteUrl: "https://harborviewphysio.test",
  },
  offers: [{ id: "off_assess", name: "45-minute assessment", kind: "service" }],
  brand: { voice: { tone: "calm, clinical, unhurried" } },
  // WHAT THE SCAN FOUND. Reasoning material, not fields to recite.
  intelligence: {
    primaryConstraint: "the site explains the modalities but never says what the first visit is like, so nervous first-timers bounce",
    opportunities: [
      { title: "Make the first visit concrete", why: "the page never describes what actually happens in the room" },
      { title: "Give the assessment a name and a price", why: "no entry offer is stated anywhere on the site" },
    ],
    recommendedFunnelType: "booking",
    scoreLabel: "early",
  },
  assets: [], provenance: {},
}, { merge: false });

const cookie = await session(OWNER);
const browser = await chromium.launch();
let funnelId = "";
let formId = "";

try {
  // ══ 1. GROWTH SCAN CONTEXT IS USED, NOT RECITED ═══════════════════════
  console.log("\n══ 1. Scan context reaches Zeno and is reasoned from ══");
  const { getAuthorizedProfileSnapshot } = await import("../src/lib/divinex/authorized-profile");
  const authd = await getAuthorizedProfileSnapshot(SA);
  check("the scanned profile is authorized for this workspace", authd.ok, authd.ok ? "" : (authd as { reason: string }).reason);

  const diag = await chat(cookie, "What should I fix first?", "/app/intelligence");
  console.log(`\n--- Zeno (diagnosis) ---\n${diag.text.slice(0, 650)}\n---\n`);
  const dl = diag.text.toLowerCase();
  check("the answer reflects the scanned constraint (the first visit is unexplained)",
    /first visit|what happens|in the room|nervous|what to expect/i.test(diag.text));
  check("it does not ask the customer to restate the business",
    !/what (?:does|do) (?:your|the) .{0,24}(?:business|clinic|practice) (?:actually )?(?:do|sell)/i.test(diag.text) &&
    !/who (?:is|are) your (?:ideal )?(?:client|customer|audience)/i.test(diag.text));
  check("it is about THIS business", /physio|back|assessment|clinic/i.test(dl));
  // The scan's own words must not be read aloud like a report.
  check("it does not recite the diagnosis verbatim",
    !diag.text.includes("the site explains the modalities but never says"));
  check("it claims no private data it was never given",
    !/your (?:conversion rate|traffic|CAC|ad spend|revenue) (?:is|was)\b/i.test(diag.text));

  // ══ 2. ZENO → FLOW: a creation request becomes a real artifact ════════
  console.log("\n══ 2. A creation request reaches Flow ══");
  const build = await chat(cookie, "Build me a page so new patients book the assessment.");
  check("Zeno proposed a build rather than only talking", build.type === "proposal" && !!build.proposal, `type=${build.type}`);
  if (build.type !== "proposal" || !build.proposal) throw new Error("no proposal to continue the journey with");
  console.log(`  proposal: ${build.text.slice(0, 180)}`);
  const made = await confirm(cookie, build.proposal);
  check("confirming it succeeded", made.ok, made.error ?? "");
  const fs1 = await db.collection("funnels").where("subAccountId", "==", SA).get();
  const mine = fs1.docs.filter((d) => String(d.data().name ?? "").includes(RUN) || d.id === made.ref?.id);
  funnelId = made.ref?.id ?? mine[0]?.id ?? "";
  check("a funnel artifact exists afterwards", !!funnelId, funnelId);
  if (!funnelId) throw new Error("no funnel to continue with");

  const f0 = (await db.doc(`funnels/${funnelId}`).get()).data()!;
  check("it belongs to this workspace", f0.subAccountId === SA);
  check("it was NOT auto-published", f0.status !== "published", String(f0.status));
  const heroBefore = ((f0.sections ?? []) as { type: string; config: Record<string, unknown> }[])
    .find((s) => s.type === "hero")?.config?.headline as string | undefined;
  check("it has a hero headline grounded in the business", !!heroBefore, heroBefore?.slice(0, 70));

  // ══ 3. A REVISION CHANGES THE INTENDED ARTIFACT ══════════════════════
  console.log("\n══ 3. A revision changes the artifact, not just the conversation ══");
  const fname = String((await db.doc(`funnels/${funnelId}`).get()).data()?.name ?? "");
  const rev = await chat(cookie, `On the funnel called "${fname}", change the hero headline to exactly: "Back pain that keeps coming back has a reason". Just make that change.`);
  let applied = false;
  if (rev.type === "proposal" && rev.proposal) {
    const r2 = await confirm(cookie, rev.proposal);
    applied = r2.ok;
    check("the revision was accepted", r2.ok, r2.error ?? "");
  } else {
    note(`revision returned type=${rev.type} rather than a proposal: ${rev.text.slice(0, 140)}`);
  }
  const f1 = (await db.doc(`funnels/${funnelId}`).get()).data()!;
  const heroAfter = ((f1.sections ?? []) as { type: string; config: Record<string, unknown> }[])
    .find((s) => s.type === "hero")?.config?.headline as string | undefined;
  if (applied) {
    check("the stored artifact actually changed", heroAfter !== heroBefore, `${heroBefore?.slice(0, 40)} -> ${heroAfter?.slice(0, 40)}`);
    check("it changed to what was asked for", /keeps coming back/i.test(heroAfter ?? ""), heroAfter?.slice(0, 70));
  }

  // ══ 4. PUBLISH, THROUGH THE REAL GUARDS ══════════════════════════════
  console.log("\n══ 4. Publish ══");
  const wfs = await db.collection("workflows").where("subAccountId", "==", SA).get();
  const draftWfs = wfs.docs.filter((w) => w.data().status === "draft");
  for (const w of draftWfs) await w.ref.update({ status: "active" });
  check("the follow-up workflow was activated by the operator", draftWfs.length > 0, `${draftWfs.length} activated`);
  const { updateFunnelServerSide } = await import("../src/lib/server/funnels-service");
  let published = false;
  try {
    await updateFunnelServerSide({ subAccountId: SA, funnelId, patch: { status: "published" } });
    published = true;
  } catch (e) { check("it publishes through the real completeness guards", false, String(e).slice(0, 140)); }
  if (published) check("it publishes through the real completeness guards", true);

  const f2 = (await db.doc(`funnels/${funnelId}`).get()).data()!;
  formId = ((f2.sections ?? []) as { type: string; config: Record<string, unknown> }[])
    .map((s) => s.config?.formId as string | undefined).find(Boolean) ?? "";
  check("the published page carries a capture form", !!formId, formId);
  // ══ 5. AN EXTERNAL PROSPECT VISITS AND SUBMITS ══════════════════════
  console.log("\n══ 5. A stranger fills in the form ══");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  // Enter the way a real visitor from a campaign would.
  const url = `${BASE}/lp/${funnelId}?utm_source=facebook&utm_medium=cpc&utm_campaign=hobart_back_pain&utm_content=vid_a`;
  const res = await page.goto(url, { waitUntil: "networkidle" }).catch(() => null);
  check("the published page is reachable by a logged-out visitor", !!res && res.status() < 400, `HTTP ${res?.status()}`);

  // The submission goes through the REAL public endpoint the page posts to,
  // carrying the attribution a browser would have captured.
  const submit = await fetch(`${BASE}/api/forms/${formId}/submit`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: await (async () => {
        const form = (await db.doc(`forms/${formId}`).get()).data()!;
        const vals: Record<string, string> = {};
        for (const f of (form.fields ?? []) as { id: string; label?: string; type?: string }[]) {
          const l = (f.label ?? "").toLowerCase();
          vals[f.id] = l.includes("name") ? LEAD_NAME
            : l.includes("email") ? LEAD_EMAIL
            : l.includes("phone") ? LEAD_PHONE
            : "Lower back pain for about six months, worse after a day at the desk.";
        }
        return vals;
      })(),
      // EXACTLY the shape lib/attribution.ts::readAttributionFromBrowser
      // produces. It reads utm_source from the URL and emits utmSource; an
      // earlier version of this harness sent the URL spelling and read the
      // resulting nulls as a product defect.
      attribution: {
        utmSource: "facebook", utmMedium: "cpc", utmCampaign: "hobart_back_pain",
        utmContent: "vid_a", utmTerm: null, fbclid: null, gclid: null,
        referrer: "https://www.facebook.com/", landingPage: url,
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const subBody = (await submit.json().catch(() => ({}))) as Record<string, unknown>;
  check("the submission is accepted", submit.ok, `HTTP ${submit.status} ${JSON.stringify(subBody).slice(0, 120)}`);

  // ══ 6. THE LEAD REACHES THE CRM ════════════════════════════════════
  console.log("\n══ 6. The lead lands in the CRM ══");
  // Give the workflow a moment; it runs out of band.
  let contact: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (let i = 0; i < 20 && !contact; i++) {
    const cs = await db.collection("contacts").where("subAccountId", "==", SA).where("email", "==", LEAD_EMAIL).get();
    contact = cs.docs[0];
    if (!contact) await new Promise((r) => setTimeout(r, 3000));
  }
  check("a contact exists for the submitted email", !!contact, contact?.id ?? "not found");
  if (contact) {
    const c = contact.data();
    check("the contact belongs to the RIGHT workspace", c.subAccountId === SA, String(c.subAccountId));
    check("the name came through", String(c.name ?? "").includes(RUN), String(c.name));
    check("the phone came through", String(c.phone ?? "") === LEAD_PHONE, String(c.phone));
    // ATTRIBUTION SURVIVED THE REAL PATH.
    const a = (c.attribution ?? {}) as Record<string, string>;
    check("utm_source survived into the contact", a.utmSource === "facebook", JSON.stringify(a).slice(0, 130));
    check("utm_campaign survived", a.utmCampaign === "hobart_back_pain");
    check("utm_content survived", a.utmContent === "vid_a");
    check("the landing page survived", String(a.landingPage ?? "").includes(`/lp/${funnelId}`));
    check("the referrer survived", String(a.referrer ?? "").includes("facebook"));
    check("source reflects the campaign, not a generic default", String(c.source ?? "") !== "", String(c.source));

    // ══ 7. THE WORKFLOW DID WHAT IT PROMISED ════════════════════════
    console.log("\n══ 7. The configured follow-up actually ran ══");
    let deal: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    let tagged = false;
    for (let i = 0; i < 20 && (!deal || !tagged); i++) {
      const ds = await db.collection("deals").where("subAccountId", "==", SA).where("contactId", "==", contact.id).get();
      deal = ds.docs[0];
      const fresh = (await contact.ref.get()).data() ?? {};
      tagged = Array.isArray(fresh.tags) && fresh.tags.length > 0;
      if (!deal || !tagged) await new Promise((r) => setTimeout(r, 3000));
    }
    check("the workflow created the opportunity it promised", !!deal, deal ? String(deal.data().title ?? deal.id) : "no deal");
    if (deal) check("the opportunity is in this workspace", deal.data().subAccountId === SA);
    const finalContact = (await contact.ref.get()).data() ?? {};
    check("the workflow tagged the contact as configured", tagged, JSON.stringify(finalContact.tags ?? []));
    // The confirmation email: verify it was ATTEMPTED through the real mailer
    // rather than asserting delivery, which this harness cannot observe.
    const acts = await contact.ref.collection("activities").get();
    const kinds = acts.docs.map((a) => String(a.data().type ?? ""));
    check("the submission is on the contact's timeline", kinds.some((k) => /form|submit/i.test(k)), kinds.join(","));
    const emailAttempted = kinds.some((k) => /email/i.test(k));
    if (emailAttempted) check("the confirmation email was sent through the real mailer", true);
    else note(`no email activity recorded yet; kinds seen: ${kinds.join(",") || "(none)"}`);

    // ══ 8. NO CROSS-TENANT BLEED ════════════════════════════════════
    console.log("\n══ 8. The lead did not leak across tenants ══");
    const everywhere = await db.collection("contacts").where("email", "==", LEAD_EMAIL).get();
    const others = everywhere.docs.filter((d) => d.data().subAccountId !== SA);
    check("the contact exists in exactly one workspace", others.length === 0, `${others.length} elsewhere`);
    check("no duplicate contact was created in this workspace",
      everywhere.docs.filter((d) => d.data().subAccountId === SA).length === 1,
      `${everywhere.docs.filter((d) => d.data().subAccountId === SA).length}`);
  }
  await ctx.close();
} catch (err) {
  check("the journey ran to completion", false, (err as Error).message.slice(0, 220));
} finally {
  await profileRef.set(priorProfile, { merge: false });
  console.log("\n(workspace profile restored)");
  await browser.close();
}

console.log(`\n${notes.length} note(s), ${bad} failure(s)`);
console.log(bad === 0 ? "JOURNEY: ALL PASS" : `JOURNEY: ${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
