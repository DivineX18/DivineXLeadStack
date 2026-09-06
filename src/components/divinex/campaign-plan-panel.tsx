"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * THE CAMPAIGN PLAN, made visible.
 *
 * The plan was already persisted, already inherited by downstream generators,
 * and already change-aware. It was simply invisible: a customer could not see
 * what was planned, what was waiting on them, or say yes to it. A plan nobody
 * can read is not a plan.
 *
 * Business-owner language throughout. No step ids, no capability names, no
 * status enums leaking to the surface. Three decisions and no more: approve
 * it, ask for changes, or drop it.
 */

type StepStatus = "planned" | "in_progress" | "review" | "approved" | "connected" | "skipped" | "live" | "needs_update";

interface Step {
  id: string;
  label: string;
  status: StepStatus;
  rationale?: string;
  assetId?: string | null;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  approved: { centralPromise?: string; primaryCta?: string; audience?: string };
  steps: Step[];
}

/** What each state means to someone who does not work here. */
const STATE: Record<StepStatus, { label: string; tone: string; needsYou?: boolean }> = {
  planned: { label: "Planned", tone: "text-[var(--dx-text-muted)]" },
  in_progress: { label: "Being worked on", tone: "text-sky-500 dark:text-sky-400" },
  review: { label: "Waiting on you", tone: "text-amber-500 dark:text-amber-400", needsYou: true },
  approved: { label: "Approved", tone: "text-emerald-500 dark:text-emerald-400" },
  connected: { label: "Connected", tone: "text-emerald-500 dark:text-emerald-400" },
  live: { label: "Live", tone: "text-emerald-500 dark:text-emerald-400" },
  skipped: { label: "Dropped", tone: "text-[var(--dx-text-muted)]" },
  needs_update: { label: "Out of date", tone: "text-amber-500 dark:text-amber-400", needsYou: true },
};

export function CampaignPlanPanel({ saId, isAdmin }: { saId: string; isAdmin: boolean }) {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [changingStep, setChangingStep] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sub-accounts/${saId}/campaigns`);
        const data = (await res.json().catch(() => null)) as { campaigns?: Campaign[] } | null;
        if (!cancelled) setCampaigns(res.ok ? (data?.campaigns ?? []) : []);
      } catch {
        if (!cancelled) setCampaigns([]);
      }
    })();
    return () => { cancelled = true; };
  }, [saId]);

  async function decide(campaignId: string, stepId: string, action: "approve" | "request_changes" | "cancel") {
    setBusy(stepId);
    setError(null);
    try {
      const res = await fetch(`/api/sub-accounts/${saId}/campaigns/${campaignId}/steps/${stepId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...(action === "request_changes" ? { note } : {}) }),
      });
      const data = (await res.json().catch(() => null)) as { steps?: Step[]; error?: string } | null;
      if (!res.ok || !data?.steps) {
        setError(data?.error ?? "That didn't go through. Try again in a moment.");
        return;
      }
      setCampaigns((prev) => prev?.map((c) => (c.id === campaignId ? { ...c, steps: data.steps! } : c)) ?? null);
      setChangingStep(null);
      setNote("");
    } catch {
      setError("That didn't go through. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  // Silent while loading, and absent when there is no campaign. This panel is
  // additive: most workspaces build things individually and never have a plan,
  // so a spinner that resolves to nothing would put a flicker of ceremony
  // above the page every single time it loads.
  if (campaigns === null || campaigns.length === 0) return null;

  return (
    <div className="space-y-6">
      {campaigns.map((c) => {
        const waiting = c.steps.filter((s) => STATE[s.status]?.needsYou).length;
        return (
          <div key={c.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold tracking-tight" style={{ color: "var(--dx-text-primary)" }}>
                {c.name}
              </h3>
              <span className="text-xs" style={{ color: "var(--dx-text-muted)" }}>
                {waiting > 0
                  ? `${waiting} thing${waiting === 1 ? "" : "s"} waiting on you`
                  : "Nothing needs you right now"}
              </span>
            </div>

            {c.approved?.centralPromise && (
              <p className="mt-1 text-xs" style={{ color: "var(--dx-text-secondary)" }}>
                What it promises: {c.approved.centralPromise}
                {c.approved.primaryCta ? ` · What you want them to do: ${c.approved.primaryCta}` : ""}
              </p>
            )}

            <ul className="mt-3 space-y-2">
              {c.steps.map((s) => {
                const state = STATE[s.status] ?? STATE.planned;
                return (
                  <li
                    key={s.id}
                    className="rounded-[var(--dx-radius)] border p-3"
                    style={{ borderColor: "var(--dx-border-subtle)" }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm" style={{ color: "var(--dx-text-primary)" }}>{s.label}</span>
                      <span className={`text-xs font-medium ${state.tone}`}>{state.label}</span>
                    </div>
                    {s.rationale && (
                      <p className="mt-1 text-xs" style={{ color: "var(--dx-text-muted)" }}>{s.rationale}</p>
                    )}

                    {isAdmin && state.needsYou && changingStep !== s.id && (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <Button size="sm" disabled={busy === s.id} onClick={() => void decide(c.id, s.id, "approve")}>
                          {busy === s.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                          Looks good
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => { setChangingStep(s.id); setNote(""); }}>
                          <MessageSquare className="mr-1 h-3.5 w-3.5" /> Ask for changes
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy === s.id} onClick={() => void decide(c.id, s.id, "cancel")}>
                          <X className="mr-1 h-3.5 w-3.5" /> Drop this
                        </Button>
                      </div>
                    )}

                    {changingStep === s.id && (
                      <div className="mt-2.5">
                        <Textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          rows={3}
                          placeholder="What would you change? Say it however you'd say it out loud."
                          autoFocus
                        />
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            disabled={busy === s.id || !note.trim()}
                            onClick={() => void decide(c.id, s.id, "request_changes")}
                          >
                            {busy === s.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                            Send it back
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setChangingStep(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
