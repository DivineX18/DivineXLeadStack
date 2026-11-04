import { AscendCardShell } from "@/components/ascend/card-shell";
import { IntelligenceStatusBadge } from "@/components/ascend/intelligence-status-badge";
import type { IntelligenceFetchMeta } from "@/types/intelligence";

/** Generic label+value metric card — Revenue, Leads, Pipeline, Tasks,
 *  Appointments all share this shape. `meta` is optional: Flow-sourced
 *  operational metrics carry their own WithMeta status independently from
 *  Ascend intelligence, per the master prompt's "cache intelligence
 *  independently from CRM data" requirement. */
export function MetricCard({
  label,
  value,
  subLabel,
  meta,
}: {
  label: string;
  value: string;
  subLabel?: string;
  meta?: IntelligenceFetchMeta;
}) {
  return (
    <AscendCardShell title={label} action={meta ? <IntelligenceStatusBadge meta={meta} /> : undefined}>
      <p className="text-2xl font-semibold tracking-tight text-[var(--dx-text-primary)]">{value}</p>
      {subLabel && <p className="mt-1 text-xs text-[var(--dx-text-muted)]">{subLabel}</p>}
    </AscendCardShell>
  );
}

export interface StripMetric {
  label: string;
  value: string;
  subLabel?: string;
}

/**
 * Tailwind cannot generate a class from a template string, so the column
 * counts this strip supports are written out.
 */
const STRIP_COLUMNS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
};

/**
 * The compact numbers strip.
 *
 * Home introduced this treatment with a reason worth keeping: a section's
 * numbers should be scannable in one pass, "not five equal cards competing
 * with the lead". But it was inline markup, so Performance grew its own
 * byte-identical copy and Leads used the heavier MetricCard instead, which
 * left the same four numbers rendered two different ways on two pages a
 * click apart. This is Home's treatment, extracted.
 *
 * `meta` is explained ONCE, under the strip, rather than as a badge on each
 * tile. Five tiles reading "-" with no explanation is the state that made a
 * failed read indistinguishable from a workspace with no data, and five
 * copies of the same badge is noise.
 */
export function MetricStrip({ metrics, meta }: { metrics: StripMetric[]; meta?: IntelligenceFetchMeta }) {
  const columns = STRIP_COLUMNS[metrics.length] ?? STRIP_COLUMNS[4];
  const unread = meta !== undefined && meta.status !== "ok";
  return (
    <div>
      <div className={`grid gap-3 ${columns}`}>
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-[var(--dx-radius)] border p-4"
            style={{ backgroundColor: "var(--dx-surface-2)", borderColor: "var(--dx-border-subtle)" }}
          >
            <p className="text-[11px] leading-snug" style={{ color: "var(--dx-text-muted)" }}>
              {m.label}
            </p>
            <p
              className="mt-1.5 text-xl font-semibold tracking-tight tabular-nums"
              style={{ color: "var(--dx-text-primary)" }}
            >
              {m.value}
            </p>
            {m.subLabel && (
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--dx-text-muted)" }}>
                {m.subLabel}
              </p>
            )}
          </div>
        ))}
      </div>
      {unread && (
        <p className="mt-2 text-xs" style={{ color: "var(--dx-text-muted)" }}>
          We couldn&apos;t read these just now, so they aren&apos;t zeroes. Your data is safe.
        </p>
      )}
    </div>
  );
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
