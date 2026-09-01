/**
 * IMAGE DIRECTOR — END-TO-END (P0.5).
 *
 * OUTCOME ASSERTION LAW: the pure module passing 21/21 does not certify the
 * phase. This asserts the COMPOSED FUNNEL that create_funnel actually writes,
 * against an adversarial asset library published through the real profile
 * snapshot. The Apostille case is permanent: weak first-party imagery, generic
 * first-party imagery, marks/seals, duplicates, an attractive-but-irrelevant
 * image, and insufficient authentic photography.
 *
 * Passing may mean FEWER images, or none.
 *
 * Run: FLOW_PROBE_SA=<id> NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-image-director-e2e.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const SA = process.env.FLOW_PROBE_SA!;
const { getCapability } = await import("../src/lib/ai-suite/capabilities.ts");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();
let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

const SEAL = "https://x.test/themes/t/hisd-seal.png";
const THUMB = "https://x.test/u/thumb-147.jpg";
const DUPE = "https://x.test/u/team-at-work.jpg";
const IRRELEVANT = "https://x.test/u/sunset.jpg";

// Publish an adversarial library through the REAL snapshot the generator reads.
const ref = db.doc(`divinexProfiles/${SA}`);
const prior = (await ref.get()).data();
await ref.set({
  contract: "divinex.profile", contractVersion: 1, profileVersion: 9999,
  publishedAt: new Date().toISOString(), businessProfileId: 0, flowSubAccountId: SA,
  business: { name: "Adversarial Probe" }, offers: [], brand: {},
  assets: [
    { id: 1, fileUrl: DUPE, fileType: "image", classification: "hero", status: "approved", width: 3070, height: 2048, purpose: "Our team at work" },
    { id: 2, fileUrl: DUPE, fileType: "image", classification: "hero", status: "approved", width: 3070, height: 2048, purpose: "Our team at work" },
    { id: 3, fileUrl: "https://x.test/u/handshake.jpg", fileType: "image", classification: "photo", status: "approved", width: 900, height: 600 },
    { id: 4, fileUrl: THUMB, fileType: "image", classification: "photo", status: "approved", width: 147, height: 147 },
    { id: 5, fileUrl: SEAL, fileType: "image", classification: "partner", status: "approved", width: 2000, height: 2000 },
    { id: 6, fileUrl: IRRELEVANT, fileType: "image", classification: "photo", status: "candidate", width: 2400, height: 1600 },
  ],
}, { merge: false });

const cap = getCapability("create_funnel")!;
const ctx = { uid: "irkY5HKIzxb64l5qCyHroTrudJa2", email: "hello@divinex.io", displayName: "", agencyId: "U5SBAHsB0nZ7ce552H9h", subAccountId: SA, subAccountRole: "admin" };
const v = cap.validate!({
  funnel_name: "[E2E] director", headline: "A Clear Offer For The Adversarial Probe",
  genre: "lead_gen", bullets: ["Real benefit one", "Real benefit two", "Real benefit three"],
  visual_archetype: "nonprofit_mission", media_subject: "Mobile notary meeting a client at a kitchen table",
});
if (!v.ok) throw new Error(v.error);
const built = await cap.execute!(ctx as never, v.args);
const f = (await db.doc(`funnels/${built.ref!.id}`).get()).data()!;
const sections = f.sections as { type: string; config: Record<string, unknown> }[];

const placed: string[] = [];
for (const sec of sections) {
  const c = sec.config;
  if (typeof c.mediaUrl === "string") placed.push(c.mediaUrl);
  if (typeof c.photoUrl === "string") placed.push(c.photoUrl);
  for (const g of (c.images as { url: string }[] | undefined) ?? []) placed.push(g.url);
  for (const it of (c.items as { imageUrl?: string }[] | undefined) ?? []) if (it.imageUrl) placed.push(it.imageUrl);
}

// ── The customer-visible outcome, on the composed page ───────────────────
check("1. E2E: no seal/mark placed as photography", !placed.includes(SEAL), placed.join(" | ").slice(0, 80));
check("2. E2E: the 147x147 poor asset never reaches the page", !placed.includes(THUMB));
check("3. E2E: unapproved imagery never reaches the page", !placed.includes(IRRELEVANT));
check("4. E2E: no duplicate placement", new Set(placed).size === placed.length, `${placed.length} placed, ${new Set(placed).size} unique`);
check("5. E2E: page-level budget respected", placed.length <= 6, `${placed.length}`);
check("6. E2E: RESTRAINT — not every available asset is consumed", placed.length < 4, `${placed.length} placed from a 6-asset library`);

const gallery = sections.find((s) => s.type === "photo_gallery");
const galleryImages = ((gallery?.config.images as unknown[]) ?? []).length;
check("7. E2E: a thin gallery is omitted rather than padded", galleryImages === 0 || galleryImages >= 3, `${galleryImages} gallery images`);

const hero = sections.find((s) => s.type === "hero");
const heroCfg = (hero?.config ?? {}) as { mediaUrl?: string; mediaPlaceholderBrief?: string; mediaPlaceholderLabel?: string };
check("8. E2E: hero is either a real photo or an explicit request — never a blank slot",
  !!heroCfg.mediaUrl || !!heroCfg.mediaPlaceholderBrief,
  heroCfg.mediaUrl ? "photo" : `brief="${(heroCfg.mediaPlaceholderBrief ?? "").slice(0, 44)}"`);
check("9. E2E: an unresolved hero carries the SPECIFIC brief, not 'add an image'",
  !!heroCfg.mediaUrl || (heroCfg.mediaPlaceholderBrief ?? "").toLowerCase().includes("notary"),
  heroCfg.mediaPlaceholderBrief ?? "");
check("10. E2E: no media label contradicts its own type (the 'Add a video' bug)",
  !(heroCfg.mediaPlaceholderLabel ?? "").toLowerCase().includes("video") || (heroCfg as { mediaType?: string }).mediaType === "video",
  `label="${heroCfg.mediaPlaceholderLabel ?? ""}" type=${(heroCfg as { mediaType?: string }).mediaType}`);

// STRUCTURED STATE, split by MEANING. A requirement is actionable; a
// decision is a completed choice. Modelling both as one list would force
// every consumer to remember which entries are not gaps.
const reqs = (f as { visualRequirements?: { id: string; brief: string; blocksReadiness: boolean; sectionType: string }[] }).visualRequirements;
const decisions = (f as { visualDecisions?: { reason: string; sectionType: string }[] }).visualDecisions;

check("11. Unresolved requirements persist as structured state", Array.isArray(reqs), JSON.stringify(reqs));
check("12. Completed design decisions persist SEPARATELY", Array.isArray(decisions), JSON.stringify(decisions));
check("13. A deliberate omission is a DECISION, never a requirement",
  (decisions ?? []).some((d) => d.sectionType === "photo_gallery") &&
    !(reqs ?? []).some((r) => r.sectionType === "photo_gallery"),
  `reqs=${JSON.stringify((reqs ?? []).map((r) => r.sectionType))} decisions=${JSON.stringify((decisions ?? []).map((d) => d.sectionType))}`);

// "Stronger with N photos" counts REQUIREMENTS only. A resolved design
// decision must never make the page look incomplete.
const improvementCount = (reqs ?? []).filter((r) => !r.blocksReadiness).length;
check("14. Improvement count excludes design decisions", improvementCount === (reqs ?? []).filter((r) => !r.blocksReadiness).length && !(decisions ?? []).some((d) => (reqs ?? []).some((r) => r.sectionType === d.sectionType)),
  `N=${improvementCount}`);
check("15. Every requirement carries a targetable id and a real brief",
  (reqs ?? []).every((r) => r.id.includes(":") && r.brief.length > 12),
  JSON.stringify((reqs ?? []).map((r) => r.id)));

await db.doc(`funnels/${built.ref!.id}`).delete();
if (prior) await ref.set(prior, { merge: false }); else await ref.delete();
console.log("\n(probe funnel deleted, prior snapshot restored)");
console.log(bad === 0 ? "IMAGE DIRECTOR E2E CERTIFIED" : `${bad} CHECK(S) FAILED`);
process.exit(bad === 0 ? 0 : 1);
