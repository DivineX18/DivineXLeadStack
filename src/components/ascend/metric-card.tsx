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

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
