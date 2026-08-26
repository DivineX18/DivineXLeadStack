"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { PublicForm } from "@/components/forms/public-form";
import type { CtaExtras } from "@/types/funnels";
import type { LeadForm } from "@/types/forms";
import { Modal } from "./modal";

/**
 * Shared CTA-experience renderer — hero/offer/cta_banner all delegate here
 * instead of each re-implementing popup/sticky/floating logic. The `cta`
 * prop is optional and additive (see CtaExtras' doc comment); omitted =
 * today's plain inline `<a>`/embedded-form behavior, unchanged.
 *
 * Phase 3 rewrite: popups now render through the real Modal component
 * (fixed overlay, page never reflows, fade+scale, ESC/outside/X close) and
 * pick up `pageTheme` from the funnel itself — the pre-Phase-3 version used
 * the CSS `Canvas` system color, which tracked the visitor's OS/browser
 * dark-mode setting instead of the page's own theme, so a light-themed
 * funnel could pop a jarring dark card (or vice versa) depending on the
 * visitor's OS, unrelated to the operator's design choice.
 */
export function CtaButton({
  label,
  href,
  form,
  cta,
  accentColor,
  subAccountId,
  pageTheme = "light",
  animationLevel = "none",
  className,
  inverted = false,
}: {
  label: string;
  href?: string;
  /** When set, the primary action is the embedded capture form, not a
   *  link — same as today's OfferSection behavior for "inline". */
  form?: LeadForm | null;
  cta?: CtaExtras;
  accentColor: string;
  subAccountId?: string;
  /** The FUNNEL's own theme (not the visitor's OS preference) — sets the
   *  popup modal's surface colors so it never mismatches the page. */
  pageTheme?: "light" | "dark";
  /** Phase 3 — "moderate"/"expressive" adds a subtle breathing glow (see
   *  .flow-cta-pulse in globals.css) around the primary button. Respects
   *  prefers-reduced-motion via CSS, same as every other Flow animation. */
  animationLevel?: "none" | "minimal" | "moderate" | "expressive";
  className?: string;
  /** Inverted color scheme (white button, accent text) — for buttons sitting
   *  ON an accent/high-contrast field (e.g. the full_bleed_close banner),
   *  where an accent-on-accent button would disappear. */
  inverted?: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const style = cta?.style ?? "inline";
  const hasPopupTarget = style === "popup_calendar" ? !!(cta?.bookingPageSlug && subAccountId) : !!form;
  const pulseClass = animationLevel === "moderate" || animationLevel === "expressive" ? " flow-cta-pulse" : "";

  const buttonStyle: React.CSSProperties = inverted
    ? ({
        backgroundColor: "#ffffff",
        color: accentColor,
        "--accent-shadow": "rgba(0,0,0,0.35)",
        borderRadius: "var(--flow-radius, 0.75rem)",
      } as React.CSSProperties)
    : ({
        backgroundColor: accentColor,
        "--accent-shadow": `${accentColor}80`,
        borderRadius: "var(--flow-radius, 0.75rem)",
      } as React.CSSProperties);
  const btnClass =
    (className ??
      "inline-flex items-center justify-center gap-2 px-9 py-4 text-base font-bold text-white shadow-[0_8px_24px_-6px_var(--accent-shadow)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-6px_var(--accent-shadow)]") +
    pulseClass;

  const openModal = () => setModalOpen(true);
  const closeModal = () => setModalOpen(false);
  // A visitor gets ~2.2s to read the "thanks" confirmation before the
  // modal dismisses itself — long enough to register, short enough not to
  // feel stuck. Cleared implicitly: the modal unmounts on close anyway.
  const closeAfterSuccess = () => setTimeout(closeModal, 2200);

  const primaryButton = () => {
    if ((style === "popup_form" || style === "popup_calendar") && hasPopupTarget) {
      return (
        <button type="button" onClick={openModal} className={btnClass} style={buttonStyle}>
          {label}
        </button>
      );
    }
    if (style === "phone" && cta?.phoneNumber) {
      return (
        <a href={`tel:${cta.phoneNumber}`} className={btnClass} style={buttonStyle}>
          {label}
        </a>
      );
    }
    // "inline" (default), or a style missing its prerequisite (a "phone"
    // CTA with no phone number, a "popup_calendar" with no booking slug,
    // a "popup_form" with no form wired up, etc.) — degrade to plain inline
    // rather than a dead/misleading button. Deliberately NOT `href="#"`: an
    // anchor with an empty-fragment href visibly jumps the page to the top
    // on click, which is exactly the "sends people back to the top of the
    // page" bug — a real link renders as a link, anything else renders as
    // an inert button that does nothing rather than something misleading.
    if (form) return <PublicForm form={form} />;
    if (href) {
      return (
        <a href={href} className={btnClass} style={buttonStyle}>
          {label}
        </a>
      );
    }
    return (
      <button type="button" className={btnClass} style={buttonStyle}>
        {label}
      </button>
    );
  };

  const secondaryButton = style === "dual" && cta?.secondaryLabel && cta?.secondaryHref && (
    <a
      href={cta.secondaryHref}
      className="inline-flex items-center justify-center border px-9 py-4 text-base font-bold transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
      style={{ borderColor: `${accentColor}55`, color: accentColor, borderRadius: "var(--flow-radius, 0.75rem)" }}
    >
      {cta.secondaryLabel}
    </a>
  );

  const modalBody = () => {
    if (style === "popup_calendar" && cta?.bookingPageSlug && subAccountId) {
      return (
        <div className="p-2">
          <iframe
            src={`/b/${subAccountId}/${cta.bookingPageSlug}`}
            className="h-[70vh] w-full rounded-xl"
            title="Book a time"
          />
        </div>
      );
    }
    if (!form) return null;
    const layout = cta?.popupLayout ?? "centered";

    if (layout === "split_image" && cta?.popupImageUrl) {
      return (
        <div className="grid sm:grid-cols-2">
          <div className="hidden sm:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cta.popupImageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          </div>
          <div className="p-6 sm:p-7">
            <PublicForm form={form} onSuccess={closeAfterSuccess} />
          </div>
        </div>
      );
    }

    if (layout === "split_benefits" && cta?.popupBenefits && cta.popupBenefits.length > 0) {
      return (
        <div className="grid sm:grid-cols-2">
          <div className="p-6 sm:p-7" style={{ backgroundColor: `${accentColor}0d` }}>
            {cta.popupHeadline && <p className="mb-4 font-bold tracking-tight">{cta.popupHeadline}</p>}
            <ul className="space-y-2.5">
              {cta.popupBenefits.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accentColor }} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="p-6 sm:p-7">
            <PublicForm form={form} onSuccess={closeAfterSuccess} />
          </div>
        </div>
      );
    }

    return (
      <div className="p-6">
        {cta?.popupHeadline && <p className="mb-4 font-bold tracking-tight">{cta.popupHeadline}</p>}
        <PublicForm form={form} onSuccess={closeAfterSuccess} />
      </div>
    );
  };

  const modalWidth =
    style === "popup_form" && (cta?.popupLayout === "split_image" || cta?.popupLayout === "split_benefits")
      ? "max-w-2xl"
      : "max-w-lg";

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {primaryButton()}
        {secondaryButton}
      </div>

      {style === "sticky_desktop" && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 hidden border-t bg-[var(--card-bg)] px-4 pt-3 backdrop-blur sm:flex sm:items-center sm:justify-center"
          style={
            {
              "--card-bg": "color-mix(in oklab, currentColor 4%, transparent)",
              paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
            } as React.CSSProperties
          }
        >
          {cta?.style === "phone" && cta?.phoneNumber ? (
            <a href={`tel:${cta.phoneNumber}`} className={btnClass} style={buttonStyle}>
              {label}
            </a>
          ) : hasPopupTarget ? (
            <button type="button" onClick={openModal} className={btnClass} style={buttonStyle}>
              {label}
            </button>
          ) : href ? (
            <a href={href} className={btnClass} style={buttonStyle}>
              {label}
            </a>
          ) : (
            <button type="button" className={btnClass} style={buttonStyle}>
              {label}
            </button>
          )}
        </div>
      )}
      {style === "floating_mobile" && (
        <div
          className="fixed inset-x-4 z-40 sm:hidden"
          style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
        >
          {cta?.style === "phone" && cta?.phoneNumber ? (
            <a
              href={`tel:${cta.phoneNumber}`}
              className="block w-full rounded-xl px-6 py-4 text-center text-base font-bold text-white shadow-[0_8px_24px_-6px_var(--accent-shadow)]"
              style={buttonStyle}
            >
              {label}
            </a>
          ) : (
            <button
              type="button"
              onClick={openModal}
              className="block w-full rounded-xl px-6 py-4 text-center text-base font-bold text-white shadow-[0_8px_24px_-6px_var(--accent-shadow)]"
              style={buttonStyle}
            >
              {label}
            </button>
          )}
        </div>
      )}

      {(style === "popup_form" || style === "popup_calendar") && (
        <Modal
          open={modalOpen}
          onClose={closeModal}
          theme={pageTheme}
          accentColor={accentColor}
          maxWidthClassName={modalWidth}
          ariaLabel={cta?.popupHeadline || label}
        >
          {modalBody()}
        </Modal>
      )}
    </>
  );
}
