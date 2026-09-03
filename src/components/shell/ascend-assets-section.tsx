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

  async function generate(assetType: string) {
    setGenerating(assetType);
    try {
      const res = await fetch(`/api/sub-accounts/${saId}/divinex/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetType }),
      });
      const data = (await res.json()) as { asset?: AssetRow; error?: string };
      if (!res.ok || !data.asset) {
        toast.error(data.error ?? "Couldn't generate that just now.");
        return;
      }
      toast.success(`${assetType} ready — written from your business and brand.`);
      setAssets((prev) => [data.asset!, ...prev]);
      setOpen(data.asset);
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
            <pre className="whitespace-pre-wrap break-words font-sans text-sm text-[var(--dx-text-primary)]">
              {open.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
