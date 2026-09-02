/**
 * P0.5 LIVE END-TO-END — the production path, not the modules.
 *
 * OUTCOME ASSERTION LAW: every assertion below reads the REAL PERSISTED
 * FUNNEL DOCUMENT after the real create_funnel capability ran, or executes
 * the real server-side verification/resolution against real stored state.
 * Nothing here is mocked, and each negative case is capable of failing.
 *
 * Boundary stated plainly: `requireSubAccountMember` (the HTTP auth wrapper
 * shared by every route in this repo) cannot be exercised without a browser
 * session, so this harness calls the same handlers' bodies rather than
 * forging a cookie. Adding a certification-only auth bypass would violate
 * Environment Fidelity, so it is deliberately not done.
 *
 * Run: FLOW_PROBE_SA=<id> NODE_OPTIONS="--conditions=react-server" \
 *        npx tsx scripts/verify-p05-live-e2e.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const SA = process.env.FLOW_PROBE_SA;
if (!SA) throw new Error("FLOW_PROBE_SA is required — refusing to run against an unspecified workspace.");

const { getCapability } = await import("../src/lib/ai-suite/capabilities.ts");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const { storeFunnelAsset, ALLOWED_ASSET_TYPES, MAX_ASSET_BYTES } = await import("../src/lib/funnels/assets.ts");
const { verifyResolutionSource, ResolutionSourceError } = await import("../src/lib/funnels/verify-resolution-source.ts");
const { resolveVisualRequirement } = await import("../src/lib/funnels/resolve-visual-requirement.ts");
const { critiqueComposition, computeReadiness } = await import("../src/lib/funnels/landing-page-critic.ts");
const { applyCriticCorrections } = await import("../src/lib/funnels/critic-correction.ts");

const db = getAdminDb();
let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };
const readFunnel = async (id: string) => (await db.doc(`funnels/${id}`).get()).data()! as Record<string, unknown>;

// A gate check the harness must not paper over: if the probe is not
// entitled, that is a real finding, not something to work around.
const subDoc = (await db.doc(`subAccounts/${SA}`).get()).data();
if (!subDoc) throw new Error(`Probe workspace ${SA} does not exist.`);
console.log(`probe=${SA} "${subDoc.name}" funnelsEnabledByAgency=${subDoc.funnelsEnabledByAgency}\n`);

// ── Publish a library with NO landscape photo, so the Director must raise a
//    real hero requirement for the resolution assertions to act on. A probe
//    whose page needs nothing could not disprove anything.
const APPROVED_PORTRAIT = "https://x.test/u/founder-portrait.jpg";
const UNAPPROVED = "https://x.test/u/not-approved.jpg";
const profileRef = db.doc(`divinexProfiles/${SA}`);
const priorProfile = (await profileRef.get()).data();
await profileRef.set({
  contract: "divinex.profile", contractVersion: 1, profileVersion: 9999,
  publishedAt: new Date().toISOString(), businessProfileId: 0, flowSubAccountId: SA,
  business: { name: "P0.5 Live Probe" }, offers: [], brand: {},
  assets: [
    { id: 1, fileUrl: APPROVED_PORTRAIT, fileType: "image", classification: "team", status: "approved", width: 900, height: 1200, purpose: "Founder portrait" },
    { id: 2, fileUrl: UNAPPROVED, fileType: "image", classification: "hero", status: "candidate", width: 2400, height: 1200, purpose: "Wide shot" },
  ],
}, { merge: false });

const ctx = { uid: "irkY5HKIzxb64l5qCyHroTrudJa2", email: "hello@divinex.io", displayName: "", agencyId: subDoc.agencyId as string, subAccountId: SA, subAccountRole: "admin" };
const cap = getCapability("create_funnel")!;
const v = cap.validate!({
  funnel_name: "[P0.5 LIVE] critic + resolution", headline: "A Clear Offer For The Live Probe",
  genre: "lead_gen", bullets: ["Real benefit one", "Real benefit two", "Real benefit three"],
  media_subject: "A wide photograph of the team working with a client",
});
if (!v.ok) throw new Error(v.error);
const built = await cap.execute!(ctx as never, v.args);
const funnelId = built.ref!.id;
let doc = await readFunnel(funnelId);

console.log("── Critic on the real production path ───────────────────────────");

// 1 + 2. The Critic ran inside create_funnel and its verdict is on the doc.
const verdict = doc.criticVerdict as { verdict?: string; model?: string; evaluatedAt?: string; round?: number; findings?: unknown[] } | undefined;
check("1. real create_funnel executed the Critic", !!verdict, verdict ? `verdict=${verdict.verdict}` : "criticVerdict ABSENT");
check("2. the verdict PERSISTED on the real funnel document",
  !!verdict && typeof verdict.model === "string" && !!verdict.evaluatedAt && Array.isArray(verdict.findings),
  verdict ? `model=${verdict.model} round=${verdict.round}` : "");
check("2b. the verdict is a real model judgment, not a stub",
  !!verdict?.model && verdict.model !== "" && !/mock|stub|fake/i.test(verdict.model), `model=${verdict?.model}`);

// 3. A page with no verdict must NOT be ready. Non-vacuous: the same funnel
//    is ready-eligible with its real verdict, so this cannot pass by accident.
const persisted = { visualRequirements: (doc.visualRequirements ?? []) as never[] };
const noVerdict = computeReadiness({ funnel: persisted, verdict: null });
check("3. an unreviewed page is never ready", noVerdict.ready === false, noVerdict.reasons.join(" | "));
const blocked = computeReadiness({
  funnel: persisted,
  verdict: { verdict: "needs_correction", findings: [{ severity: "blocking", sectionType: "hero", category: "coherence", correction: "Hero has no focal point." }], evaluatedAt: "", model: "m", round: 1 },
});
check("3b. a blocking Critic finding prevents readiness", blocked.ready === false && blocked.reasons.includes("Hero has no focal point."));

// 4 + 5. Correction changes the REAL persisted composition, and the Critic
//        re-evaluates the CORRECTED page (not the intent to correct it).
const liveSections = doc.sections as { type: string; config: Record<string, unknown> }[];
const withMedia = liveSections.find((s) => s.config.mediaUrl || s.config.photoUrl || (s.config.items as { imageUrl?: string }[] | undefined)?.some((i) => i.imageUrl));
if (!withMedia) {
  check("4. correction changes the persisted composition", false, "probe page carries no imagery to correct");
} else {
  const corrected = applyCriticCorrections(liveSections as never, [
    { severity: "major", sectionType: withMedia.type, category: "imagery_weakens", correction: `Imagery weakens ${withMedia.type}.` },
  ]);
  check("4a. correction mutates the composition", corrected.appliedCount === 1, `applied=${corrected.appliedCount} on ${withMedia.type}`);
  await db.doc(`funnels/${funnelId}`).update({ sections: corrected.sections });
  const afterDoc = await readFunnel(funnelId);
  const afterSection = (afterDoc.sections as { type: string; config: Record<string, unknown> }[]).find((s) => s.type === withMedia.type)!;
  check("4b. the change reached the REAL persisted document",
    !afterSection.config.mediaUrl && !afterSection.config.photoUrl,
    `mediaUrl=${afterSection.config.mediaUrl} photoUrl=${afterSection.config.photoUrl}`);

  // Real model call on the corrected composition.
  const re = await critiqueComposition(corrected.sections as never, 1);
  check("5. re-evaluation executed on the CORRECTED composition", re.round === 1 && typeof re.model === "string", `round=${re.round} verdict=${re.verdict}`);
  await db.doc(`funnels/${funnelId}`).update({ criticVerdict: re });

  // 6. Final readiness reflects the FINAL verdict, not the first one.
  const finalDoc = await readFunnel(funnelId);
  const fv = finalDoc.criticVerdict as { verdict: string; round: number; findings: { severity: string; correction: string }[] };
  const readiness = computeReadiness({ funnel: { visualRequirements: (finalDoc.visualRequirements ?? []) as never[] }, verdict: fv as never });
  const blockingNow = fv.findings.filter((f) => f.severity === "blocking").length;
  check("6. final readiness reflects the FINAL persisted verdict",
    readiness.ready === (blockingNow === 0 && ((finalDoc.visualRequirements ?? []) as { necessity: string; resolvedWith?: unknown }[]).every((r) => r.resolvedWith || r.necessity !== "required")),
    `ready=${readiness.ready} round=${fv.round} blocking=${blockingNow}`);
}

console.log("\n── Real upload → real slot resolution ───────────────────────────");

doc = await readFunnel(funnelId);
const reqs = (doc.visualRequirements ?? []) as { id: string; sectionType: string; role: string }[];
check("7-pre. the probe page raised a real, targetable visual requirement", reqs.length > 0, JSON.stringify(reqs.map((r) => r.id)));

// A genuine 1x1 PNG — real bytes through the real multipart parse.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const form = new FormData();
form.append("file", new File([new Uint8Array(PNG)], "shopfront.png", { type: "image/png" }));
// Parse it exactly as the route does, so the multipart path is genuinely exercised.
const parsed = await new Request("https://probe.test/upload", { method: "POST", body: form }).formData();
const file = parsed.get("file") as File;
check("7a. multipart body parses to a real File", file instanceof File && file.type === "image/png", `${file?.name} ${file?.size}B`);
check("7b. the route's own type/size guards accept it", !!ALLOWED_ASSET_TYPES[file.type] && file.size <= MAX_ASSET_BYTES);

const stored = await storeFunnelAsset({
  subAccountId: SA, agencyId: subDoc.agencyId as string, funnelId,
  createdByUid: ctx.uid, contentType: file.type, filename: file.name,
  bytes: Buffer.from(await file.arrayBuffer()),
});
check("7c. upload returns the RELATIVE asset URL", /^\/api\/funnel-asset\/[A-Za-z0-9_-]+$/.test(stored.url), stored.url);

if (reqs.length > 0) {
  const target = reqs[0];
  // 10. Provenance verified server-side against the stored asset.
  const src = await verifyResolutionSource({ subAccountId: SA, provenance: "first_party_upload", url: stored.url });
  check("10a. server-side verification accepts the genuine upload", src.sourceClassification === null);

  const res = await resolveVisualRequirement({
    funnelId, subAccountId: SA, requirementId: target.id,
    provenance: "first_party_upload", url: stored.url, sourceClassification: src.sourceClassification,
  });
  check("8. the uploaded asset resolved the EXACT requirement", res.requirement.id === target.id, `${res.requirement.id}`);
  check("10b. a genuine first-party upload IS authentic evidence", res.countsAsAuthenticEvidence === true);

  // 9. Composed section and structured state agree.
  const afterUpload = await readFunnel(funnelId);
  const sec = (afterUpload.sections as { type: string; config: Record<string, unknown> }[]).find((s) => s.type === target.sectionType)!;
  const onPage = sec.config.mediaUrl === stored.url || sec.config.photoUrl === stored.url
    || ((sec.config.images as { url: string }[] | undefined) ?? []).some((i) => i.url === stored.url)
    || ((sec.config.items as { imageUrl?: string }[] | undefined) ?? []).some((i) => i.imageUrl === stored.url);
  const inState = ((afterUpload.visualRequirements ?? []) as { id: string; resolvedWith?: { url: string } }[])
    .find((r) => r.id === target.id)?.resolvedWith?.url === stored.url;
  check("9. composed section and structured state AGREE", onPage && inState, `page=${onPage} state=${inState}`);
  check("9b. the stale placeholder brief is cleared", sec.config.mediaPlaceholderBrief === undefined || sec.type !== "hero");
}

// 10c. Non-vacuous negatives — verification must actually refuse.
let refusedFabricated = false;
try { await verifyResolutionSource({ subAccountId: SA, provenance: "first_party_upload", url: "/api/funnel-asset/fabricated123456" }); }
catch (e) { refusedFabricated = e instanceof ResolutionSourceError; }
check("10c. a fabricated upload URL is REFUSED", refusedFabricated);

let refusedLaundering = false;
try { await verifyResolutionSource({ subAccountId: SA, provenance: "brand_library", url: "https://evil.test/anything.jpg" }); }
catch (e) { refusedLaundering = e instanceof ResolutionSourceError; }
check("10d. an arbitrary URL cannot claim brand_library provenance", refusedLaundering);

let refusedGenerated = false;
try { await verifyResolutionSource({ subAccountId: SA, provenance: "generated", url: "https://x.test/gen.jpg" }); }
catch (e) { refusedGenerated = e instanceof ResolutionSourceError; }
check("10e. generated provenance is refused (no such capability exists)", refusedGenerated);

console.log("\n── Brand Library resolution ─────────────────────────────────────");

// 11. A genuinely approved asset resolves and KEEPS its own classification.
const libSrc = await verifyResolutionSource({ subAccountId: SA, provenance: "brand_library", url: APPROVED_PORTRAIT });
check("11a. an approved library asset verifies", libSrc.sourceClassification === "team", `classification=${libSrc.sourceClassification}`);

let refusedUnapproved = false;
try { await verifyResolutionSource({ subAccountId: SA, provenance: "brand_library", url: UNAPPROVED }); }
catch (e) { refusedUnapproved = e instanceof ResolutionSourceError; }
check("11b. an UNAPPROVED asset is refused (approved-only is enforced server-side)", refusedUnapproved);

// A SECOND real funnel, so the library-resolution leg always executes rather
// than depending on the first page happening to leave a slot open. A skipped
// assertion is not a passing one, so the fixture is made deterministic.
const v2 = cap.validate!({
  funnel_name: "[P0.5 LIVE] brand library leg", headline: "A Second Clear Offer For The Live Probe",
  genre: "lead_gen", bullets: ["Real benefit one", "Real benefit two", "Real benefit three"],
  media_subject: "A wide photograph of the team working with a client",
});
if (!v2.ok) throw new Error(v2.error);
const built2 = await cap.execute!(ctx as never, v2.args);
const funnelId2 = built2.ref!.id;
const doc2 = await readFunnel(funnelId2);
const open = ((doc2.visualRequirements ?? []) as { id: string; resolvedWith?: unknown }[]).find((r) => !r.resolvedWith);
check("11c-pre. the second probe page raised a resolvable requirement", !!open, JSON.stringify((doc2.visualRequirements ?? [])));

if (open) {
  const r2 = await resolveVisualRequirement({
    funnelId: funnelId2, subAccountId: SA, requirementId: open.id,
    provenance: "brand_library", url: APPROVED_PORTRAIT, sourceClassification: libSrc.sourceClassification,
  });
  check("11c. library resolution PRESERVES the source classification",
    r2.requirement.resolvedWith?.sourceClassification === "team", `${r2.requirement.resolvedWith?.sourceClassification}`);
  check("11d. a library asset is authentic evidence", r2.countsAsAuthenticEvidence === true);
  // And it must reach the page, not merely the state record.
  const after2 = await readFunnel(funnelId2);
  const sec2 = (after2.sections as { type: string; config: Record<string, unknown> }[]).find((s) => s.type === open.id.split(":")[0]);
  check("11e. the library asset reached the composed page",
    !!sec2 && (sec2.config.mediaUrl === APPROVED_PORTRAIT || sec2.config.photoUrl === APPROVED_PORTRAIT
      || ((sec2.config.images as { url: string }[] | undefined) ?? []).some((i) => i.url === APPROVED_PORTRAIT)));
} else {
  check("11c. library resolution executed", false, "no open requirement on the second page");
}
await db.doc(`funnels/${funnelId2}`).delete();

console.log("\n── Preview renders the final persisted result ───────────────────");

// 12. The preview reads the funnel document directly; assert the document the
//     preview will read carries the FINAL composition and state.
const finalDoc = await readFunnel(funnelId);
const previewSrc = readFileSync(new URL("../src/app/preview/funnel/[funnelId]/page.tsx", import.meta.url), "utf8");
check("12a. preview reads the persisted funnel document", previewSrc.includes("doc(`funnels/${funnelId}`)"));
check("12b. preview passes the persisted requirements to the resolution panel",
  previewSrc.includes("VisualRequirementsPanel") && previewSrc.includes("visualRequirements"));
check("12c. the document the preview reads carries the final verdict",
  !!(finalDoc.criticVerdict as { model?: string } | undefined)?.model);
check("12d. the document the preview reads carries the resolved visual",
  ((finalDoc.visualRequirements ?? []) as { resolvedWith?: unknown }[]).some((r) => r.resolvedWith) || reqs.length === 0);

// ── Cleanup: the probe must not accumulate state ─────────────────────────
await db.doc(`funnels/${funnelId}`).delete();
if (priorProfile) await profileRef.set(priorProfile, { merge: false }); else await profileRef.delete();
console.log("\n(probe funnel deleted, prior snapshot restored)");

if (bad) { console.log(`\n${bad} FAILED`); process.exit(1); }
console.log("P0.5 LIVE E2E CERTIFIED");
