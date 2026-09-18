/**
 * FIRST-PARTY MEDIA REQUIRES FIRST-PARTY PROVENANCE.
 *
 * The RWAR Star Academy page shipped a school's booking funnel carrying a
 * document-legalisation company's photographs — scales of justice, apostille
 * paperwork, a Hague-Convention country map used as the hero. Nothing was
 * broken: the Image Director correctly placed approved, first-party,
 * customer-owned assets. They simply belonged to a different business.
 *
 * Every stored signal agreed with the mistake. The profile doc is KEYED by
 * flowSubAccountId, so it always "matches" the workspace; the business website
 * and every asset's sourcePageUrl were consistently apostillecorp.com; and
 * `provenance` was `{ default: "supplied" }`. Ownership could not be inferred,
 * only asserted — so this suite locks the assertion instead of the inference.
 *
 * ALSO LOCKED HERE: Before/After badges. They were derived from array position
 * whenever the layout happened to be "before_after", and the layout is chosen
 * by ARCHETYPE, sight unseen. A trade business's own photos auto-filled the
 * gallery with captions deliberately omitted — the pipeline says outright that
 * it knows the images are theirs but not what each depicts — and the page then
 * told visitors two unrelated photographs were one job before and after.
 *
 * Pure: no Firestore, no network, no model call, no generation credits.
 * Run: npx tsx scripts/verify-profile-media-trust.mts
 */
import { readFileSync } from "node:fs";
import { resolveProfileMediaTrust, type StoredDivinexProfile } from "../src/lib/divinex/contract.ts";

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const WS = "MEYB8CbWlE5fxAn3TJOp";

/** THE REAL CONTAMINATED PROFILE, as read from production on 2026-09-18. */
const RWAR_PROFILE = {
  contract: "divinex.profile",
  contractVersion: 1,
  profileVersion: 16,
  publishedAt: "2026-08-29T18:50:03.326Z",
  businessProfileId: 27,
  flowSubAccountId: WS,
  business: { name: "Admin", websiteUrl: "https://www.apostillecorp.com" },
  offers: [],
  brand: {},
  assets: [
    { id: 1, fileUrl: "https://apostillecorp.com/a/Lang-Hague-Members.webp", fileType: "image/webp", purpose: "brand_discovery", classification: "customer", status: "approved" },
    { id: 2, fileUrl: "https://apostillecorp.com/a/apostille-documents.webp", fileType: "image/webp", purpose: "brand_discovery", classification: "event", status: "approved" },
    { id: 3, fileUrl: "https://apostillecorp.com/a/legalize-documents.jpg", fileType: "image/jpeg", purpose: "brand_discovery", classification: "event", status: "approved" },
  ],
  provenance: { default: "supplied" },
} as unknown as StoredDivinexProfile;

// ── 1. The exact contaminated profile is untrusted ────────────────────────
{
  const t = resolveProfileMediaTrust(RWAR_PROFILE, WS);
  check("1a. the real RWAR/apostille profile is NOT trusted for media", !t.trusted, t.reason);
  check(
    "1b. and the reason is legible to an operator, not a code",
    t.reason.length > 20 && /predates ownership tracking/.test(t.reason),
  );
}

// ── 2. Storage location is not ownership ──────────────────────────────────
{
  check(
    "2a. flowSubAccountId matching the workspace grants nothing on its own",
    RWAR_PROFILE.flowSubAccountId === WS && !resolveProfileMediaTrust(RWAR_PROFILE, WS).trusted,
  );
  const imported = { ...RWAR_PROFILE, binding: { method: "imported" as const, workspaceId: WS } };
  check("2b. an 'imported' binding is not a claim of ownership", !resolveProfileMediaTrust(imported, WS).trusted);
  const seeded = { ...RWAR_PROFILE, binding: { method: "seeded" as const, workspaceId: WS } };
  check("2c. nor is 'seeded'", !resolveProfileMediaTrust(seeded, WS).trusted);
}

// ── 3. Positive control: a properly bound profile IS trusted ──────────────
{
  const scanned = {
    ...RWAR_PROFILE,
    binding: {
      method: "scan_requested_in_workspace" as const,
      workspaceId: WS,
      requestedByUid: "uid_member",
      requestedAt: "2026-09-18T00:00:00.000Z",
      declaredWebsiteUrl: "https://rwarstaracademy.com",
    },
  };
  check("3a. a workspace member's own scan IS trusted", resolveProfileMediaTrust(scanned, WS).trusted);
  const confirmed = {
    ...RWAR_PROFILE,
    binding: { method: "operator_confirmed" as const, workspaceId: WS, confirmedByUid: "uid_member", confirmedAt: "x" },
  };
  check("3b. an operator's explicit confirmation IS trusted", resolveProfileMediaTrust(confirmed, WS).trusted);
  check(
    "3c. but a binding to a DIFFERENT workspace never is",
    !resolveProfileMediaTrust({ ...confirmed, binding: { ...confirmed.binding, workspaceId: "other_ws" } }, WS).trusted,
  );
  check("3d. and no profile at all is not trusted", !resolveProfileMediaTrust(null, WS).trusted);
}

// ── 4. Untrusted keeps CONTEXT, loses MEDIA ───────────────────────────────
{
  const consume = read("src/lib/divinex/consume-profile.ts");
  check(
    "4a. the approved-asset pool is emptied when media is untrusted",
    /const approved = mediaTrust\.trusted[\s\S]{0,200}: \[\];/.test(consume),
  );
  check("4b. the logo is withheld too — a foreign logo misbrands loudest", /mediaTrust\.trusted && typeof tokens\.logoUrl/.test(consume));
  check(
    "4c. identity/offers/brand axes are NOT gated on trust (context survives)",
    /businessName: typeof business\.name === "string"/.test(consume) && !/mediaTrust\.trusted \? business\.name/.test(consume),
  );
  check("4d. the verdict is surfaced, not swallowed", /mediaTrust,\n\s*\};/.test(consume));
  check(
    "4e. generation is never failed merely because media is untrusted",
    !/throw new Error\([^)]*trust/i.test(consume),
  );
}

// ── 5. Binding survives an Ascend republish ───────────────────────────────
{
  const contract = read("src/lib/divinex/contract.ts");
  check(
    "5a. applyProfileSnapshot carries an existing binding forward",
    // The CONTRACT, not one spelling of it: the binding written back must come
    // from the previously STORED document and never from the incoming payload,
    // or a republish could hand a workspace a trust level the sender chose.
    /const existingBinding = existingData\?\.binding|const existingBinding = existing\.exists/.test(contract) &&
      /binding: existingBinding \?\?/.test(contract) &&
      !/binding: payload\.binding/.test(contract),
  );
  check(
    "5b. an unclaimed profile is stamped 'imported', which is not trusted",
    /binding: existingBinding \?\? \{ method: "imported"/.test(contract),
  );
  check(
    "5c. a trusted binding can never be silently downgraded",
    /TRUSTED_BINDING_METHODS\.has\(existing\.method\) && !TRUSTED_BINDING_METHODS\.has\(binding\.method\)/.test(contract),
  );
  check("5d. binding failures never throw into their caller", /catch \{\s*\/\/ Never throw into a caller/.test(contract));
}

// ── 6. Binding is RECORDED where ownership is actually asserted ───────────
{
  const onboarding = read("src/app/api/app/onboarding/route.ts");
  check("6a. an in-workspace scan records the binding", /recordProfileBinding\(subAccountId, \{/.test(onboarding));
  check("6b. with the method that reflects what happened", /method: "scan_requested_in_workspace"/.test(onboarding));
  check("6c. and the acting member's verified uid", /requestedByUid: access\.uid/.test(onboarding));
  check("6d. and the website the human actually declared", /declaredWebsiteUrl/.test(onboarding));
}

// ── 7. Before/After is a fact, not a layout ───────────────────────────────
{
  const renderer = read("src/components/funnels/sections/photo-gallery-section.tsx");
  check(
    "7a. the badges require an explicit role on the images",
    /images\[0\]\?\.role === "before" && images\[1\]\?\.role === "after"/.test(renderer),
  );
  check(
    "7b. an unproven before_after gallery degrades to a grid, not a claim",
    /requested === "before_after" && !provenBeforeAfter \? "grid" : requested/.test(renderer),
  );
  check(
    "7c. the badge text is still reachable for a PROVEN pair",
    /\{i === 0 \? "Before" : "After"\}/.test(renderer),
  );
  const types = read("src/types/funnels.ts");
  check("7d. the role is part of the data contract", /role\?: "before" \| "after"/.test(types));
  check(
    "7e. the auto-fill still attaches no captions, so it cannot assert one either",
    /Captions omitted deliberately/.test(read("src/lib/ai-suite/capabilities.ts")),
  );
}

console.log(failures === 0 ? `\nverify-profile-media-trust: all checks passed` : `\nverify-profile-media-trust: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
