"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Loader2 } from "lucide-react";
import type { DesignFeedback, DesignPrinciple, FunnelDesignReview } from "@/types/design-intelligence";

/**
 * Command Center → Design Intelligence — "surfaces how many landing pages
 * have been analyzed, common winning patterns by industry, top-performing
 * section types, recent calibration insights" (locked North Star spec).
 * Reuses the Command Center's existing agency-owner gating and page layout
 * per the spec's own instruction ("don't stand up a parallel admin surface
 * for this") — this is just one more section on that page, styled like
 * AscendRolloutSection next to it.
 */
export function DesignIntelligenceSection() {
  const [principles, setPrinciples] = useState<DesignPrinciple[] | null>(null);
  const [queue, setQueue] = useState<{
    feedback: DesignFeedback[];
    reviews: FunnelDesignReview[];
    summary: { totalReviewed: number; avgScore: number | null; belowBarCount: number; pendingFeedbackCount: number };
  } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const [pRes, qRes] = await Promise.all([
        fetch("/api/agency/design-intelligence/principles"),
        fetch("/api/agency/design-intelligence/queue"),
      ]);
      if (!pRes.ok || !qRes.ok) throw new Error();
      const pData = await pRes.json();
      const qData = await qRes.json();
      setPrinciples(pData.principles);
      setQueue(qData);
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggleActive(id: string, active: boolean) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/agency/design-intelligence/principles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error();
      setPrinciples((prev) => prev?.map((p) => (p.id === id ? { ...p, active } : p)) ?? null);
      toast.success(active ? "Principle re-activated." : "Principle deactivated.");
    } catch {
      toast.error("Couldn't update — try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (loadError) {
    return (
      <p className="rounded-xl border bg-background p-4 text-xs text-muted-foreground">
        Couldn&apos;t load design intelligence. Refresh to try again.
      </p>
    );
  }

  if (!principles || !queue) {
    return <div className="h-24 animate-pulse rounded-xl border bg-background" />;
  }

  const { summary } = queue;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Pages reviewed", value: summary.totalReviewed },
          { label: "Avg. score", value: summary.avgScore ?? "—" },
          { label: "Below premium bar", value: summary.belowBarCount },
          { label: "Feedback pending", value: summary.pendingFeedbackCount },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border bg-background p-3">
            <p className="text-lg font-semibold">{stat.value}</p>
            <p className="text-[11px] text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-background p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-foreground">
          <BookOpen className="h-3.5 w-3.5" />
          Design Knowledge Vault ({principles.filter((p) => p.active).length} active)
        </div>
        {principles.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No learned principles yet — they accumulate automatically as operators leave feedback on generated funnels.
          </p>
        ) : (
          <ul className="space-y-2">
            {principles.map((p) => (
              <li
                key={p.id}
                className={`flex items-start justify-between gap-3 rounded-lg border p-2.5 text-xs ${p.active ? "" : "opacity-50"}`}
              >
                <div>
                  <p className="text-foreground">{p.text}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {p.category.replace(/_/g, " ")}
                    {p.archetype ? ` · ${p.archetype.replace(/_/g, " ")}` : " · all archetypes"} · reinforced ×{p.timesReinforced}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => void toggleActive(p.id, !p.active)}
                  className="shrink-0 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {busyId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : p.active ? "Deactivate" : "Reactivate"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {queue.feedback.filter((f) => f.status === "pending").length > 0 && (
        <div className="rounded-xl border bg-background p-4">
          <p className="mb-2 text-xs font-medium text-foreground">Calibration queue — pending extraction</p>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {queue.feedback
              .filter((f) => f.status === "pending")
              .slice(0, 10)
              .map((f) => (
                <li key={f.id}>
                  <span className="font-medium text-foreground">{f.rating === "helpful" ? "👍" : "👎"}</span>{" "}
                  {f.whatImproved}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
