"use client";

import { useState } from "react";
import { Camera, ImageIcon, Sparkles } from "lucide-react";
import type { VisualRequirement } from "@/types/funnels";

/**
 * The missing-media resolution loop, shown in preview — P0.5.
 *
 * Replaces a blank rectangle labelled "Add a video" with the actual shot
 * brief and three ways to satisfy it. Every action targets a STABLE
 * REQUIREMENT ID, so it resolves that specific slot rather than opening a
 * generic asset page and hoping the operator reconnects it.
 *
 * Completed Director decisions are deliberately absent: they live in a
 * different field and are not shown here, because "the gallery was omitted
 * because only one strong photograph exists" is a resolved choice, not
 * something to fix. Showing it would imply the page is incomplete.
 */
export function VisualRequirementsPanel({
  subAccountId,
  funnelId,
  requirements,
}: {
  subAccountId: string;
  funnelId: string;
  requirements: VisualRequirement[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  const outstanding = requirements.filter((r) => !r.resolvedWith && !done[r.id]);
  if (outstanding.length === 0) return null;

  const blocking = outstanding.filter((r) => r.necessity === "required").length;
  const improvements = outstanding.length - blocking;

  async function resolve(requirementId: string, provenance: string) {
    const url = window.prompt("Image URL for this slot");
    if (!url) return;
    setBusy(requirementId);
    setError(null);
    const res = await fetch(
      `/api/sub-accounts/${subAccountId}/funnels/${funnelId}/visual-requirements/${requirementId}/resolve`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provenance, url }) },
    );
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!res.ok) { setError(data.error ?? "Couldn't attach that image."); return; }
    setDone((d) => ({ ...d, [requirementId]: url }));
  }

  return (
    <div
      className="mx-auto my-6 max-w-3xl rounded-[var(--dx-radius-lg)] border p-5"
      style={{ backgroundColor: "var(--dx-surface-1)", borderColor: "var(--dx-border-subtle)" }}
    >
      {/* Capability, not deficiency: the page publishes today and improves
          when real photography exists. */}
      <p className="text-sm font-semibold" style={{ color: "var(--dx-text-primary)" }}>
        {blocking > 0
          ? `${blocking} photo${blocking === 1 ? "" : "s"} needed before this page works properly.`
          : `Publishable now. Stronger with ${improvements} photo${improvements === 1 ? "" : "s"}.`}
      </p>

      <ul className="mt-4 space-y-4">
        {outstanding.map((r) => (
          <li key={r.id} className="rounded-[var(--dx-radius)] border p-4" style={{ borderColor: "var(--dx-border-subtle)" }}>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dx-text-muted)" }}>
              <Camera className="h-3.5 w-3.5" /> Photo needed
            </p>
            {/* The specific brief — actionable without asking us what to shoot. */}
            <p className="mt-1.5 text-sm" style={{ color: "var(--dx-text-primary)" }}>{r.brief}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button" disabled={busy === r.id} onClick={() => resolve(r.id, "first_party_upload")}
                className="dx-primary-action inline-flex items-center gap-1.5 rounded-[var(--dx-radius-sm)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                <Camera className="h-3.5 w-3.5" /> Upload photo
              </button>
              <button
                type="button" disabled={busy === r.id} onClick={() => resolve(r.id, "brand_library")}
                className="dx-secondary-action inline-flex items-center gap-1.5 rounded-[var(--dx-radius-sm)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                <ImageIcon className="h-3.5 w-3.5" /> Choose from Brand Library
              </button>
              <button
                type="button" disabled={busy === r.id} onClick={() => resolve(r.id, "generated")}
                className="dx-secondary-action inline-flex items-center gap-1.5 rounded-[var(--dx-radius-sm)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" /> Generate alternative
              </button>
            </div>
            {/* Stated plainly: a generated visual fills the slot without ever
                becoming evidence of the business's real work. */}
            <p className="mt-2 text-[11px]" style={{ color: "var(--dx-text-muted)" }}>
              A generated image fills the space but isn&apos;t used as proof of your work.
            </p>
          </li>
        ))}
      </ul>

      {error && (
        <p className="mt-3 text-xs" style={{ color: "var(--dx-destructive)" }}>{error}</p>
      )}
    </div>
  );
}
