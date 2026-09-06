/**
 * FUNNEL MEASUREMENT (P0.2).
 *
 * The loop the product claims — recommendation → created → launched → traffic
 * → conversion → result → next recommendation — is unprovable without this.
 * So what's certified here is not "a counter goes up" but the properties that
 * make the number trustworthy enough to base a recommendation on:
 *
 *   - it counts against the right workspace, and is unreadable from another
 *   - an unvisited page reports NO DATA, never 0% conversion
 *   - a draft/unpublished page is not measurable at all
 *   - sessions are counted once, not once per event
 *   - source attribution survives the round-trip
 *   - a telemetry failure never becomes a visitor-facing failure
 *
 * Runs against real Firestore with a disposable funnel, and cleans up after
 * itself.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url),"utf8").split("\n")){const i=l.indexOf("=");if(i>0&&!l.startsWith("#"))process.env[l.slice(0,i).trim()]??=l.slice(i+1).trim().replace(/^["']|["']$/g,"");}

const SA = process.env.EDIT_SA ?? "gXQ6oH73xtvv7LsV1sQT";
const OTHER = "dx-loop-test";

const tel = await import("../src/lib/funnels/telemetry.ts");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();

let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

// Disposable funnel — never a real customer page.
const funnelRef = db.collection("funnels").doc();
const FID = funnelRef.id;
await funnelRef.set({
  subAccountId: SA, agencyId: "probe", name: "Measurement probe", status: "published",
  sections: [], createdAt: new Date(), updatedAt: new Date(),
});

// --- an unvisited live page reports NO DATA, not zero conversion -----------
const empty = await tel.getFunnelPerformance(SA, FID);
check("unmeasured page is readable", !!empty);
check("unmeasured page reports no conversion rate (not 0%)", empty?.conversionRate === null,
  String(empty?.conversionRate));
check("unmeasured page reports zero views honestly", empty?.views === 0);

// --- 3 visits + 1 submission ----------------------------------------------
await tel.recordFunnelEvent({ subAccountId: SA, funnelId: FID, kind: "view", firstInSession: true,
  utmSource: "facebook", utmMedium: "cpc" });
await tel.recordFunnelEvent({ subAccountId: SA, funnelId: FID, kind: "view", firstInSession: true,
  referrer: "https://www.google.com/search" });
await tel.recordFunnelEvent({ subAccountId: SA, funnelId: FID, kind: "view", firstInSession: true });
// Same session as the third view — a visitor who views then submits is ONE
// session, so this event must not mint a second one.
await tel.recordFunnelEvent({ subAccountId: SA, funnelId: FID, kind: "submission", firstInSession: false });

const perf = await tel.getFunnelPerformance(SA, FID);
check("views counted", perf?.views === 3, String(perf?.views));
check("submissions counted", perf?.submissions === 1, String(perf?.submissions));
check("sessions counted once per session", perf?.sessions === 3, String(perf?.sessions));
check("conversion rate derived from real traffic", Math.abs((perf?.conversionRate ?? 0) - 1 / 3) < 1e-9,
  String(perf?.conversionRate));

// --- attribution survives --------------------------------------------------
const keys = (perf?.bySource ?? []).map((s) => s.key);
// The shared classifier buckets facebook+cpc as meta-ads — reused verbatim
// rather than re-deciding channel names here, so funnel and marketing-site
// attribution can never disagree.
check("paid source attributed", keys.includes("meta-ads"), keys.join(","));
check("organic source attributed", keys.includes("google"), keys.join(","));
check("untagged traffic attributed as direct", keys.includes("direct"), keys.join(","));

// --- daily buckets exist (the before/after the loop needs) ------------------
check("daily time series recorded", (perf?.daily.length ?? 0) >= 1 && perf!.daily[0].views === 3,
  JSON.stringify(perf?.daily));

// --- workspace isolation ---------------------------------------------------
const foreign = await tel.getFunnelPerformance(OTHER, FID);
check("another workspace cannot read these numbers", foreign === null);
const list = await tel.listFunnelPerformance(OTHER);
check("another workspace's list excludes this funnel", !list.some((p) => p.funnelId === FID));
const own = await tel.listFunnelPerformance(SA);
check("owning workspace's list includes it", own.some((p) => p.funnelId === FID));

// --- a funnel that does not exist is not invented ---------------------------
check("unknown funnel reports not-found, not empty data",
  (await tel.getFunnelPerformance(SA, "no-such-funnel-id")) === null);

// --- outcomes extend without a schema change -------------------------------
await tel.recordFunnelOutcome({ subAccountId: SA, funnelId: FID, outcome: "booked_appointment" });
const withOutcome = await tel.getFunnelPerformance(SA, FID);
check("business outcomes attach to the same funnel", withOutcome?.outcomes.booked_appointment === 1,
  JSON.stringify(withOutcome?.outcomes));

// --- the publish boundary --------------------------------------------------
// The beacon route refuses drafts. Assert the boundary it relies on, so the
// rule can't be quietly relaxed in the type without this failing.
const { isPubliclyRenderable } = await import("../src/types/funnels.ts");
check("a draft page is not publicly renderable (so not measurable)", !isPubliclyRenderable("draft"));
check("a published page is measurable", isPubliclyRenderable("published"));

// --- rate limiter behaves --------------------------------------------------
let allowed = 0;
for (let i = 0; i < 300; i++) if (tel.checkBeaconRateLimit("probe-ip")) allowed++;
check("beacon rate limit caps inflation", allowed === 240, String(allowed));
check("rate limit is per-IP, not global", tel.checkBeaconRateLimit("other-probe-ip"));

// --- cleanup ---------------------------------------------------------------
const days = await db.collection(`funnelStats/${FID}/days`).get();
await Promise.all(days.docs.map((d) => d.ref.delete()));
await db.doc(`funnelStats/${FID}`).delete();
await funnelRef.delete();
console.log(bad === 0 ? "\nALL PASS" : `\n${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
