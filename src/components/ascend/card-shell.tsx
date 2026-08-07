import type { ReactNode } from "react";

/**
 * Ascend OS Phase 2, Slice 9 — shared glass-card shell, reusing the exact
 * `.glass-card`-equivalent visual language already locked into the
 * Architecture Specification's Design System section (Section 8) and the
 * real Ascend Intelligence frontend's own `.glass-card`/`--glass-*`
 * tokens (confirmed this effort, `divinex/src/index.css`) — `--glass-1/2/3`
 * are already defined in this repo's `.theme-ascend` block (globals.css)
 * anticipating exactly this use.
 */
export function AscendCardShell({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-2xl border border-white/10 p-5"
      style={{ background: "var(--glass-1)", backdropFilter: "blur(12px)" }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-white/70">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
