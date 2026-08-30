import Link from "next/link";
import type { ReactNode } from "react";

/**
 * DIVINEX PRODUCTION EXPERIENCE 2.0 — shared production components.
 *
 * Every one of these reads the semantic tokens defined on `.theme-ascend`
 * (see globals.css) rather than literal colors, so the palette is changed
 * in exactly one place. Deliberately small: only patterns with clear
 * repeated use across Home, Campaigns, Funnels, Intelligence and Brand.
 *
 * Color is SEMANTIC here: cobalt = action/primary, jade = growth/success,
 * violet = Zeno/intelligence, amber = opportunity/attention, coral =
 * destructive only.
 */

/* ─────────────────────────── Page header ─────────────────────────── */

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]" style={{ color: "var(--dx-text-primary)" }}>
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed" style={{ color: "var(--dx-text-secondary)" }}>
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

/* ───────────────────────────── Actions ───────────────────────────── */

type ActionProps = {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  external?: boolean;
  className?: string;
  type?: "button" | "submit";
  "aria-label"?: string;
};

const ACTION_BASE =
  "inline-flex items-center justify-center gap-2 rounded-[var(--dx-radius)] px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";

function ActionShell({ href, external, onClick, disabled, className, children, type = "button", ...rest }: ActionProps & { className: string }) {
  if (href && !disabled) {
    return external ? (
      <a href={href} target="_blank" rel="noreferrer" className={className} {...rest}>
        {children}
      </a>
    ) : (
      <Link href={href} className={className} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={className} {...rest}>
      {children}
    </button>
  );
}

/** The unmistakable action on a screen. Cobalt. One per view, ideally. */
export function PrimaryAction({ className = "", ...props }: ActionProps) {
  return (
    <ActionShell
      {...props}
      className={`${ACTION_BASE} dx-primary-action ${className}`}
    />
  );
}

/** Supporting action — visible, clearly subordinate to the primary. */
export function SecondaryAction({ className = "", ...props }: ActionProps) {
  return (
    <ActionShell
      {...props}
      className={`${ACTION_BASE} dx-secondary-action ${className}`}
    />
  );
}

/* ──────────────────────────── Status chip ────────────────────────── */

export type StatusTone = "neutral" | "growth" | "opportunity" | "zeno" | "critical" | "primary";

const TONE_VARS: Record<StatusTone, { bg: string; fg: string }> = {
  neutral: { bg: "var(--dx-surface-3)", fg: "var(--dx-text-secondary)" },
  growth: { bg: "var(--dx-growth-subtle)", fg: "var(--dx-growth)" },
  opportunity: { bg: "var(--dx-opportunity-subtle)", fg: "var(--dx-opportunity)" },
  zeno: { bg: "var(--dx-zeno-subtle)", fg: "var(--dx-zeno)" },
  critical: { bg: "var(--dx-destructive-subtle)", fg: "var(--dx-destructive)" },
  primary: { bg: "var(--dx-primary-subtle)", fg: "var(--dx-primary)" },
};

/**
 * Status is communicated by LABEL first and color second (accessibility:
 * never color alone). An optional dot adds a non-color shape cue.
 */
export function StatusChip({
  label,
  tone = "neutral",
  dot = false,
}: {
  label: string;
  tone?: StatusTone;
  dot?: boolean;
}) {
  const v = TONE_VARS[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: v.bg, color: v.fg }}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: v.fg }} aria-hidden />}
      {label}
    </span>
  );
}

/* ────────────────────────────── Surface ──────────────────────────── */

export function Panel({
  children,
  className = "",
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={`rounded-[var(--dx-radius-lg)] border p-5 ${interactive ? "transition-colors hover:border-[var(--dx-border-active)] motion-reduce:transition-none" : ""} ${className}`}
      style={{
        backgroundColor: "var(--dx-surface-2)",
        borderColor: "var(--dx-border-subtle)",
        boxShadow: "var(--dx-shadow-1)",
      }}
    >
      {children}
    </div>
  );
}

/* ──────────────────────────── Empty state ────────────────────────── */

/**
 * Every empty state answers: what is this, why would I use it, what do I
 * do next. Never a bare "No items yet."
 */
export function EmptyState({
  icon,
  title,
  body,
  primary,
  secondary,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  primary?: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center rounded-[var(--dx-radius-lg)] border border-dashed px-6 py-14 text-center"
      style={{ borderColor: "var(--dx-border)", backgroundColor: "var(--dx-surface-1)" }}
    >
      {icon && (
        <span
          className="mb-4 flex h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--dx-primary-subtle)", color: "var(--dx-primary)" }}
        >
          {icon}
        </span>
      )}
      <p className="text-lg font-semibold" style={{ color: "var(--dx-text-primary)" }}>
        {title}
      </p>
      <p className="mt-2 max-w-md text-sm leading-relaxed" style={{ color: "var(--dx-text-secondary)" }}>
        {body}
      </p>
      {(primary || secondary) && (
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
          {primary}
          {secondary}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────── Error state ────────────────────────── */

/** Actionable by contract: what happened, what survived, what to do. */
export function ErrorState({
  title,
  body,
  detail,
  actions,
}: {
  title: string;
  body: string;
  detail?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      className="rounded-[var(--dx-radius-lg)] border p-5"
      style={{ borderColor: "var(--dx-destructive)", backgroundColor: "var(--dx-destructive-subtle)" }}
    >
      <p className="font-semibold" style={{ color: "var(--dx-text-primary)" }}>
        {title}
      </p>
      <p className="mt-1.5 text-sm" style={{ color: "var(--dx-text-secondary)" }}>
        {body}
      </p>
      {detail && (
        <p className="mt-2 text-xs" style={{ color: "var(--dx-text-muted)" }}>
          {detail}
        </p>
      )}
      {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/* ──────────────────────────── Skeletons ──────────────────────────── */

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[var(--dx-radius-sm)] motion-reduce:animate-none ${className}`}
      style={{ backgroundColor: "var(--dx-surface-3)" }}
    />
  );
}
