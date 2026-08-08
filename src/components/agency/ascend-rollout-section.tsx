"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Rocket } from "lucide-react";

/**
 * Ascend OS launch pass, Pass 2B — minimal operator UI for the
 * `unified_shell`/`unified_navigation` rollout flags. These previously had
 * zero UI: the only writer was the agency-owner-gated
 * `POST /api/platform/feature-flags` route, which nothing in the app ever
 * called — the only way to flip them was a manual Firestore write or an
 * undocumented curl. This card is deliberately a simple on/off (maps to
 * rolloutStage "ga" | "off") rather than exposing all six rollout stages
 * (internal_admin/internal_qa/single_workspace/beta/etc.) — those remain
 * available via the same API for a future, more granular rollout UI if
 * ever needed; this is a launch cutover control, not a staged-rollout
 * console.
 */
const FLAG_IDS = ["unified_shell", "unified_navigation"] as const;
type FlagId = (typeof FLAG_IDS)[number];

const FLAG_LABELS: Record<FlagId, string> = {
  unified_shell: "Full Ascend shell (app.divinex.io)",
  unified_navigation: "Unified lifecycle navigation",
};

export function AscendRolloutSection() {
  const [enabled, setEnabled] = useState<Record<FlagId, boolean> | null>(null);
  const [saving, setSaving] = useState<FlagId | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/platform/feature-flags")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load failed"))))
      .then((data: { flags: { id: string; rolloutStage: string }[] }) => {
        if (cancelled) return;
        const next: Record<FlagId, boolean> = { unified_shell: false, unified_navigation: false };
        for (const flag of data.flags) {
          if (FLAG_IDS.includes(flag.id as FlagId)) {
            next[flag.id as FlagId] = flag.rolloutStage === "ga";
          }
        }
        setEnabled(next);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle(id: FlagId, next: boolean) {
    if (!enabled) return;
    const previous = enabled[id];
    setEnabled({ ...enabled, [id]: next });
    setSaving(id);
    try {
      const res = await fetch("/api/platform/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, rolloutStage: next ? "ga" : "off" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Could not save.");
      toast.success(`${FLAG_LABELS[id]} ${next ? "enabled (GA)" : "disabled"}.`);
    } catch (err) {
      setEnabled({ ...enabled, [id]: previous });
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <Rocket className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Ascend OS rollout</h2>
          <p className="text-xs text-muted-foreground">
            Controls whether the Full Ascend unified shell activates at all —
            off by default deployment-wide until switched on here, regardless
            of any individual sub-account&apos;s entitlements.
          </p>
        </div>
      </div>

      {loadError ? (
        <p className="rounded-xl border bg-background p-4 text-xs text-muted-foreground">
          Couldn&apos;t load rollout status. Refresh to try again.
        </p>
      ) : !enabled ? (
        <div className="h-16 animate-pulse rounded-xl border bg-background" />
      ) : (
        FLAG_IDS.map((id) => (
          <div key={id} className="flex items-start justify-between gap-3 rounded-xl border bg-background p-4">
            <div>
              <p className="text-xs font-medium">{FLAG_LABELS[id]}</p>
              <p className="text-[11px] text-muted-foreground">
                {id === "unified_shell"
                  ? "Off = every visitor sees plain Flow regardless of hostname or entitlements. On (GA) = eligible workspaces (active Ascend workspace mapping + the sub-account's Ascend Intelligence gate) see the Full Ascend shell on app.divinex.io."
                  : "Governs the lifecycle-section navigation inside the Full Ascend shell once it's active."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled[id]}
              disabled={saving === id}
              onClick={() => handleToggle(id, !enabled[id])}
              className={
                "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 " +
                (enabled[id] ? "bg-emerald-500" : "bg-muted-foreground/30")
              }
            >
              <span
                className={
                  "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform " +
                  (enabled[id] ? "translate-x-4" : "translate-x-0.5")
                }
              />
            </button>
          </div>
        ))
      )}
    </section>
  );
}
