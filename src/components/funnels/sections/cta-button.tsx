"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { PublicForm } from "@/components/forms/public-form";
import type { CtaExtras } from "@/types/funnels";
import type { LeadForm } from "@/types/forms";

/**
 * Shared CTA-experience renderer — hero/offer/cta_banner all delegate here
 * instead of each re-implementing popup/sticky/floating logic. The `cta`
 * prop is optional and additive (see CtaExtras' doc comment); omitted =
 * today's plain inline `<a>`/embedded-form behavior, unchanged.
 */
export function CtaButton({
  label,
  href,
  form,
  cta,
  accentColor,
  subAccountId,
  className,
}: {
  label: string;
  href?: string;
  /** When set, the primary action is the embedded capture form, not a
   *  link — same as today's OfferSection behavior for "inline". */
  form?: LeadForm | null;
  cta?: CtaExtras;
  accentColor: string;
  subAccountId?: string;
  className?: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const style = cta?.style ?? "inline";

  const buttonStyle = {
    backgroundColor: accentColor,
    "--accent-shadow": `${accentColor}80`,
  } as React.CSSProperties;
  const btnClass =
    className ??
    "inline-flex items-center justify-center gap-2 rounded-xl px-9 py-4 text-base font-bold text-white shadow-[0_8px_24px_-6px_var(--accent-shadow)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-6px_var(--accent-shadow)]";

  const openModal = () => setModalOpen(true);

  const primaryButton = () => {
    if (style === "popup_form" && form) {
      return (
        <button type="button" onClick={openModal} className={btnClass} style={buttonStyle}>
          {label}
        </button>
      );
    }
    if (style === "popup_calendar" && cta?.bookingPageSlug && subAccountId) {
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
    // etc.) — degrade to plain inline rather than a dead/misleading button.
    if (form) return <PublicForm form={form} />;
    return (
      <a href={href || "#"} className={btnClass} style={buttonStyle}>
        {label}
      </a>
    );
  };

  const secondaryButton = style === "dual" && cta?.secondaryLabel && cta?.secondaryHref && (
    <a
      href={cta.secondaryHref}
      className="inline-flex items-center justify-center rounded-xl border px-9 py-4 text-base font-bold transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
      style={{ borderColor: `${accentColor}55`, color: accentColor }}
    >
      {cta.secondaryLabel}
    </a>
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {primaryButton()}
        {secondaryButton}
      </div>

      {style === "sticky_desktop" && (
        <div className="fixed inset-x-0 bottom-0 z-40 hidden border-t bg-[var(--card-bg)] px-4 py-3 backdrop-blur sm:flex sm:items-center sm:justify-center" style={{ "--card-bg": "color-mix(in oklab, currentColor 4%, transparent)" } as React.CSSProperties}>
          <button type="button" onClick={form ? undefined : openModal} className={btnClass} style={buttonStyle}>
            {label}
          </button>
        </div>
      )}
      {style === "floating_mobile" && (
        <div className="fixed inset-x-4 bottom-4 z-40 sm:hidden">
          <button
            type="button"
            onClick={openModal}
            className="block w-full rounded-xl px-6 py-4 text-center text-base font-bold text-white shadow-[0_8px_24px_-6px_var(--accent-shadow)]"
            style={buttonStyle}
          >
            {label}
          </button>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalOpen(false)}>
          <div
            className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[var(--modal-bg)] p-6 shadow-2xl"
            style={{ "--modal-bg": "Canvas" } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 rounded-full p-1 opacity-60 hover:opacity-100"
            >
              <X className="h-5 w-5" />
            </button>
            {style === "popup_calendar" && cta?.bookingPageSlug && subAccountId ? (
              <iframe
                src={`/b/${subAccountId}/${cta.bookingPageSlug}`}
                className="h-[70vh] w-full rounded-lg"
                title="Book a time"
              />
            ) : form ? (
              <PublicForm form={form} />
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
