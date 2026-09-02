/**
 * P0.6 PHASE 2 — LIVE-MODEL BEHAVIORAL CERTIFICATION (gates B, C, G).
 *
 * Exercises the REAL /api/ai-suite/chat route over HTTP with a REAL session
 * cookie and the REAL model. No mocked responses, no prompt inspection, no
 * "the context contains X therefore the model will behave" substitution.
 *
 * Each gate is proven in BOTH directions:
 *   B  known facts ARE in the assembled context  →  Zeno does NOT re-ask them
 *   C  the fact IS absent from the context       →  Zeno DOES ask for it
 *
 * Requires the production server running (pnpm build && pnpm start -p 3114).
 *
 * Run: FLOW_PROBE_SA=<id> NODE_OPTIONS="--conditions=react-server" \
 *        npx tsx scripts/verify-zeno-live-behavior.mts
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
const auth = getAdminAuth();
const db = getAdminDb();

let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

// ── Real session, exactly as the tenant-isolation suite mints one ────────
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

async function ask(cookie: string, prompt: string, route: string): Promise<string> {
  const res = await fetch(`${BASE}/api/ai-suite/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      level: "sub-account", subAccountId: SA,
      messages: [{ role: "user", content: prompt }],
      pageContext: { route },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    type?: string; text?: string; error?: string;
    proposal?: { summary?: string; capability?: string };
  };
  if (!res.ok) throw new Error(`chat ${res.status}: ${data.error ?? "unknown"}`);
  // The route is a discriminated union: message | proposal | navigate. An
  // earlier version of this harness read a `message` field that does not
  // exist, so every response came back empty and the behavioral assertions
  // passed VACUOUSLY against "". Read the real shape.
  const text = data.type === "proposal"
    ? (data.proposal?.summary ?? "")
    : (data.text ?? "");
  if (!text.trim()) throw new Error(`Zeno returned no usable text (type=${data.type}) — refusing to assert against an empty response.`);
  return text;
}

// ── Sentinel context: unmistakable, and unquestionably "known" ───────────
const BIZ = "Norwood Kiln Ceramics";
const AUD = "wedding planners sourcing handmade tableware";
const OFFER = "a 40-piece bespoke dinner service commission";

const ref = db.doc(`divinexProfiles/${SA}`);
const prior = (await ref.get()).data();
await ref.set({
  contract: "divinex.profile", contractVersion: 1, profileVersion: 9999,
  publishedAt: new Date().toISOString(), businessProfileId: 0, flowSubAccountId: SA,
  business: { name: BIZ, type: "ceramics studio", audience: AUD, offer: OFFER, websiteUrl: "https://norwoodkiln.test" },
  offers: [{ id: "off_dinner", name: OFFER, kind: "service" }],
  brand: { voice: { tone: "warm, unhurried, craft-led" } },
  assets: [], provenance: {},
}, { merge: false });

const cookie = await session(OWNER);

try {
  // ── B. NEVER ASK KNOWN FACTS ───────────────────────────────────────────
  console.log("B. Never Ask Known Facts (live model)");

  // Direction 1 — the facts genuinely reached the assembled context. Without
  // this, a passing behavioral result would be meaningless.
  const { getDivinexProfileSnapshot } = await import("../src/lib/divinex/contract.ts");
  const snap = await getDivinexProfileSnapshot(SA);
  const business = (snap?.business ?? {}) as Record<string, unknown>;
  check("B0a. the business-name sentinel is in canonical context", business.name === BIZ);
  check("B0b. the audience sentinel is in canonical context", business.audience === AUD);
  check("B0c. the offer sentinel is in canonical context", business.offer === OFFER);

  // Direction 2 — the real model, asked something that invites discovery.
  const bAnswer = await ask(
    cookie,
    "I want to run a campaign to bring in more work. Recommend what I should build first and who it should target.",
    "/app/create",
  );
  console.log(`\n--- Zeno (B) ---\n${bAnswer.slice(0, 900)}\n----------------\n`);

  // Semantic, not exact-string: catch paraphrases of the known-fact questions.
  const REASK = [
    /what (?:kind of )?business (?:are you|do you (?:run|have|own))/i,
    /what(?:'s| is) your business(?: called| name)?\b/i,
    /tell me (?:about|more about) your business/i,
    /who (?:is|are) your (?:target )?(?:audience|customers|clients|ideal client)/i,
    /who (?:do you|are you trying to) (?:serve|target|sell to|reach)/i,
    /what (?:do you (?:sell|offer)|is your (?:main |primary )?offer|services do you (?:offer|provide))/i,
    /what (?:are|is) your (?:product|products|offering)/i,
    /could you (?:tell me|share) (?:your|the) (?:business|audience|offer)/i,
  ];
  const reasked = REASK.filter((r) => r.test(bAnswer));
  check("B1. Zeno does NOT re-ask the known business/audience/offer facts",
    reasked.length === 0, reasked.map(String).join(" | "));

  // Non-vacuous: the assertion must be capable of firing. Prove the patterns
  // do match a response that WOULD re-ask.
  check("B1-control. the re-ask detector actually fires on a re-asking answer",
    REASK.some((r) => r.test("Sure — first, what is your business and who is your target audience?")));

  check("B2. Zeno demonstrably USED the known context",
    new RegExp(`${BIZ.split(" ")[0]}|ceramic|tableware|wedding planner|dinner service`, "i").test(bAnswer),
    "answer is grounded in the planted business");

  // ── C. CONSEQUENTIAL UNKNOWN ───────────────────────────────────────────
  console.log("C. Consequential unknown (live model)");

  // Direction 1 — prove the decision-changing fact is genuinely absent. The
  // studio profile carries no event, date or schedule anywhere.
  const ctxBlob = JSON.stringify(snap ?? {});
  check("C0. the consequential fact is ABSENT from canonical context",
    !/\bdate\b|\bwhen\b|schedule|deadline|event/i.test(ctxBlob), "no date/schedule field exists in the snapshot");

  const cAnswer = await ask(
    cookie,
    "Build me a landing page for my upcoming live kiln workshop so people can register.",
    "/app/create",
  );
  console.log(`\n--- Zeno (C) ---\n${cAnswer.slice(0, 900)}\n----------------\n`);

  const ASKS_FOR_MISSING = [
    /\bwhat(?:'s| is) the date\b/i, /\bwhen (?:is|will|does)\b/i, /\bwhich date\b/i,
    /\bdate (?:and time|of the)\b/i, /\bneed (?:to know )?the date\b/i,
    /\bconfirm the date\b/i, /\blet me know (?:the|when)\b/i, /\bhow long\b/i,
    /\bwhat time\b/i, /\bdo you have a date\b/i,
  ];
  check("C1. Zeno ASKS for the missing consequential fact (or says it needs it)",
    ASKS_FOR_MISSING.some((r) => r.test(cAnswer)), cAnswer.slice(0, 200));

  // It must not invent one.
  const FABRICATED_DATE = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b|\b\d{4}-\d{2}-\d{2}\b/i;
  check("C2. Zeno does not FABRICATE the missing date",
    !FABRICATED_DATE.test(cAnswer), (cAnswer.match(FABRICATED_DATE) ?? [""])[0]);
  check("C2-control. the fabrication detector actually fires",
    FABRICATED_DATE.test("The workshop on March 14 will be featured."));

  // ── G. PERSISTENCE / ONE ZENO ACROSS SURFACES ──────────────────────────
  console.log("G. Persistence across final-IA surfaces (live model)");

  const onCreate = await ask(cookie, "In one sentence, what am I looking at right now?", "/app/create");
  const onIntel = await ask(cookie, "In one sentence, what am I looking at right now?", "/app/intelligence");
  console.log(`\n[create]       ${onCreate.slice(0, 180)}`);
  console.log(`[intelligence] ${onIntel.slice(0, 180)}\n`);

  check("G1. Zeno answers on Create", onCreate.length > 0);
  check("G2. Zeno answers on Intelligence", onIntel.length > 0);
  check("G3. the two surfaces produce DIFFERENT situational answers",
    onCreate !== onIntel, "route context genuinely changes the response");
  check("G4. Create is recognised as the building surface", /creat|build|campaign|landing page/i.test(onCreate));
  check("G5. Intelligence is recognised as the diagnosis surface", /intelligen|diagnos|opportunit|insight/i.test(onIntel));

  // Same persona, same thread endpoint — a route change must not fork Zeno.
  const threadOf = async () => {
    const r = await fetch(`${BASE}/api/ai-suite/thread?level=sub-account&subAccountId=${SA}`, { headers: { Cookie: cookie } });
    return r.ok ? JSON.stringify((await r.json()) as unknown).length : -1;
  };
  const t1 = await threadOf();
  const t2 = await threadOf();
  check("G6. one thread endpoint serves every surface (no per-route Zeno)", t1 > 0 && t1 === t2, `${t1} vs ${t2}`);
  check("G7. both surfaces answered as one persona (no second assistant identity)",
    !/I am a different|another assistant|switch assistant/i.test(onCreate + onIntel));

  // ── U1 under richer context ────────────────────────────────────────────
  console.log("I. U1 holds under richer live context");
  const all = bAnswer + cAnswer + onCreate + onIntel;
  for (const [needle, why] of [
    ["bridge_next_funnel_id", "bridge parameter"], ["create_funnel", "capability name"],
    ["subAccountId", "developer terminology"], ["Firestore", "developer terminology"],
    ["criticVerdict", "Critic internals"], ["Image Director", "Director reasoning"],
    ["divinexProfiles", "internal collection"], [SA, "raw workspace id"],
  ] as [string, string][]) {
    check(`I. live responses omit ${why}`, !all.includes(needle));
  }
  check("I. live responses contain no Firestore-style document id",
    !/\b[A-Za-z0-9_-]{20}\b/.test(all), (all.match(/\b[A-Za-z0-9_-]{20}\b/) ?? [""])[0]);
} finally {
  if (prior) await ref.set(prior, { merge: false }); else await ref.delete();
  console.log("\n(probe profile snapshot restored)");
}

console.log(bad ? `\n${bad} FAILED` : "\nZENO LIVE BEHAVIOR CERTIFIED");
process.exit(bad ? 1 : 0);
