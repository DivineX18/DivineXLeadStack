// DIVINEX UNIFICATION CERTIFICATION (Slices 2-9) — the automated half of
// the final gate. Functional where it matters (real Firestore + the real
// compilers), structural where behaviour is UI-shaped.
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-divinex-unification.mts
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { getAdminDb } = await import("../src/lib/firebase/admin");
const db = getAdminDb();
let failures = 0;
const check = (l: string, ok: boolean, note = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${note ? ` — ${note}` : ""}`); if (!ok) failures++; };
const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const SUB = "qa-unify-sub";
const AG = "qa-unify-ag";
await db.doc(`subAccounts/${SUB}`).set({ id: SUB, agencyId: AG, name: "QA Unify", funnelsEnabledByAgency: true });

// ── 1. ONBOARDING FRAMEWORK: branching + progressive enrichment ──
{
  const { resolveSteps, stepDisposition, ONBOARDING_STEPS } = await import("../src/lib/divinex/onboarding-manifest");
  const noProfile = resolveSteps("complete", null, {});
  check("1a. complete mode yields a full step list", noProfile.length >= 6);
  const ascendOnly = resolveSteps("ascend", null, {});
  const flowOnly = resolveSteps("flow", null, {});
  check("1b. modes derive from ONE manifest and differ", ascendOnly.length !== flowOnly.length || JSON.stringify(ascendOnly.map(s=>s.id)) !== JSON.stringify(flowOnly.map(s=>s.id)));
  check("1c. ascend mode excludes asset review; flow mode excludes growth-constraint diagnosis",
    !ascendOnly.some((s) => s.id === "asset_review") && !flowOnly.some((s) => s.id === "constraint"));

  // Branching: no website → visual preference appears, brand/asset review does not
  const noSite = resolveSteps("complete", null, { website: "" });
  check("1d. no-website path shows visual preference, hides brand/asset review",
    noSite.some((s) => s.id === "visual_preference") && !noSite.some((s) => s.id === "brand_review"));
  const withSite = resolveSteps("complete", null, { website: "acme.com" });
  check("1e. website path shows brand + asset review, hides visual preference",
    withSite.some((s) => s.id === "brand_review") && withSite.some((s) => s.id === "asset_review") && !withSite.some((s) => s.id === "visual_preference"));

  // Progressive enrichment
  const knownProfile = { business: { name: "Acme", audience: "Parents" }, brand: { provenance: {} } };
  const skipped = resolveSteps("complete", knownProfile, {});
  check("1f. known values are NOT re-asked (progressive enrichment)",
    !skipped.some((s) => s.id === "business_name") && !skipped.some((s) => s.id === "audience"));
  const extracted = { business: { name: "Acme" }, brand: { provenance: { businessName: { status: "extracted" } } } };
  const nameStep = ONBOARDING_STEPS.find((s) => s.id === "business_name")!;
  check("1g. extracted values become CONFIRM, not skip and not re-ask",
    stepDisposition(nameStep, extracted).disposition === "confirm");
  const confirmed = { business: { name: "Acme" }, brand: { provenance: { businessName: { status: "confirmed" } } } };
  check("1h. confirmed values are skipped entirely", stepDisposition(nameStep, confirmed).disposition === "skip");
}

// ── 2. CAMPAIGN CONTRACTS: intent isolation + validation ──
{
  const { validateCampaignPlan, renderPlanSummary } = await import("../src/lib/divinex/campaign");
  const base = {
    planVersion: 1 as const, status: "draft" as const,
    intent: { businessProfileId: 1, subAccountId: SUB, objective: "leads" as const, offerId: "offer:summer-tutoring" },
    funnelStrategy: {},
    formRequirements: { fields: [{ name: "annual_revenue", label: "Annual revenue", type: "number" as const, required: true }] },
    segmentationRules: [{ field: "annual_revenue", operator: "greater_than" as const, value: "500000", tag: "consulting-track", label: "$500k+" }],
    followUpStrategy: { goalTag: "booked", goalState: "booked a call", handoffDays: 3, messages: [
      { channel: "email" as const, delayHours: 0, purpose: "confirm", commType: "transactional" as const, subject: "You are in", body: "Thanks", origin: "generated" as const },
    ] },
    crmRequirements: {}, assetSelections: [], brandProfileVersion: 2,
  };
  check("2a. valid plan validates", validateCampaignPlan(base).ok === true);
  const orphan = { ...base, segmentationRules: [{ ...base.segmentationRules[0], field: "missing_field" }] };
  const bad = validateCampaignPlan(orphan);
  check("2b. segmentation referencing a missing form field is REJECTED", bad.ok === false);
  const noBody = { ...base, followUpStrategy: { ...base.followUpStrategy, messages: [{ ...base.followUpStrategy.messages[0], body: "" }] } };
  check("2c. message without a body is REJECTED", validateCampaignPlan(noBody).ok === false);
  const summary = renderPlanSummary(base);
  check("2d. human summary renders offer + segments + exit", summary.includes("offer:summer-tutoring") && summary.includes("$500k+") && summary.includes("booked"));

  // Campaign intent must NEVER be part of the profile contract shape.
  const contractSrc = src("src/lib/divinex/contract.ts");
  check("2e. Campaign Intent is structurally absent from the profile contract",
    !/campaignIntent|objective\??:/.test(contractSrc));
  check("2f. offers are referenced by STABLE id in the contract", contractSrc.includes("offers:") && src("src/lib/divinex/consume-profile.ts").includes("offers"));
}

// ── 3. APPLY WORKFLOW PLAN: real draft, real copy, real timing, real branches ──
{
  const { applyWorkflowPlan } = await import("../src/lib/divinex/apply-workflow-plan");
  const supplied = [
    { channel: "email" as const, delayHours: 0, purpose: "confirm", commType: "transactional" as const, subject: "Welcome aboard", body: "CUSTOMER WROTE THIS ONE", origin: "supplied" as const },
    { channel: "email" as const, delayHours: 48, purpose: "objection", commType: "nurture" as const, subject: "About the price", body: "CUSTOMER EMAIL TWO", origin: "supplied" as const },
    { channel: "email" as const, delayHours: 120, purpose: "proof", commType: "sales_followup" as const, subject: "How it works", body: "CUSTOMER EMAIL THREE", origin: "supplied" as const },
  ];
  const plan = {
    planVersion: 1 as const, status: "approved" as const,
    intent: { businessProfileId: 1, subAccountId: SUB, objective: "leads" as const },
    funnelStrategy: {},
    formRequirements: { fields: [{ name: "annual_revenue", label: "Annual revenue", type: "number" as const, required: true }] },
    segmentationRules: [
      { field: "annual_revenue", operator: "greater_than" as const, value: "500000", tag: "consulting-track", label: "$500k+" },
      { field: "annual_revenue", operator: "less_than" as const, value: "500000", tag: "course-track", label: "Under $500k" },
    ],
    followUpStrategy: { goalTag: "booked", goalState: "booked a strategy call", handoffDays: 7, messages: supplied },
    crmRequirements: { tags: ["qa-unify-lead"] }, assetSelections: [], brandProfileVersion: 1,
  };
  const res = await applyWorkflowPlan({ subAccountId: SUB, agencyId: AG, createdByUid: "qa", plan, displayName: "QA Campaign", formId: "qa-form-1" });
  check("3a. plan compiles into a real workflow", res.ok === true, res.errors?.join("; "));

  const wf = (await db.doc(`workflows/${res.workflowId}`).get()).data()!;
  const nodes = Object.values(wf.nodes as Record<string, { type: string; config?: Record<string, unknown>; branches?: { whenTrue?: string; whenFalse?: string } }>);
  const emails = nodes.filter((n) => n.type === "send_email");
  const bodies = emails.map((e) => String(e.config?.body ?? ""));

  check("3b. customer-supplied copy installed VERBATIM (no rewriting)",
    bodies.some((b) => b.startsWith("CUSTOMER WROTE THIS ONE")) &&
    bodies.some((b) => b.startsWith("CUSTOMER EMAIL TWO")) &&
    bodies.some((b) => b.startsWith("CUSTOMER EMAIL THREE")));
  check("3c. subjects installed verbatim", emails.some((e) => e.config?.subject === "About the price"));
  check("3d. compliance preserved: every email keeps the unsubscribe link",
    emails.length >= 3 && bodies.every((b) => b.includes("{{unsubscribeLink}}")));

  const waits = nodes.filter((n) => n.type === "wait").map((n) => Number(n.config?.seconds));
  check("3e. human timing became REAL waits (48h then +72h increment)",
    waits.includes(48 * 3600) && waits.includes(72 * 3600), `waits=${waits.join(",")}`);

  const branches = nodes.filter((n) => n.type === "if_else");
  const segTags = nodes.filter((n) => n.type === "add_tag").map((n) => String(n.config?.tag));
  check("3f. segmentation became REAL branches + tags",
    branches.length >= 2 && segTags.includes("consulting-track") && segTags.includes("course-track"));
  const numericCond = branches.find((n) => JSON.stringify(n.config).includes("greater_than"));
  check("3g. numeric routing uses real conditions", !!numericCond);
  check("3h. goal-tag exit checks present (converted leads stop receiving)",
    branches.some((n) => JSON.stringify(n.config).includes("has_tag") && JSON.stringify(n.config).includes("booked")));
  check("3i. workflow starts at the segmentation prefix", wf.startNodeId === "seg1");
  check("3j. DRAFT SAFETY: workflow is not active", wf.status !== "active");

  // EDIT MODE: re-apply desired state with one message changed
  const edited = { ...plan, followUpStrategy: { ...plan.followUpStrategy, messages: [supplied[0], { ...supplied[1], subject: "A gentler subject", body: "SOFTER COPY" }] } };
  const res2 = await applyWorkflowPlan({ subAccountId: SUB, agencyId: AG, createdByUid: "qa", plan: edited, workflowId: res.workflowId, displayName: "QA Campaign", formId: "qa-form-1" });
  const wf2 = (await db.doc(`workflows/${res.workflowId}`).get()).data()!;
  const emails2 = Object.values(wf2.nodes as Record<string, { type: string; config?: Record<string, unknown> }>).filter((n) => n.type === "send_email");
  check("3k. conversational edit re-applies desired state in place (same workflow id)",
    res2.ok === true && res2.workflowId === res.workflowId &&
    emails2.some((e) => e.config?.subject === "A gentler subject") &&
    !emails2.some((e) => e.config?.subject === "About the price"));

  // Zeno-generated copy travels the identical path
  const generated = { ...plan, followUpStrategy: { ...plan.followUpStrategy, messages: [{ ...supplied[0], body: "ZENO WROTE THIS", origin: "generated" as const }] }, segmentationRules: [] };
  const res3 = await applyWorkflowPlan({ subAccountId: SUB, agencyId: AG, createdByUid: "qa", plan: generated, displayName: "QA Generated" });
  check("3l. Zeno-generated copy is first-class (same compiler)", res3.ok === true && (res3.emailCount ?? 0) >= 1);

  for (const id of [res.workflowId, res3.workflowId]) if (id) await db.doc(`workflows/${id}`).delete();
}

// ── 4. PROFILE CONSUMPTION: approved-only, evidence law, null degrade ──
{
  const { resolveProfileInputs } = await import("../src/lib/divinex/consume-profile");
  check("4a. no snapshot → null → certified behavior preserved",
    (await resolveProfileInputs("qa-unify-never-published")) === null);

  await db.doc(`divinexProfiles/${SUB}`).set({
    contract: "divinex.profile", contractVersion: 1, profileVersion: 5,
    publishedAt: new Date().toISOString(), businessProfileId: 4242, flowSubAccountId: SUB,
    business: { name: "QA Unify Co", websiteUrl: "https://qa.test", contact: { email: "hi@qa.test", phone: "+15125551234" } },
    offers: [{ id: "offer:qa-kit", name: "QA Kit", kind: "primary" }],
    brand: { visual: { tokens: { logoUrl: "https://qa.test/logo.png", palette: ["#c2410c", "#0f172a"], fonts: ["Archivo"] }, personality: ["bold", "people-first"], photographyStyle: ["people-first"] } },
    assets: [
      { id: 1, fileUrl: "https://qa.test/team.jpg", fileType: "image", purpose: null, classification: "team", confidence: 70, status: "approved" },
      { id: 2, fileUrl: "https://qa.test/candidate.jpg", fileType: "image", purpose: null, classification: "product", confidence: 60, status: "candidate" },
      { id: 3, fileUrl: "https://qa.test/soc2.png", fileType: "image", purpose: null, classification: "certification", confidence: 80, status: "approved" },
    ],
    provenance: {},
  });
  const inputs = (await resolveProfileInputs(SUB))!;
  check("4b. identity resolves from canonical profile", inputs.identity.businessName === "QA Unify Co" && inputs.identity.email === "hi@qa.test" && inputs.identity.logoUrl?.includes("logo.png"));
  check("4c. brand palette → accent; personality → axes", inputs.accentColor === "#c2410c" && inputs.campaignEnergy === "urgent" && inputs.campaignHumanity === "people_led");
  check("4d. ONLY approved assets are offered (candidate excluded)",
    inputs.assets.team?.includes("https://qa.test/team.jpg") === true && inputs.assets.product === undefined);
  check("4e. evidence-class marks stay evidence, not brand creative",
    inputs.assets.evidenceLogos.some((l) => l.url.includes("soc2.png")) && inputs.assets.evidenceLogos[0].label === "Certification");
  check("4f. offers carry stable ids into generation", inputs.offers[0]?.id === "offer:qa-kit");
  check("4g. brand version tracked for plan references", inputs.profileVersion === 5);
}

// ── 5. ASSISTANCE RECOMMENDATIONS: relevance + economic responsibility ──
{
  const { recommendAssistance, SERVICE_CATALOG } = await import("../src/lib/divinex/assistance");
  const small = recommendAssistance("high_scale_operation", { monthlyRevenueBand: "under_10k" });
  check("5a. NO-SERVICE path: small business gets no retainer recommendation", small.length === 0);
  const large = recommendAssistance("high_scale_operation", { monthlyRevenueBand: "250k_plus" });
  check("5b. qualified scale gets the partnership recommendation", large[0]?.service === "strategic_partnership");
  const traffic = recommendAssistance("insufficient_traffic", {});
  check("5c. traffic constraint recommends traffic, not more optimization",
    traffic[0]?.service === "traffic_specialist" && /highest-leverage move yet/i.test(traffic[0].explanation));
  check("5d. every recommendation is dismissible with a cooldown",
    [...traffic, ...large].every((r) => r.dismissible && r.cooldownDays > 0));
  check("5e. included-year vs human-window stated separately (no implied year of support)",
    /30-day/.test(SERVICE_CATALOG.flow_guided_launch.humanWindow ?? "") && /12 months/.test(SERVICE_CATALOG.flow_guided_launch.humanWindow ?? ""));
  const priceLiterals = ["src/app/app/assistance/page.tsx", "src/components/divinex/onboarding-experience.tsx"]
    .map((f) => src(f)).join("\n");
  check("5f. ONE pricing authority — no price literals in components", !/\$\d{3,},?\d*/.test(priceLiterals));
}

// ── 6. STRUCTURAL LAWS ──
{
  const caps = src("src/lib/ai-suite/capabilities.ts");
  check("6a. Slice 6 feeds inputs without touching frozen engines", caps.includes("resolveProfileInputs") && caps.includes("model choice always wins"));
  check("6b. apply_workflow_plan exists and is desired-state (not raw CRUD)",
    caps.includes("apply_workflow_plan") && caps.includes("COMPLETE DESIRED") && !caps.includes("delete_workflow_step"));
  check("6c. onboarding writes canonical truth through Ascend only",
    src("src/app/api/app/onboarding/route.ts").includes("ascend.patchProfile") &&
    !src("src/app/api/app/onboarding/route.ts").includes("businessProfiles"));
  check("6d. reveal degrades honestly when intelligence is absent",
    src("src/app/app/onboarding/reveal/page.tsx").includes("HONEST REDUCED REVEAL"));
  check("6e. discovery marks harvested assets as candidates, never approved",
    readFileSync("/Users/boss/DivineX-Business-Intelligence/artifacts/api-server/src/lib/divinexContract.ts", "utf8").includes('assetStatus: "candidate"'));
  check("6f. brand discovery reuses the existing scraper stack (no new crawler platform)",
    readFileSync("/Users/boss/DivineX-Business-Intelligence/artifacts/api-server/src/lib/brandDiscovery.ts", "utf8").includes("headlessRender"));
}

await db.doc(`divinexProfiles/${SUB}`).delete();
await db.doc(`subAccounts/${SUB}`).delete();
console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
process.exit(failures > 0 ? 1 : 0);
