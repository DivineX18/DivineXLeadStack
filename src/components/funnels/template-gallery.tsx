"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Layers, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FUNNEL_TEMPLATES, templateIndustries, type FunnelTemplate } from "@/lib/funnels/templates";

/**
 * TEMPLATE GALLERY.
 *
 * Every card states its STRUCTURE, not just a name, because the thing that
 * makes this a library rather than a set of colour swatches is that the pages
 * are architecturally different. An operator choosing between "Quote request"
 * and "Strategy call" is choosing between a page that asks for a job and a
 * page that filters an applicant; the card should say so before they click.
 *
 * Choosing creates a real draft funnel and opens it in the ordinary editor.
 * Nothing is published, and there is no separate template-editing mode to
 * learn.
 */
export function TemplateGallery({ saId, baseHref }: { saId: string; baseHref: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState<string>("");
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const industries = useMemo(() => templateIndustries(), []);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FUNNEL_TEMPLATES.filter((t) => {
      if (industry && !t.industries.includes(industry)) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.structure.toLowerCase().includes(q) ||
        t.industries.some((i) => i.toLowerCase().includes(q))
      );
    });
  }, [query, industry]);

  async function choose(t: FunnelTemplate) {
    if (creating) return;
    setCreating(t.id);
    setError(null);
    try {
      const res = await fetch(`/api/sub-accounts/${saId}/funnels/from-template`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId: t.id }),
      });
      const data = (await res.json().catch(() => null)) as { funnelId?: string; error?: string } | null;
      if (!res.ok || !data?.funnelId) {
        setError(data?.error ?? "Could not start that template. Try again in a moment.");
        setCreating(null);
        return;
      }
      router.push(`${baseHref}/${data.funnelId}`);
    } catch {
      setError("Could not start that template. Check your connection and try again.");
      setCreating(null);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by what you need, or your industry"
            className="h-9 pl-8"
          />
        </div>
        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none sm:w-56 [&_option]:bg-background [&_option]:text-foreground"
        >
          <option value="">Every industry</option>
          {industries.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Nothing matches that. Try a broader search, or start from scratch and ask Zeno to build it.
        </p>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => void choose(t)}
              disabled={!!creating}
              className="group flex flex-col rounded-xl border p-4 text-left transition-colors hover:border-foreground/25 hover:bg-muted/40 disabled:opacity-60"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold tracking-tight">{t.name}</span>
                {creating === t.id ? (
                  <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.description}</p>
              <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <Layers className="mt-0.5 h-3 w-3 shrink-0 opacity-60" />
                {t.structure}
              </p>
              <div className="mt-3 flex flex-wrap gap-1">
                {t.industries.slice(0, 3).map((i) => (
                  <span key={i} className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                    {i}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
