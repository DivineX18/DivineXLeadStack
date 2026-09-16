/**
 * A PAGE THAT PROMISES A FILE HAS TO BE ABLE TO SEND IT.
 *
 * Live VA testing: a published lead magnet captured the lead perfectly and
 * delivered nothing, forever. Three independent states produced that, and each
 * looked fine from the builder:
 *
 *   1. the follow-up workflow existed but sat in draft (the engine only ever
 *      runs `status == "active"`),
 *   2. no file had ever been uploaded, so there was nothing to attach,
 *   3. a file was attached but the delivery email never carried its link.
 *
 * A fourth is invisible until a visitor clicks: the funnel references an asset
 * that no longer exists in storage, which reads as "attached" everywhere and
 * downloads as a 404.
 *
 * Publishing is the moment the promise becomes real, so all four fail closed
 * there. Workflows are NOT auto-activated by publishing — activation sends real
 * email to real people and stays a deliberate human act.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-fulfillment-contract.mts
 */
import { findDeliveryGaps } from "../src/lib/funnels/cta-integrity.ts";
import { assertsCheckoutCapability, stripCheckoutCapabilityClaims } from "../src/lib/funnels/conversion-action.ts";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const ASSET_URL = "/api/funnel-asset/abc123";
const deliveryEmail = `Here it is.\n\nDownload your copy here: https://crm.divinex.io${ASSET_URL}`;

const ctx = (over: Partial<Parameters<typeof findDeliveryGaps>[0]> = {}) => ({
  formIds: ["form1"],
  workflows: [{ id: "w1", name: "Follow-up", status: "active" }],
  hasLeadMagnetAsset: true,
  genre: "lead_magnet" as const,
  leadMagnetAssetUrl: ASSET_URL,
  assetResolves: true,
  emailBodies: [deliveryEmail],
  ...over,
});

// ── The four states that shipped an undeliverable promise ──────────────────
console.log("\n══ a lead magnet cannot publish with a broken fulfillment path ══");
{
  const inactive = findDeliveryGaps(ctx({ workflows: [{ id: "w1", name: "Follow-up", status: "draft" }] }));
  check("inactive workflow is refused", inactive.length > 0 && /not switched on/.test(inactive.join(" ")), inactive.join(" | ").slice(0, 90));

  const noWorkflow = findDeliveryGaps(ctx({ workflows: [] }));
  check("no follow-up at all is refused", noWorkflow.length > 0, noWorkflow.join(" | ").slice(0, 90));

  const noAsset = findDeliveryGaps(ctx({ hasLeadMagnetAsset: false, leadMagnetAssetUrl: null }));
  check("no uploaded file is refused", noAsset.some((g) => /upload your lead magnet/i.test(g)), noAsset.join(" | ").slice(0, 90));

  const goneAsset = findDeliveryGaps(ctx({ assetResolves: false }));
  check("a file missing from storage is refused", goneAsset.some((g) => /no longer exists in storage/i.test(g)), goneAsset.join(" | ").slice(0, 90));

  const unlinked = findDeliveryGaps(ctx({ emailBodies: ["Thanks for signing up. Speak soon."] }));
  check("an email with no download link is refused", unlinked.some((g) => /not connected to the uploaded resource/i.test(g)), unlinked.join(" | ").slice(0, 90));

  const ready = findDeliveryGaps(ctx());
  check("a complete fulfillment path publishes", ready.length === 0, ready.join(" | "));
}
{
  // The upload route writes an ABSOLUTE url into the email while the funnel
  // stores the relative path. The check has to see through that, or a
  // correctly-wired page would be refused.
  const absolute = findDeliveryGaps(ctx({ emailBodies: [`Grab it: https://crm.divinex.io${ASSET_URL}`] }));
  check("an absolute link in the email counts as connected", absolute.length === 0, absolute.join(" | "));
  const otherFile = findDeliveryGaps(ctx({ emailBodies: ["Grab it: https://crm.divinex.io/api/funnel-asset/OLD-FILE"] }));
  check("a link to a DIFFERENT file does not count", otherFile.length > 0, otherFile.join(" | ").slice(0, 80));
}

// ── Every other genre keeps its certified contract ─────────────────────────
console.log("\n══ pages that never promised a file are untouched ══");
{
  const leadGenNoAsset = findDeliveryGaps(ctx({ genre: "lead_gen", hasLeadMagnetAsset: false, leadMagnetAssetUrl: null, emailBodies: ["Thanks, we will be in touch."] }));
  check("a lead-gen page with no file is fine", leadGenNoAsset.length === 0, leadGenNoAsset.join(" | "));
  const bookingNoEmailLink = findDeliveryGaps(ctx({ genre: "lead_gen", hasLeadMagnetAsset: false, leadMagnetAssetUrl: null, emailBodies: ["See you then."] }));
  check("a booking page with no file is fine", bookingNoEmailLink.length === 0, bookingNoEmailLink.join(" | "));
  const tripwireInactive = findDeliveryGaps(ctx({ genre: "tripwire", workflows: [{ id: "w1", name: "Follow-up", status: "draft" }] }));
  check("the generic inactive-workflow rule still applies everywhere", tripwireInactive.length > 0);
  const noForm = findDeliveryGaps(ctx({ formIds: [] }));
  check("a page with no capture form is out of scope", noForm.length === 0);
  // Legacy callers that cannot supply the new evidence must not be newly broken.
  const legacy = findDeliveryGaps({ formIds: ["f"], workflows: [{ id: "w", name: "n", status: "active" }], hasLeadMagnetAsset: true, genre: "lead_magnet" });
  check("a caller supplying no asset/email evidence keeps its old behavior", legacy.length === 0, legacy.join(" | "));
}

// ── Checkout language is a capability claim ────────────────────────────────
console.log("\n══ a page may not claim a checkout it does not have ══");
for (const s of ["Secure checkout", "Secure payment", "Pay securely by card", "Instant purchase", "256-bit encrypted checkout", "Checkout is protected"]) {
  check(`refused without checkout: "${s}"`, assertsCheckoutCapability(s));
}
for (const s of ["Instant download", "One-time payment", "No credit card required", "One-time $49, no subscription", "Privacy protected", "Money stays in your pocket", "Free, no obligation", "Delivered in 5 working days"]) {
  check(`kept: "${s}"`, !assertsCheckoutCapability(s));
}
{
  const r = stripCheckoutCapabilityClaims(["Secure checkout", "Instant download", "Pay securely", "One-time payment"]);
  check("only the capability claims are removed", r.kept.join(",") === "Instant download,One-time payment", r.kept.join(","));
  check("... and the removals are reported", r.dropped.length === 2, r.dropped.join(","));
}

console.log(failures === 0 ? "\nFULFILLMENT + CHECKOUT TRUTH: ALL CHECKS PASSED\n" : `\nFULFILLMENT + CHECKOUT TRUTH: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
