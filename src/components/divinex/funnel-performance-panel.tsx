import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getAdminDb } from "@/lib/firebase/admin";
import { listFunnelPerformance } from "@/lib/funnels/telemetry";
import { Panel } from "@/components/divinex/ui";

/**
 * PAGE PERFORMANCE — the measured half of the Unified loop, on the page where
 * the customer already asks "is it working?".
 *
 * Shows only what was actually measured. A page with no traffic says so; it
 * never renders 0% conversion, because "nobody has visited yet" and "nobody
 * converts" are different facts and confusing them would send the customer to
 * fix the wrong thing.
 */
export async function FunnelPerformancePanel({ subAccountId }: { subAccountId: string }) {
  const [perf, funnelsSnap] = await Promise.all([
    listFunnelPerformance(subAccountId).catch(() => []),
    getAdminDb().collection("funnels").where("subAccountId", "==", subAccountId).limit(100).get().catch(() => null),
  ]);

  const names = new Map<string, { name: string; status: string }>();
  for (const d of funnelsSnap?.docs ?? []) {
    const f = d.data() as { name?: string; status?: string };
    names.set(d.id, { name: f.name || "Untitled page", status: f.status || "draft" });
  }

  const live = [...names.entries()].filter(([, f]) => f.status === "published");
  const rows = live.map(([id, f]) => {
    const p = perf.find((x) => x.funnelId === id);
    return { id, name: f.name, views: p?.views ?? 0, submissions: p?.submissions ?? 0, rate: p?.conversionRate ?? null };
  }).sort((a, b) => b.views - a.views);

  return (
    <Panel className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dx-text-muted)" }}>
          Live pages
        </p>
        <Link href="/create" className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--dx-primary)" }}>
          Manage pages <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: "var(--dx-text-secondary)" }}>
          Nothing is live yet. Once you publish a page, its visitors and sign-ups show up here.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: "var(--dx-text-muted)" }}>
                <th className="pb-2 font-medium">Page</th>
                <th className="pb-2 text-right font-medium">Visitors</th>
                <th className="pb-2 text-right font-medium">Sign-ups</th>
                <th className="pb-2 text-right font-medium">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--dx-border-subtle)" }}>
                  <td className="py-2 pr-3" style={{ color: "var(--dx-text-primary)" }}>{r.name}</td>
                  <td className="py-2 text-right tabular-nums" style={{ color: "var(--dx-text-secondary)" }}>
                    {r.views || "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums" style={{ color: "var(--dx-text-secondary)" }}>
                    {r.submissions || "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums" style={{ color: "var(--dx-text-secondary)" }}>
                    {/* No traffic means no conversion rate exists yet — saying
                     *  "0%" would read as a failing page rather than an
                     *  unvisited one. */}
                    {r.rate === null ? "No visits yet" : `${(r.rate * 100).toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
