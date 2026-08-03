"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * Flow Phase 3 — the real modal system. Replaces the old "always mounted,
 * instantly-there overlay" popup: the page never reflows, the funnel's OWN
 * theme (not the OS's) sets the surface colors, and open/close both
 * animate (fade + scale) instead of snapping. ESC, click-outside, and the
 * X button all close it; the caller decides what "closing" means (the
 * CtaButton popup styles just hide it again).
 */
export function Modal({
  open,
  onClose,
  theme,
  accentColor,
  blurBackdrop = true,
  maxWidthClassName = "max-w-lg",
  ariaLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** The FUNNEL page's own theme — never the visitor's OS/browser
   *  preference, which is what the old implementation (CSS `Canvas` system
   *  color) accidentally used, producing a modal that could mismatch the
   *  page around it. */
  theme: "light" | "dark";
  accentColor: string;
  blurBackdrop?: boolean;
  maxWidthClassName?: string;
  /** Screen-reader label for the dialog — pass the popup's own headline or
   *  the triggering button's label; falls back to a generic "Dialog". */
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  // Kept mounted slightly past `open=false` so the exit transition can
  // play — otherwise React unmounts instantly and there's nothing to
  // animate. `visible` drives the actual CSS state; `rendered` drives
  // whether the DOM node exists at all.
  const [rendered, setRendered] = useState(open);
  const [visible, setVisible] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      setRendered(true);
      // Next paint, not this one — otherwise the browser coalesces the
      // "start at opacity 0" and "animate to opacity 1" into one frame and
      // nothing visibly transitions.
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    closeTimer.current = setTimeout(() => setRendered(false), 200);
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [open]);

  // Focus management: remember what had focus before the modal opened (the
  // CTA button, almost always), move focus INTO the modal on open so a
  // keyboard/screen-reader user isn't left on a now-obscured trigger, trap
  // Tab/Shift+Tab within the modal while it's open, and restore focus to
  // the trigger on close — the same contract Stripe/Calendly-style modals
  // follow, not a plain unmanaged HTML dialog.
  useEffect(() => {
    if (!rendered) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const focusTimer = setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (first ?? panelRef.current)?.focus();
    }, 0);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [rendered, onClose]);

  if (!rendered) return null;

  const dark = theme === "dark";
  const surfaceBg = dark ? "#171717" : "#ffffff";
  const surfaceFg = dark ? "#f5f5f5" : "#0a0a0a";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200"
      style={{
        backgroundColor: dark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.45)",
        backdropFilter: blurBackdrop ? "blur(4px)" : undefined,
        opacity: visible ? 1 : 0,
      }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || "Dialog"}
        tabIndex={-1}
        className={`relative max-h-[90vh] w-full overflow-y-auto rounded-2xl shadow-2xl outline-none transition-all duration-200 ${maxWidthClassName}`}
        style={{
          backgroundColor: surfaceBg,
          color: surfaceFg,
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1) translateY(0)" : "scale(0.96) translateY(8px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full opacity-60 transition-opacity hover:opacity-100"
          style={{ backgroundColor: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)" }}
        >
          <X className="h-4 w-4" />
        </button>
        <div style={{ "--flow-accent": accentColor } as React.CSSProperties}>{children}</div>
      </div>
    </div>
  );
}
