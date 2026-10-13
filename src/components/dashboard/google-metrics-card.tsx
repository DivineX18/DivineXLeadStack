"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { BarChart3, Search, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";

/**
 * Google reporting on the workspace dashboard.
 *
 * Reads the stored snapshot, never Google. The sync is the only thing that
 * talks to Google, so rendering this card costs no API quota however many
 * times it is opened — which matters on Explorer-tier limits.
 *
 * Renders NOTHING when there is no snapshot: a workspace that has not
 * connected Google should not carry an empty card explaining a feature it is
 * not using. The place to connect is Settings, which is where the card points
 * once a connection exists but nothing is selected.
 */

interface Snapshot {
  rangeStart?: string;
  rangeEnd?: string;
  fetchedAt?: { toDate?: () => Date };
  ga4?: {
    sessions: number;
    activeUsers: number;
    newUsers: number;
    conversions: number;
  } | null;
  searchConsole?: {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    topQueries?: { query: string; clicks: number; impressions: number; position: number }[];
  } | null;
  errors?: { service: string; message: string }[];
}

/**
 * `flow`   — the Tailwind card styling the Flow dashboard uses.
 * `ascend` — the DivineX design tokens the Ascend shell uses.
 * One component either way: the data logic, the quota guarantee and the
 * partial-failure handling are the substance here, and duplicating them to
 * restyle a wrapper is how two copies start to disagree.
 */
export function GoogleMetricsCard({ variant = "flow" }: { variant?: "flow" | "ascend" } = {}) {
  const { subAccount, saPath } = useSubAccount();
  const ascend = variant === "ascend";
  const subAccountId = subAccount?.id ?? null;
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!subAccountId) return;
    const db = getFirebaseDb();
    return onSnapshot(
      doc(db, "subAccounts", subAccountId, "googleMetrics", "latest"),
      (d) => {
        setSnap(d.exists() ? (d.data() as Snapshot) : null);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
  }, [subAccountId]);

  if (!loaded || !snap) return null;

  const ga4 = snap.ga4 ?? null;
  const gsc = snap.searchConsole ?? null;
  if (!ga4 && !gsc) return null;

  const fetched = snap.fetchedAt?.toDate?.();

  return (
    <section
      className={ascend ? "mt-8 rounded-[var(--dx-radius)] border p-5" : "rounded-xl border bg-card p-6"}
      style={
        ascend
          ? { backgroundColor: "var(--dx-surface-2)", borderColor: "var(--dx-border-subtle)" }
          : undefined
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            className={ascend ? "flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" : "flex items-center gap-2 text-lg font-semibold"}
            style={ascend ? { color: "var(--dx-text-muted)" } : undefined}
          >
            <TrendingUp className={ascend ? "h-3.5 w-3.5" : "h-5 w-5"} />
            Search &amp; traffic
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {snap.rangeStart && snap.rangeEnd
              ? `${snap.rangeStart} to ${snap.rangeEnd}`
              : "Last 28 days"}
            {fetched ? ` · updated ${fetched.toLocaleDateString()}` : ""}
          </p>
        </div>
        <Link
          href={saPath("/dashboard/settings")}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Manage connection
        </Link>
      </div>

      {ga4 && (
        <div className="mt-5">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5" /> Google Analytics
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Sessions" value={ga4.sessions} />
            <Stat label="Users" value={ga4.activeUsers} />
            <Stat label="New users" value={ga4.newUsers} />
            <Stat label="Conversions" value={ga4.conversions} />
          </div>
        </div>
      )}

      {gsc && (
        <div className="mt-6">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Search className="h-3.5 w-3.5" /> Search Console
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Clicks" value={gsc.clicks} />
            <Stat label="Impressions" value={gsc.impressions} />
            <Stat label="CTR" value={`${(gsc.ctr * 100).toFixed(1)}%`} />
            <Stat label="Avg. position" value={gsc.position.toFixed(1)} />
          </div>
          {!!gsc.topQueries?.length && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Top queries
              </p>
              <ul className="space-y-1 text-sm">
                {gsc.topQueries.slice(0, 5).map((q) => (
                  <li key={q.query} className="flex items-baseline justify-between gap-3">
                    <span className="truncate">{q.query}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {q.clicks} click{q.clicks === 1 ? "" : "s"} · pos {q.position.toFixed(1)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* A partial sync still shows what worked, and says what did not, rather
          than implying the missing service simply had no traffic. */}
      {!!snap.errors?.length && (
        <p className="mt-4 text-xs text-muted-foreground">
          {snap.errors.map((e) => `${e.service} didn't update: ${e.message}`).join(" · ")}
        </p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
