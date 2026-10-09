/**
 * Seed the four DIVINEX service packages.
 *
 * Idempotent on slug: re-running updates requirements and leaves ids alone, so
 * engagements already under way keep pointing at the same package. Their own
 * snapshot protects them from the edit either way.
 *
 * PRICE IS DISPLAY ONLY. Eligibility comes from `stripePriceIds`, which starts
 * empty on purpose: a price must be registered deliberately, and until it is,
 * no Stripe payment can enroll anyone. That is the safe default.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/seed-onboarding-packages.mts <agencyId>
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) {
    process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}

const agencyId = process.argv[2];
if (!agencyId) {
  console.error("Usage: seed-onboarding-packages.mts <agencyId>");
  process.exit(1);
}

const { getAdminDb } = await import("@/lib/firebase/admin");
const { FieldValue } = await import("firebase-admin/firestore");
const db = getAdminDb();

const WEB = ["business", "brand", "website"] as const;
const GROWTH = ["business", "brand", "website", "marketing"] as const;
const SOCIAL = ["business", "brand", "website", "marketing", "social"] as const;

const BASE_PLATFORMS = ["wordpress", "hosting", "ga4", "search_console"];
const GROWTH_PLATFORMS = [...BASE_PLATFORMS, "tag_manager", "business_profile"];
const SOCIAL_PLATFORMS = [...GROWTH_PLATFORMS, "meta_business"];
const FULL_PLATFORMS = [...SOCIAL_PLATFORMS, "google_ads", "email_platform"];

const BUILD_CHECKLIST = [
  "Review client business profile",
  "Review brand assets",
  "Confirm website structure",
  "Confirm offers and CTAs",
  "Prepare website build brief",
  "Prepare SEO keyword and content plan",
  "Configure analytics and tracking",
  "Configure CRM",
  "Configure lead capture",
  "Configure funnels",
  "Configure email automation",
  "Run website QA",
  "Request client approval",
  "Launch website",
  "Verify live forms, tracking and booking",
];

const PACKAGES = [
  {
    slug: "website-support",
    name: "Website Support",
    priceCents: 35000,
    intakeSections: WEB,
    requiredAssets: ["logo"],
    platforms: BASE_PLATFORMS.slice(0, 2),
    productionChecklist: ["Review client business profile", "Confirm site access", "Agree support scope", "Run website QA"],
  },
  {
    slug: "growth-operations",
    name: "Growth Operations",
    priceCents: 250000,
    intakeSections: GROWTH,
    requiredAssets: ["logo", "brand_guidelines", "photography"],
    platforms: GROWTH_PLATFORMS,
    productionChecklist: BUILD_CHECKLIST,
  },
  {
    slug: "growth-social",
    name: "Growth + Social",
    priceCents: 350000,
    intakeSections: SOCIAL,
    requiredAssets: ["logo", "brand_guidelines", "photography", "social_content"],
    platforms: SOCIAL_PLATFORMS,
    productionChecklist: [...BUILD_CHECKLIST, "Build social content calendar", "Confirm posting approvals"],
  },
  {
    slug: "managed-growth",
    name: "Managed Growth",
    // Custom priced. Null, not a number: a placeholder amount here would be
    // quoted back to someone eventually.
    priceCents: null,
    intakeSections: SOCIAL,
    requiredAssets: ["logo", "brand_guidelines", "photography", "social_content"],
    platforms: FULL_PLATFORMS,
    productionChecklist: [...BUILD_CHECKLIST, "Build social content calendar", "Confirm ad account structure", "Agree channel budgets"],
  },
];

const { defaultPlatformRequirements } = await import("@/lib/onboarding/platforms");

for (const p of PACKAGES) {
  const existing = await db
    .collection("onboardingPackages")
    .where("agencyId", "==", agencyId)
    .where("slug", "==", p.slug)
    .limit(1)
    .get();
  const ref = existing.empty ? db.collection("onboardingPackages").doc() : existing.docs[0].ref;
  await ref.set(
    {
      agencyId,
      name: p.name,
      slug: p.slug,
      priceCents: p.priceCents,
      currency: "usd",
      active: true,
      // Empty on purpose. Register real price ids deliberately.
      stripePriceIds: existing.empty ? [] : (existing.docs[0].data().stripePriceIds ?? []),
      intakeSections: [...p.intakeSections],
      requiredAssets: p.requiredAssets,
      requiredPlatforms: defaultPlatformRequirements(p.platforms),
      productionChecklist: p.productionChecklist,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing.empty ? { createdAt: FieldValue.serverTimestamp() } : {}),
    },
    { merge: true },
  );
  console.log(`${existing.empty ? "created" : "updated"} ${p.slug} (${ref.id})`);
}
console.log("done");
