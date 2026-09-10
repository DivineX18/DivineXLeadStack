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

  return gaps;
}

export function deliveryRejection(gaps: string[]): string {
  return `This page promises something it can't deliver yet: ${gaps.join("; ")}.`;
}
