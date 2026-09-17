/**
 * DEFECTS THE LAUNCH GATE REPRODUCED, AND THE RULES THAT CLOSE THEM.
 *
 *  1. A booking page had no genre, so it fell back to lead_magnet, acquired a
 *     deliverable contract it never promised, and could not publish at all.
 *  2. A lead who opted in to a business received mail from the platform, with
 *     no reply address that reached the business.
 *  3. A link-delivered asset told the recipient it was "attached".
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-launch-blockers.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const { findDeliveryGaps, withDeliveryLink } =
  await import("../src/lib/funnels/cta-integrity.ts");
const { FUNNEL_FRAMEWORKS } = await import("../src/lib/funnels/frameworks.ts");
const { resolveConversionAction } = await import("../src/lib/funnels/conversion-action.ts");
const { inferAuthenticityCategory } = await import("../src/lib/funnels/authenticity.ts");
const { workspaceSender } = await import("../src/lib/comms/resend.ts");

// ── 1. BOOKING IS A REAL GENRE ─────────────────────────────────────────────
console.log("\n══ a page whose purpose is a time in the diary can say so ══");
{
  check("booking is a first-class genre with its own stage framework",
    Array.isArray(FUNNEL_FRAMEWORKS.booking) && FUNNEL_FRAMEWORKS.booking.length > 1,
    `${FUNNEL_FRAMEWORKS.booking?.length ?? 0} stages`);
  check("... including a capture stage (the booking ask)",
    FUNNEL_FRAMEWORKS.booking.some((s) => s.isCapture));
  check("... and a belief shift, like any considered decision",
    FUNNEL_FRAMEWORKS.booking.some((s) => s.id === "belief_shift"));

  const base = { formIds: ["f1"], workflows: [{ id: "w", name: "n", status: "active" }] };
  const bookingNoAsset = findDeliveryGaps({ ...base, hasLeadMagnetAsset: false, genre: "booking", leadMagnetAssetUrl: null, assetResolves: false, emailBodies: ["See you then."] });
  check("a booking page publishes with NO uploaded asset", bookingNoAsset.length === 0, bookingNoAsset.join(" | "));
  check("... and demands no delivery link in its email", bookingNoAsset.length === 0);

  const magnetNoAsset = findDeliveryGaps({ ...base, hasLeadMagnetAsset: false, genre: "lead_magnet", leadMagnetAssetUrl: null, assetResolves: false, emailBodies: ["x"] });
  check("lead_magnet STILL refuses to publish without its file",
    magnetNoAsset.some((g) => /upload your lead magnet/i.test(g)), magnetNoAsset.join(" | "));

  const bookingInactive = findDeliveryGaps({ formIds: ["f1"], workflows: [{ id: "w", name: "n", status: "draft" }], hasLeadMagnetAsset: false, genre: "booking" });
  check("booking still obeys the generic inactive-follow-up rule", bookingInactive.length > 0);

  check("a booking funnel's primary action is a booking",
    resolveConversionAction({ genre: "booking", objective: null, priceCents: null, checkoutConfigured: false }).action === "booking");
  check("... even when a fee is named (the fee is the engagement, not a checkout)",
    resolveConversionAction({ genre: "booking", objective: "purchase", priceCents: 9900, checkoutConfigured: true }).action === "booking");
  check("booking is a real-world service, never an info product",
    inferAuthenticityCategory({ genre: "booking", archetype: null }) !== "info_product",
    inferAuthenticityCategory({ genre: "booking", archetype: null }));
}

// ── 2. UNKNOWN GENRE MUST NOT INHERIT A PROMISE ────────────────────────────
console.log("\n══ an unrecognised genre degrades safely ══");
{
  const caps = readFileSync(new URL("../src/lib/ai-suite/capabilities.ts", import.meta.url), "utf8");
  check("the capability's fallback is no longer lead_magnet",
    /validGenres\.includes\(genreRaw\) \? genreRaw : "lead_gen"/.test(caps));
  check("... and booking is in its allowlist and tool enum",
    /validGenres = \[[^\]]*"booking"/.test(caps) && /enum: \[[^\]]*"booking"\]/.test(caps));
  const route = readFileSync(new URL("../src/app/api/sub-accounts/[id]/funnels/route.ts", import.meta.url), "utf8");
  check("the funnel-create route's fallback is no longer lead_magnet either",
    /in GENRE_NAMES \? body\.genre : "lead_gen"/.test(route));
  // The fallback genre must itself be one that promises nothing.
  const fallbackGaps = findDeliveryGaps({ formIds: ["f1"], workflows: [{ id: "w", name: "n", status: "active" }], hasLeadMagnetAsset: false, genre: "lead_gen", leadMagnetAssetUrl: null, assetResolves: false, emailBodies: ["Thanks."] });
  check("the fallback genre carries no deliverable semantics", fallbackGaps.length === 0, fallbackGaps.join(" | "));
}

// ── 3. SENDER IDENTITY ─────────────────────────────────────────────────────
console.log("\n══ the lead hears from the business, not the platform ══");
{
  const PLATFORM = process.env.EMAIL_FROM ?? "";
  const addr = (PLATFORM.match(/<([^>]+)>/)?.[1] ?? PLATFORM).trim();

  const s = workspaceSender({ name: "Brightwater Gutter Cleaning", replyToEmail: "hello@brightwater.example" });
  check("the workspace name becomes the display name", s.from.startsWith("Brightwater Gutter Cleaning <"), s.from);
  check("... on the verified platform address, never a spoofed domain", s.from.includes(addr), s.from);
  check("the configured business email becomes Reply-To", s.replyTo === "hello@brightwater.example", String(s.replyTo));

  const noReply = workspaceSender({ name: "Brightwater Gutter Cleaning", replyToEmail: null });
  check("no configured address means NO Reply-To, never an invented one", noReply.replyTo === undefined, String(noReply.replyTo));
  const badReply = workspaceSender({ name: "X Co", replyToEmail: "not-an-email" });
  check("an invalid configured address is refused rather than sent", badReply.replyTo === undefined, String(badReply.replyTo));

  const noName = workspaceSender({ name: null, replyToEmail: null });
  check("no trustworthy name falls back to the platform sender, truthfully", noName.from === PLATFORM, noName.from);
  const blankName = workspaceSender({ name: "  ", replyToEmail: null });
  check("... and a blank name does too", blankName.from === PLATFORM, blankName.from);

  const inject = workspaceSender({ name: 'Evil" <attacker@evil.test>, x', replyToEmail: null });
  check("a name cannot inject a second address or header", !inject.from.includes("attacker@evil.test") && (inject.from.match(/</g) ?? []).length <= 1, inject.from);
  check("... and control characters are stripped", !/[\r\n]/.test(workspaceSender({ name: "A\r\nBcc: x@y.z", replyToEmail: null }).from));

  const engine = readFileSync(new URL("../src/lib/workflows/engine.ts", import.meta.url), "utf8");
  check("the workflow engine uses the central contract, not an ad-hoc from",
    /\.\.\.workspaceSender\(ctx\.subAccount\)/.test(engine) && !/from: tenantFrom\(ctx\.subAccount\)/.test(engine));
  check("sender identity is derived from config, never from funnel copy",
    !/workspaceSender\([^)]*(headline|body|copy|args)/i.test(engine));
}

console.log(failures === 0 ? "\nLAUNCH BLOCKERS: ALL CHECKS PASSED\n" : `\nLAUNCH BLOCKERS: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
