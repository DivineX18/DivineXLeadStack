import type { ReactNode } from "react";

/**
 * The shared card shell for every Ascend surface.
 *
 * PRODUCTION EXPERIENCE 2.0 (Phase C): moved off hard-coded `white/10` +
 * `--glass-*` onto the semantic tokens defined in globals.css, so the whole
 * app changes colour in one place, and given an `emphasis` scale.
 *
 * The scale exists because Home was eleven identically-weighted cards in a
 * flat grid — everything equally important means nothing is, and the eye
 * has nowhere to land. Emphasis lets a screen say what matters most:
 *
 *   primary — the one thing to act on. Brighter surface, accent hairline.
 *   default — the substance of the page.
 *   quiet   — reference material; present, deliberately recessive.
 */
export type CardEmphasis = "primary" | "default" | "quiet";

const SURFACE: Record<CardEmphasis, { bg: string; border: string; shadow: string }> = {
  primary: { bg: "var(--dx-elevated)", border: "var(--dx-primary)", shadow: "var(--dx-shadow-2)" },
  default: { bg: "var(--dx-surface-2)", border: "var(--dx-border-subtle)", shadow: "var(--dx-shadow-1)" },
  quiet: { bg: "var(--dx-surface-1)", border: "var(--dx-border-subtle)", shadow: "none" },
};

export function AscendCardShell({
  title,
  action,
  children,
  emphasis = "default",
  footer,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  emphasis?: CardEmphasis;
  /** Actions or context that belong under the content, separated by a rule. */
  footer?: ReactNode;
  className?: string;
}) {
  const s = SURFACE[emphasis];
  return (
    <section
      className={`flex flex-col rounded-[var(--dx-radius-lg)] border p-5 ${className}`}
      style={{ backgroundColor: s.bg, borderColor: s.border, boxShadow: s.shadow }}
    >
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-2">
          {title && (
            <h3
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--dx-text-muted)" }}
            >
              {title}
            </h3>
          )}
          {action}
        </div>
      )}
      <div className="min-w-0 flex-1">{children}</div>
      {footer && (
        <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--dx-border-subtle)" }}>
          {footer}
        </div>
      )}
    </section>
  );
}
