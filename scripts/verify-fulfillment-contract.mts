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
import { findDeliveryGaps, withDeliveryLink, welcomeBannerMessage } from "../src/lib/funnels/cta-integrity.ts";
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

// ── Where the download link goes in the email ──────────────────────────────
console.log("\n══ the file goes above the legal footer, and there is only ever one ══");
{
  const URL_A = "https://crm.divinex.io/api/funnel-asset/AAA";
  const URL_B = "https://crm.divinex.io/api/funnel-asset/BBB";
  const original = "Hi {{contact.firstName}},\n\nThanks for requesting the guide.\n\n{{unsubscribeLink}}";

  const once = withDeliveryLink(original, URL_A);
  const linkAt = once.indexOf("Download your copy here:");
  const unsubAt = once.indexOf("{{unsubscribeLink}}");
  check("the link is inserted, not dropped", linkAt !== -1, once);
  check("the link sits BEFORE the unsubscribe footer", linkAt < unsubAt, `link@${linkAt} unsub@${unsubAt}`);
  check("the unsubscribe footer is still last", once.trimEnd().endsWith("{{unsubscribeLink}}"), JSON.stringify(once.slice(-40)));
  check("the operator's own copy is preserved", once.includes("Thanks for requesting the guide.") && once.includes("Hi {{contact.firstName}},"));

  // Replacing the PDF: the old link must be gone, not accompanied.
  const twice = withDeliveryLink(once, URL_B);
  const occurrences = (twice.match(/Download your copy here:/g) ?? []).length;
  check("a replacement upload leaves exactly one link", occurrences === 1, `found ${occurrences}`);
  check("... pointing at the NEW asset", twice.includes(URL_B) && !twice.includes(URL_A), twice);
  check("... still above the footer", twice.indexOf("Download your copy here:") < twice.indexOf("{{unsubscribeLink}}"));
  check("... and still preserving the operator's copy", twice.includes("Thanks for requesting the guide."));

  // Re-running with the SAME asset is a no-op, which is what lets the route
  // skip the write entirely.
  check("re-running with the same asset changes nothing", withDeliveryLink(once, URL_A) === once);

  // A body with no unsubscribe token still gets the file.
  const noFooter = withDeliveryLink("Internal note: a lead came in.", URL_A);
  check("an email with no unsubscribe token still receives the link", noFooter.includes(URL_A), noFooter);
  check("... appended after the existing content", noFooter.startsWith("Internal note: a lead came in."), noFooter);
  check("... exactly once on replacement", (withDeliveryLink(noFooter, URL_B).match(/Download your copy here:/g) ?? []).length === 1);

  // Content living BELOW the unsubscribe token stays below it.
  const withTail = withDeliveryLink("Body.\n\n{{unsubscribeLink}}\n\nDivineX, Dallas TX", URL_A);
  check("a postal-address tail stays below the footer", withTail.endsWith("DivineX, Dallas TX"), JSON.stringify(withTail.slice(-30)));
  check("... with the link still above the footer", withTail.indexOf(URL_A) < withTail.indexOf("{{unsubscribeLink}}"));

  // A hand-written layout keeps its shape when the PDF is swapped.
  const handWritten =
    "Hi there,\n\nThanks for requesting the book.\n\nDownload your copy here: " +
    URL_A +
    "\n\nEnjoy,\nDivineX\n\n{{unsubscribeLink}}";
  const swapped = withDeliveryLink(handWritten, URL_B);
  check("a hand-placed link keeps its position on replacement", swapped.indexOf("Enjoy,") > swapped.indexOf(URL_B), swapped);
  check("... with the URL actually swapped", swapped.includes(URL_B) && !swapped.includes(URL_A));
  check("... and exactly one link", (swapped.match(/Download your copy here:/g) ?? []).length === 1);
  check("... footer still last", swapped.trimEnd().endsWith("{{unsubscribeLink}}"));

  // A link stranded BELOW the footer is the old bug: it gets moved, not kept.
  const stranded = "Body.\n\n{{unsubscribeLink}}\n\nDownload your copy here: " + URL_A;
  const rescued = withDeliveryLink(stranded, URL_B);
  check("a link stranded below the footer is moved above it", rescued.indexOf(URL_B) < rescued.indexOf("{{unsubscribeLink}}"), rescued);
  check("... leaving exactly one", (rescued.match(/Download your copy here:/g) ?? []).length === 1);

  // Two links (the old double-append) are repaired down to one.
  const doubled =
    "Body.\n\nDownload your copy here: " + URL_A + "\n\n{{unsubscribeLink}}\n\nDownload your copy here: " + URL_A;
  const repaired = withDeliveryLink(doubled, URL_B);
  check("a doubled legacy body is repaired to one link", (repaired.match(/Download your copy here:/g) ?? []).length === 1, repaired);
  check("... above the footer", repaired.indexOf(URL_B) < repaired.indexOf("{{unsubscribeLink}}"));

  // A footer-only body must not gain leading blank lines.
  const bare = withDeliveryLink("{{unsubscribeLink}}", URL_A);
  check("a footer-only body gains no leading blank lines", bare.startsWith("Download your copy here:"), JSON.stringify(bare));

  // The written result satisfies the publish check that reads it.
  const gaps = findDeliveryGaps(ctx({ emailBodies: [once], leadMagnetAssetUrl: "/api/funnel-asset/AAA" }));
  check("what the writer produces passes the publish check that reads it", gaps.length === 0, gaps.join(" | "));
}

// ── The bridge-chain welcome bar ───────────────────────────────────────────
console.log("\n══ a welcome bar may only mention email when an email can be sent ══");
{
  const EMAIL_WORDS = /\bemail\b|\binbox\b/i;
  const cases = [
    { hasDownload: true, deliveryLive: true },
    { hasDownload: false, deliveryLive: true },
    { hasDownload: true, deliveryLive: false },
    { hasDownload: false, deliveryLive: false },
  ];
  for (const c of cases) {
    const msg = welcomeBannerMessage(c);
    const mentions = EMAIL_WORDS.test(msg);
    if (c.deliveryLive) {
      check(`deliveryLive=true, download=${c.hasDownload}: email language is allowed`, mentions, msg);
    } else {
      check(`deliveryLive=false, download=${c.hasDownload}: NO email promise`, !mentions, msg);
    }
    check(`... and the message is never empty (download=${c.hasDownload}, live=${c.deliveryLive})`, msg.trim().length > 10, msg);
  }
  // A visitor with a file still gets pointed at it when nothing can be sent.
  check("with a file but no live delivery, the copy points at the page itself",
    /right here/i.test(welcomeBannerMessage({ hasDownload: true, deliveryLive: false })));
  // And a visitor with neither is told something true rather than nothing.
  check("with no file and no live delivery, the copy promises only follow-up",
    /someone will be in touch/i.test(welcomeBannerMessage({ hasDownload: false, deliveryLive: false })));
  // The live-delivery wording is unchanged from what shipped before.
  check("live-delivery wording is preserved exactly (download)",
    welcomeBannerMessage({ hasDownload: true, deliveryLive: true }) === "your download is on its way to your email.");
  check("live-delivery wording is preserved exactly (no download)",
    welcomeBannerMessage({ hasDownload: false, deliveryLive: true }) === "check your email for everything you need.");
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
