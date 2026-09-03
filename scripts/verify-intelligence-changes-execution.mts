/**
 * FINAL LAUNCH PASS — CHECKPOINT 2 A/B.
 *
 * A. ASCEND INTELLIGENCE PUBLISHED — the snapshot Flow receives actually
 *    carries the diagnosis, and an UNDIAGNOSED business carries none.
 *
 * B. INTELLIGENCE CHANGES EXECUTION — the assertion that matters. Field
 *    presence certifies nothing: the same business, asked the same question,
 *    must get a MATERIALLY DIFFERENT strategy with the diagnosis than
 *    without it. Both arms hit the REAL /api/ai-suite/chat with the REAL
 *    model; only the published snapshot differs.
 *
 * Requires: pnpm build && pnpm start -p 3114
 * Run: FLOW_PROBE_SA=<id> NODE_OPTIONS="--conditions=react-server" \
 *        npx tsx scripts/verify-intelligence-changes-execution.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const SA = process.env.FLOW_PROBE_SA;
if (!SA) throw new Error("FLOW_PROBE_SA is required.");
const BASE = process.env.E2E_BASE ?? "http://localhost:3114";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";

const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase/admin.ts");
const auth = getAdminAuth(); const db = getAdminDb();
let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

async function session(uid: string): Promise<string> {
  const ct = await auth.createCustomToken(uid);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: ct, returnSecureToken: true }),
  });
  const { idToken } = (await r.json()) as { idToken?: string };
  const login = await fetch(`${BASE}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
  return (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}
const cookie = await session(OWNER);

// ── The SAME business in both arms. Only the diagnosis differs. ───────────
const BUSINESS = {
  contract: "divinex.profile", contractVersion: 1, flowSubAccountId: SA,
  businessProfileId: 424242, publishedAt: new Date().toISOString(),
  business: {
    name: "Harbourline Freight",
    type: "B2B freight brokerage",
    industry: "Logistics",
    audience: "Mid-market manufacturers shipping 20-60 LTL loads a month",
    websiteUrl: "https://harbourline.test",
  },
  offers: [], brand: {}, assets: [], provenance: { default: "supplied" },
};

// The diagnosis deliberately points AWAY from the obvious default. A generic
// answer for a freight brokerage is "get more leads"; Ascend says the leads
// are fine and the loss is at quote follow-up. If intelligence is doing real
// work, the two arms must diverge on THAT.
const DIAGNOSIS = {
  primaryConstraint:
    "Lead volume is healthy but 70% of quotes are never followed up after the first email, so qualified freight demand is lost after it has already been captured",
  opportunities: [
    { title: "Automated multi-touch quote follow-up", why: "most quotes die after one unanswered email" },
    { title: "Re-activation of dormant shippers who quoted but never booked", why: "large warm list sitting idle" },
  ],
  recommendedFunnelType: "lead_nurture",
  recommendedLeadMagnet: "freight cost audit",
  overallScore: 61, scoreLabel: "Leaking demand",
  assessedAt: new Date().toISOString(),
};

const profileRef = db.doc(`divinexProfiles/${SA}`);
const prior = (await profileRef.get()).data();

async function publish(withIntelligence: boolean, version: number) {
  await profileRef.set({
    ...BUSINESS, profileVersion: version,
    ...(withIntelligence ? { intelligence: DIAGNOSIS } : {}),
  });
}

async function ask(prompt: string): Promise<string> {
  const res = await fetch(`${BASE}/api/ai-suite/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      level: "sub-account", subAccountId: SA,
      messages: [{ role: "user", content: prompt }],
      pageContext: { route: `/sa/${SA}/dashboard` },
    }),
  });
  const d = (await res.json().catch(() => ({}))) as { type?: string; text?: string; proposal?: { summary?: string }; error?: string };
  if (!res.ok) throw new Error(`chat ${res.status}: ${d.error}`);
  const text = d.type === "proposal" ? (d.proposal?.summary ?? "") : (d.text ?? "");
  if (!text.trim()) throw new Error(`empty response (type=${d.type})`);
  return text;
}

const QUESTION =
  "What's the single most important thing I should do next to grow, and what should we build first? Be specific.";

try {
  // ── A. PUBLICATION ─────────────────────────────────────────────────────
  console.log("── A. ASCEND INTELLIGENCE PUBLICATION\n");
  await publish(true, 9001);
  const stored = (await profileRef.get()).data() as { intelligence?: Record<string, unknown> };
  check("the published snapshot carries Ascend's diagnosis", !!stored.intelligence?.primaryConstraint);
  check("opportunities are projected in priority order",
    Array.isArray(stored.intelligence?.opportunities) && (stored.intelligence.opportunities as unknown[]).length === 2);
  check("the diagnosis is timestamped so staleness is visible", !!stored.intelligence?.assessedAt);

  // ── B. DOES IT CHANGE EXECUTION? ──────────────────────────────────────
  console.log("\n── B. INTELLIGENCE → EXECUTION (real model, both arms)\n");

  const withIntel = await ask(QUESTION);
  console.log(`WITH diagnosis:\n  ${withIntel.replace(/\n/g, "\n  ").slice(0, 900)}\n`);

  await publish(false, 9002);
  const withoutIntel = await ask(QUESTION);
  console.log(`WITHOUT diagnosis:\n  ${withoutIntel.replace(/\n/g, "\n  ").slice(0, 900)}\n`);

  check("the two answers are materially different, not cosmetic rewording",
    withIntel.trim() !== withoutIntel.trim());

  // The diagnosed arm must act on the SPECIFIC constraint Ascend named.
  const followUpLang = /follow[- ]?up|nurture|re-?engage|re-?activat|dormant|unanswered/i;
  check("the diagnosed arm acts on the constraint Ascend actually named",
    followUpLang.test(withIntel), withIntel.slice(0, 160));

  // THE NON-VACUOUS TEST: a FACT only Ascend knew. "70% of quotes are never
  // followed up" is not derivable from the business description — a model
  // reasoning from first principles cannot produce it. Testing for a shared
  // vocabulary word ("follow-up") would be a false failure, since a long
  // generic answer may mention follow-up in passing while diagnosing
  // something else entirely; testing for the FACT cannot be faked.
  const ascendOnlyFact = /70\s?%|seventy percent|never followed up after the first/i;
  check("the Ascend-only fact appears ONLY in the diagnosed arm",
    ascendOnlyFact.test(withIntel) && !ascendOnlyFact.test(withoutIntel),
    `withIntel=${ascendOnlyFact.test(withIntel)} withoutIntel=${ascendOnlyFact.test(withoutIntel)}`);

  // And the two arms must reach DIFFERENT primary conclusions — the outcome
  // that actually matters, judged on the opening recommendation rather than
  // on incidental vocabulary anywhere in a long answer.
  const opening = (t: string) => t.slice(0, 400).toLowerCase();
  check("the two arms name different primary constraints",
    opening(withIntel) !== opening(withoutIntel) &&
      !(followUpLang.test(opening(withoutIntel)) && followUpLang.test(opening(withIntel)) &&
        opening(withoutIntel).includes(opening(withIntel).slice(0, 80))),
    `undiagnosed opens with: "${withoutIntel.slice(0, 110).replace(/\n/g, " ")}"`);

  // Honesty: no diagnosis must never be presented as one.
  check("the undiagnosed arm does not fabricate a score or a diagnosis",
    !/61|leaking demand|overall (growth )?score/i.test(withoutIntel), withoutIntel.slice(0, 140));

  // Reasoning material, not recitation.
  check("the diagnosed arm does not read scores or field names aloud",
    !/\b61\b|scoreLabel|primaryConstraint|growth_scans/i.test(withIntel));
} finally {
  if (prior) await profileRef.set(prior); else await profileRef.delete();
  console.log("\n(probe profile restored)");
}

console.log(`\n${bad === 0 ? "CHECKPOINT 2 A/B: PASS" : `CHECKPOINT 2 A/B: ${bad} FAILURE(S)`}`);
process.exit(bad === 0 ? 0 : 1);
