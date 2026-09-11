"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * UNIFIED CREATE — the Asset Studio surface.
 *
 * This is the reason a DivineX Complete customer never has to open standalone
 * Ascend: the mature deliverables (VSL scripts, ad/social copy, lead magnets,
 * sales scripts, proposals, content plans) are requested and read right here.
 *
 * Flow renders and transports only. Generation runs Ascend's existing Asset
 * Studio through /api/sub-accounts/[id]/divinex/assets, so there is no second
 * generator and no copied prompt — see that route and lib/divinex/ascend-client.
 */

/** Grouped for the customer, not by internal taxonomy — someone wanting "a
 *  video script" should not have to know which engine produces it. */
const GROUPS: { label: string; types: string[] }[] = [
  { label: "Scripts & video", types: ["VSL Script", "Webinar Script", "Sales Call Script", "Discovery Call Script", "DM Script"] },
  { label: "Lead magnets & documents", types: ["Lead Magnet", "Lead Magnet Full Draft", "Proposal"] },
  { label: "Ads, social & content", types: ["Content Plan", "90-Day Roadmap"] },
  { label: "Offers & page copy", types: ["Offer", "Landing Page Copy", "Sales Page Copy", "Thank You Page Copy", "9-Email Sequence", "Funnel Workflow Map"] },
];

interface AssetRow {
  id: number;
  assetType: string;
  title: string;
  content: string;
  source: string | null;
  createdAt: string;
}

export function AscendAssetsSection({ saId, isAdmin }: { saId: string; isAdmin: boolean }) {
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [open, setOpen] = useState<AssetRow | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sub-accounts/${saId}/divinex/assets`, { cache: "no-store" });
      const data = (await res.json()) as { assets?: AssetRow[]; unavailable?: string };
      setAssets(data.assets ?? []);
      setUnavailable(data.unavailable ?? null);
    } catch {
      setUnavailable("unreachable");
    } finally {
      setLoading(false);
    }
  }, [saId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Start generation, then poll until the asset exists.
   *
   * This waits minutes, deliberately. Writing one of these against a real
   * business profile takes 100–172 seconds; the previous single request was
   * cut short by timeouts below that, so correct work was reported to
   * customers as failure. Nothing here is faster — it just stops lying about
   * slow.
   *
   * The ceiling is generous but finite: a job that genuinely dies is reported
   * as failed by the server, and if even that never arrives we stop rather
   * than spin forever.
   */
  async function generate(assetType: string) {
    setGenerating(assetType);
    try {
      const start = await fetch(`/api/sub-accounts/${saId}/divinex/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetType }),
      });
      const started = (await start.json()) as { jobId?: number; error?: string };
      if (!start.ok || typeof started.jobId !== "number") {
        toast.error(started.error ?? "Couldn't start that just now.");
        return;
      }

      const deadline = Date.now() + 6 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 4000));
        let res: Response;
        try {
          res = await fetch(`/api/sub-accounts/${saId}/divinex/assets/jobs/${started.jobId}`, {
            cache: "no-store",
          });
        } catch {
          continue; // a dropped poll says nothing about the job; ask again
        }
        // 503 here means the status check failed, not the generation.
        if (res.status === 503) continue;
        const data = (await res.json()) as {
          status?: string;
          asset?: AssetRow | null;
          errorMessage?: string | null;
          error?: string;
        };
        if (!res.ok) {
          toast.error(data.error ?? "Couldn't generate that just now.");
          return;
        }
        if (data.status === "failed") {
          toast.error(data.errorMessage ?? "That didn't generate. Try again.");
          return;
        }
        if (data.status === "completed" && data.asset) {
          toast.success(`${assetType} ready — written from your business and brand.`);
          setAssets((prev) => [data.asset!, ...prev]);
          setOpen(data.asset);
          return;
        }
      }
      toast.error("That's taking longer than expected. Check your assets shortly — it may still arrive.");
    } catch {
      toast.error("Couldn't reach the generator. Try again in a moment.");
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-[var(--dx-text-primary)]">Assets</h2>
        <p className="mt-1 text-sm text-[var(--dx-text-muted)]">
          Scripts, lead magnets, proposals and content plans, written from this workspace&apos;s own
          business and brand. Ask Zeno for any of these too.
        </p>
      </div>

      {unavailable === "workspace_not_linked" ? (
        <p className="rounded-[var(--dx-radius-md)] border p-4 text-sm text-[var(--dx-text-muted)]"
           style={{ borderColor: "var(--dx-border-subtle)" }}>
          Finish onboarding to connect this workspace&apos;s business profile — these are written from
          your real business, so there&apos;s nothing to write from yet.
        </p>
      ) : unavailable ? (
        <p className="rounded-[var(--dx-radius-md)] border p-4 text-sm text-[var(--dx-text-muted)]"
           style={{ borderColor: "var(--dx-border-subtle)" }}>
          Asset generation isn&apos;t available on this deployment yet.
        </p>
      ) : (
        isAdmin && (
          <div className="space-y-4">
            {GROUPS.map((g) => (
              <div key={g.label}>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--dx-text-muted)]">{g.label}</p>
                <div className="flex flex-wrap gap-2">
                  {g.types.map((t) => (
                    <Button
                      key={t}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!!generating}
                      onClick={() => void generate(t)}
                    >
                      {generating === t ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {t}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            {generating && (
              // Two to three minutes of silence reads as broken. Say what is
              // happening and roughly how long, so waiting is a choice rather
              // than a guess.
              <p className="flex items-center gap-2 text-sm text-[var(--dx-text-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Writing your {generating} from this workspace&apos;s business and brand. This usually
                takes one to three minutes — you can leave this page, it&apos;ll be saved to your assets.
              </p>
            )}
          </div>
        )
      )}

      <div className="space-y-2">
        {loading ? (
          <p className="text-sm text-[var(--dx-text-muted)]">Loading your assets…</p>
        ) : assets.length === 0 ? (
          !unavailable && (
            <p className="text-sm text-[var(--dx-text-muted)]">
              Nothing here yet — pick one above, or just ask Zeno.
            </p>
          )
        ) : (
          assets.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setOpen(a)}
              className="flex w-full items-center gap-3 rounded-[var(--dx-radius-md)] border p-3 text-left transition-colors hover:bg-[var(--dx-hover)]"
              style={{ borderColor: "var(--dx-border-subtle)" }}
            >
              <FileText className="h-4 w-4 shrink-0 text-[var(--dx-text-muted)]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--dx-text-primary)]">{a.title}</span>
                <span className="block text-xs text-[var(--dx-text-muted)]">{a.assetType}</span>
              </span>
            </button>
          ))
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(null)}
          role="presentation"
        >
          <div
            className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-[var(--dx-radius-lg)] border p-6"
            style={{ backgroundColor: "var(--dx-surface-1)", borderColor: "var(--dx-border-subtle)" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={open.title}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--dx-text-primary)]">{open.title}</h3>
                <p className="text-xs text-[var(--dx-text-muted)]">{open.assetType}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(open.content);
                    toast.success("Copied");
                  }}
                >
                  Copy
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(null)}>
                  Close
                </Button>
              </div>
            </div>
            {/* SAYS WHAT THIS IS, SO IT ISN'T MISTAKEN FOR SOMETHING LIVE.
                A written asset is text: it is copied out, not published from
                here. The paths that actually build something in Flow (a funnel
                page, a follow-up sequence) run through Zeno, so this points
                there rather than leaving the reader to work out why there is no
                publish button. */}
            <p className="mb-4 rounded-lg border border-[var(--dx-border-subtle)] px-3 py-2 text-xs text-[var(--dx-text-muted)]">
              This is written copy to use wherever you need it. To build something live in Flow instead
              (a page, a form, a follow-up sequence), ask Zeno to create it and you&apos;ll get a draft to publish.
            </p>
            <pre className="whitespace-pre-wrap break-words font-sans text-sm text-[var(--dx-text-primary)]">
              {open.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
