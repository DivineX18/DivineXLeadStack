import type { FunnelDoc, FunnelSection } from "@/types/funnels";

/**
 * THE ACTION CONTRACT: a button that looks clickable must do something.
 *
 * VA testing on published pages found funnels whose every CTA was inert.
 * "Schedule Now" and "Get the Starter Kit" rendered at full size, in the
 * accent colour, with a hover lift, and did nothing at all. The cause was
 * always the same shape in the stored document: a section carrying
 * `cta.style: "popup_form"` with `formId: null`, so the renderer had a style
 * that means "open a form" and no form to open, and fell through to a
 * `<button>` with no handler.
 *
 * That is fixed in the renderer (components/funnels/sections/cta-button.tsx
 * no longer renders an actionless button at all), but a renderer can only
 * decline to lie about a broken page. This module is the other half: the
 * definition of what "working" means for each CTA style, checked BEFORE a
 * page can go live, so the broken state stops being reachable.
 *
 * Mirrors section-completeness.ts deliberately: same shape, same publish
 * boundary, same "a page may be minimal, a page may not be broken" rule. It
 * is about ACTIONS; that module is about CONTENT. Neither duplicates the
 * other and both run at the same gate.
 */

export interface CtaProblem {
  sectionId: string;
  sectionType: string;
  label: string;
  reason: string;
}

/** The CTA-bearing shape shared by hero / offer / checkout / cta_banner. */
interface CtaBearingConfig {
  ctaLabel?: string;
  ctaHref?: string;
  formId?: string | null;
  priceCents?: number | null;
  checkoutMode?: string;
  cta?: { style?: string; phoneNumber?: string; bookingPageSlug?: string };
}

const CTA_SECTION_TYPES = new Set(["hero", "offer", "checkout", "cta_banner", "ticket_tiers"]);

function isRealHref(href: unknown): boolean {
  if (typeof href !== "string") return false;
  const h = href.trim();
  if (!h) return false;
  // "#" alone scrolls to the top, which is the "sends people back to the top
  // of the page" complaint, not a destination.
  if (h === "#") return false;
  return /^(https?:\/\/|\/|mailto:|tel:|#[\w-]+)/.test(h);
}

/**
 * Every CTA on the page that a visitor could click and get nothing from.
 *
 * `availableFormIds` is the set of capture forms that actually resolve for
 * this funnel's workspace. A formId pointing at a deleted or foreign form is
 * exactly as dead as no formId at all, and the renderer treats it the same
 * way, so this must be checked against reality rather than presence.
 */
export function findBrokenCtas(
  sections: FunnelSection[],
  availableFormIds: ReadonlySet<string>,
): CtaProblem[] {
  const problems: CtaProblem[] = [];

  for (const section of sections) {
    if (!CTA_SECTION_TYPES.has(section.type)) continue;
    const c = section.config as unknown as CtaBearingConfig;
    const label = (c.ctaLabel ?? "").trim();
    // No label means no button is offered, which is a legitimate page.
    if (!label) continue;

    const style = c.cta?.style ?? "inline";
    const hasForm = typeof c.formId === "string" && !!c.formId && availableFormIds.has(c.formId);
    const hasHref = isRealHref(c.ctaHref);

    const fail = (reason: string) =>
      problems.push({ sectionId: section.id, sectionType: section.type, label, reason });

    switch (style) {
      case "popup_calendar":
        // The one style the renderer checks its own prerequisite for; without
        // a slug it silently degrades to whatever else it can find.
        if (!c.cta?.bookingPageSlug) {
          if (!hasForm && !hasHref) fail("it opens a booking calendar, but no booking page is set on it");
        }
        break;
      case "phone":
        if (!c.cta?.phoneNumber) {
          if (!hasForm && !hasHref) fail("it dials a phone number, but no number is set on it");
        }
        break;
      case "popup_form":
      case "inline":
      case "dual":
      case "sticky_desktop":
      case "floating_mobile":
      default:
        // Everything else needs a form to submit, a real link, or a checkout.
        if (!hasForm && !hasHref) {
          if (c.checkoutMode === "stripe_checkout" || c.checkoutMode === "external_link") break;
          fail(
            style === "popup_form"
              ? "it opens a capture form, but no form is attached to it"
              : "it has no form, link or checkout behind it",
          );
        }
        break;
    }
  }

  return problems;
}

export function ctaRejection(problems: CtaProblem[]): string {
  const lines = problems.map((p) => `"${p.label}" (${p.sectionType}) — ${p.reason}`);
  return (
    `These buttons would render but do nothing when a visitor clicks them: ${lines.join("; ")}. ` +
    `Attach a capture form, a link, a booking page, a phone number or a checkout to each one, or remove its button label, then publish again.`
  );
}

// ── Delivery promises ──────────────────────────────────────────────────────

export interface DeliveryContext {
  /** Capture forms this funnel converts through. */
  formIds: string[];
  /** Workflows whose trigger is one of those forms, with their live status. */
  workflows: { id: string; name: string; status: string }[];
  /** Whether an uploaded lead-magnet file is attached to the funnel. */
  hasLeadMagnetAsset: boolean;
  genre: FunnelDoc["genre"];
  /** The attached file's public serve path, when there is one. */
  leadMagnetAssetUrl?: string | null;
  /** Whether that asset actually exists in the store. A funnel can carry a
   *  reference to a file that was deleted, which reads as "attached" and
   *  downloads as a 404. Server-verified by the caller; `undefined` means the
   *  caller did not check (legacy callers keep their old behavior). */
  assetResolves?: boolean;
  /** The body of every send_email action across this funnel's workflows.
   *  The delivery link has to be IN one of them — a workflow that emails a
   *  lovely note with no download is not delivery. */
  emailBodies?: string[];
}

/**
 * A page that promises something after the form must be able to deliver it.
 *
 * Found live: a published lead magnet whose "Send me the guide" button worked
 * perfectly, created the contact, and then sent nothing at all, forever. Its
 * follow-up workflow existed, addressed the right form, contained the right
 * email, and sat at status "draft" — and the workflow engine only ever matches
 * `status == "active"`. 91 of 93 workflows in that workspace were in the same
 * state. create_funnel builds the workflow in draft on purpose (real email is
 * on the other side of "live"), which is right at BUILD time and wrong at
 * PUBLISH time: publishing is the moment the promise becomes real.
 *
 * Deliberately narrow, to avoid failing pages that never promised anything:
 * it only fires when a follow-up workflow was actually built FOR this funnel
 * (so a hand-built page with no follow-up is untouched), or when a lead-magnet
 * file is attached with nothing able to send it, or when a lead_magnet-genre
 * page — whose entire purpose is delivering a thing — has no delivery at all.
 */
export function findDeliveryGaps(ctx: DeliveryContext): string[] {
  const gaps: string[] = [];
  if (ctx.formIds.length === 0) return gaps;

  const active = ctx.workflows.filter((w) => w.status === "active");
  const inactive = ctx.workflows.filter((w) => w.status !== "active");

  if (ctx.workflows.length > 0 && active.length === 0) {
    gaps.push(
      `the follow-up built for this page is not switched on, so nobody who submits the form will hear anything back ` +
        `(${inactive.map((w) => `"${w.name}"`).join(", ")} — open it under Workflows and activate it)`,
    );
  }

  if (ctx.hasLeadMagnetAsset && active.length === 0) {
    gaps.push("a lead-magnet file is attached but no active workflow can email it to anyone");
  }

  if (ctx.genre === "lead_magnet" && ctx.workflows.length === 0 && !ctx.hasLeadMagnetAsset) {
    gaps.push(
      "this is a lead-magnet page, but there is nothing to deliver and no follow-up to send: upload the file on this funnel, or build a follow-up workflow on its capture form",
    );
  }

  // ── THE LEAD-MAGNET FULFILLMENT CONTRACT ─────────────────────────────────
  //
  // Live testing found the rest of this hole. A lead magnet is a page whose
  // ENTIRE PURPOSE is handing over a file, and three separate states let one
  // publish while unable to do that: no file uploaded at all, a file attached
  // whose asset no longer exists, and an active workflow whose email never
  // mentions the download. Each looks fine from the builder, and each ends
  // with a visitor who typed their email and received nothing.
  //
  // The earlier rules above are deliberately generic (they hold for every
  // genre); these apply only where the promise is explicit, so a lead-gen or
  // booking page is untouched.
  if (ctx.genre === "lead_magnet") {
    if (ctx.workflows.length === 0) {
      gaps.push(
        "no follow-up has been built for this page, so a lead magnet nobody can be sent is all a visitor would get " +
          "(build the follow-up on its capture form, then activate it)",
      );
    }
    if (!ctx.hasLeadMagnetAsset) {
      gaps.push(
        "upload your lead magnet before publishing — this page promises a downloadable resource and no file is attached to it",
      );
    } else if (ctx.assetResolves === false) {
      gaps.push(
        "the file attached to this page no longer exists in storage, so the download link would fail — re-upload it before publishing",
      );
    } else if (ctx.emailBodies && ctx.leadMagnetAssetUrl) {
      const delivered = ctx.emailBodies.some((b) => b.includes(ctx.leadMagnetAssetUrl as string));
      if (!delivered) {
        gaps.push(
          "your delivery email is not connected to the uploaded resource, so the follow-up would arrive with no download link " +
            "(re-upload the file, which writes the link into the email)",
        );
      }
    }
  }

  return gaps;
}

export function deliveryRejection(gaps: string[]): string {
  return `This page promises something it can't deliver yet: ${gaps.join("; ")}.`;
}

// ── Writing the delivery link into the email ───────────────────────────────

/**
 * THE THING THEY ASKED FOR GOES ABOVE THE LEGAL FOOTER.
 *
 * The upload route used to append the download line to the END of the email
 * body. Every compliant body already ends with `{{unsubscribeLink}}` (the
 * broadcast/automation validator requires it), so "the end" was always BELOW
 * the unsubscribe footer. The subscriber got a note, then an unsubscribe
 * link, then — underneath the part every reader treats as the end of the
 * message — the file they actually signed up for.
 *
 * So insertion is positional, not appended: the link goes immediately before
 * the unsubscribe token, and the footer stays last. A body with no
 * unsubscribe token (an internal notification, a legacy template) still gets
 * the link rather than being skipped, because the alternative is silently not
 * delivering.
 *
 * This is the WRITE half of the rule `findDeliveryGaps` checks above, which
 * is why it lives here: the pattern that removes a previous link and the
 * check that looks for the current one cannot drift apart in one file.
 */
const DELIVERY_LINE_RE = /\n*Download your copy here: \S*\/api\/funnel-asset\/\S+/g;
const DELIVERY_LINE = /Download your copy here: \S*\/api\/funnel-asset\/\S+/;
const UNSUBSCRIBE_TOKEN = "{{unsubscribeLink}}";

/**
 * The email body carrying exactly one link, to exactly this asset.
 *
 * IDEMPOTENT MEANS "ONE LINK", NOT "ONE APPEND PER UPLOAD". A replacement
 * upload mints a new assetId, so a previous link is never left alongside the
 * new one — otherwise an operator who swapped their PDF would ship an email
 * carrying two download links, the first pointing at the file they had just
 * replaced. Everything the operator wrote themselves is preserved untouched.
 *
 * Placement follows one rule: A LINK THE READER WILL SEE KEEPS ITS PLACE, a
 * link they will not is moved to where they will. So a body that already
 * carries the line ABOVE the footer gets the URL swapped in place, leaving a
 * hand-written layout ("here is your copy ... enjoy, DivineX") exactly as the
 * operator wrote it. A body with no link, or with one stranded below the
 * unsubscribe footer (what the old append-to-the-end behavior produced), has
 * it inserted immediately above the footer instead.
 */
/**
 * What the bridge-chain welcome bar may claim about delivery.
 *
 * The same rule the capture popup already follows (public-funnel-view.tsx
 * gates its "check your inbox" copy on `deliveryLive`), applied to the one
 * surface that was still missing it: the `?welcome=1&from=` bar shown when a
 * visitor is carried straight onto the next step instead of a thank-you page.
 * It promised an email unconditionally, so on a funnel whose follow-up cannot
 * send, the visitor was told to go and watch an inbox that stays empty.
 *
 * `deliveryLive` is the SOURCE funnel's fact, not this page's: the email, if
 * any, is sent by the workflow behind the form they actually submitted. It is
 * read from `loadFunnelForRender`, never re-derived here, so there is exactly
 * one definition of "can anything reach them" in the codebase.
 *
 * Fails closed. An absent or unreadable source funnel means unknown, and
 * unknown may not promise. The download link is rendered beside this text
 * either way, so a visitor never leaves with less than before.
 */
export function welcomeBannerMessage(opts: { hasDownload: boolean; deliveryLive: boolean }): string {
  if (opts.hasDownload) {
    return opts.deliveryLive
      ? "your download is on its way to your email."
      : "your download is ready right here.";
  }
  return opts.deliveryLive
    ? "check your email for everything you need."
    : "we've got your details and someone will be in touch.";
}

/**
 * A LINK IS NOT AN ATTACHMENT.
 *
 * Reproduced in the launch gate: a generated delivery email opened with "Your
 * PDF guide is attached and ready to go." Nothing was attached. The asset is
 * delivered by a link, and the recipient was told to look for a paperclip
 * that does not exist, which is a false statement about the message itself.
 *
 * Fixed here rather than in any one workflow, because the copy is written by
 * a model and a model will write it again. The rewrite is deliberately
 * surgical: it repairs the CLAIM and leaves the operator's surrounding
 * sentence intact, and it never names a file type, since the asset is not
 * always a PDF.
 */
const ATTACHMENT_CLAIMS: [RegExp, string][] = [
  // "is attached to this email" / "is attached below" / "is attached"
  [/\b(is|are)\s+attached(\s+(?:to\s+this\s+(?:e-?mail|message)|below|here))?\b/gi, "is ready to download"],
  // "attached is your guide" / "attached to this email is ..."
  // "Attached is your copy" reads as a sentence opener, so it needs a phrase
  // that can also open one. "Ready to download is your copy" is not English.
  [/\battached(\s+to\s+this\s+(?:e-?mail|message))?\s+is\b/gi, "Here is"],
  [/\battached(\s+to\s+this\s+(?:e-?mail|message))?\s+(you'?ll\s+find|please\s+find)\b/gi, "you'll find"],
  // "please find attached", "see the attachment", "find the attachment below"
  [/\bplease\s+find\s+attached\b/gi, "here is"],
  [/\b(see|find|open|check)\s+(the\s+)?attachment(\s+below)?\b/gi, "use the download link below"],
  // Bare nouns: "the attachment", "your attachment", "as an attachment"
  [/\bas\s+an\s+attachment\b/gi, "as a download"],
  [/\b(the|your)\s+attachment\b/gi, "the download"],
  // "I've attached" / "we have attached" / "we've attached the guide"
  [/\b(i|we)\s*('ve|'?ve|\s+have)\s+attached\b/gi, "we've made available"],
  [/\battaching\b/gi, "sending a download link for"],
];

/**
 * The same copy with any claim of an attachment rewritten as a download.
 *
 * Only ever applied on the link-delivery path, so a genuine attachment
 * mechanism (the booking confirmation's ICS file, for example) is untouched:
 * that email never travels through here.
 */
export function withoutAttachmentClaims(body: string): { text: string; changed: boolean } {
  let out = body;
  for (const [re, replacement] of ATTACHMENT_CLAIMS) out = out.replace(re, replacement);
  return { text: out, changed: out !== body };
}

/** Does this copy still claim an attachment that link delivery cannot honour? */
export function claimsAttachment(body: string): boolean {
  return /\battach(ed|ment|ments|ing)\b/i.test(body);
}

export function withDeliveryLink(rawBody: string, absoluteUrl: string): string {
  // The asset arrives as a link, so the copy may not claim an attachment.
  const body = withoutAttachmentClaims(rawBody).text;
  const line = `Download your copy here: ${absoluteUrl}`;
  const footerAt = body.indexOf(UNSUBSCRIBE_TOKEN);
  const found = DELIVERY_LINE.exec(body);
  const count = (body.match(DELIVERY_LINE_RE) ?? []).length;

  // Exactly one link, already somewhere the subscriber reads: swap the URL and
  // leave the operator's layout alone. More than one means an earlier bug left
  // a mess, which is repaired by the canonical path below rather than patched.
  if (count === 1 && found && (footerAt === -1 || found.index < footerAt)) {
    return body.slice(0, found.index) + line + body.slice(found.index + found[0].length);
  }

  const cleaned = body.replace(DELIVERY_LINE_RE, "");
  const at = cleaned.indexOf(UNSUBSCRIBE_TOKEN);
  if (at === -1) return `${cleaned.trimEnd()}\n\n${line}`;

  const before = cleaned.slice(0, at).trimEnd();
  const footer = cleaned.slice(at);
  return `${before ? `${before}\n\n` : ""}${line}\n\n${footer}`;
}
