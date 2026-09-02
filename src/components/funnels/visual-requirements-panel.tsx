"use client";

import { useRef, useState } from "react";
import { Camera, ImageIcon, Loader2 } from "lucide-react";
import type { VisualRequirement } from "@/types/funnels";

/**
 * The missing-media resolution loop, shown in preview — P0.5.
 *
 * Replaces a blank rectangle labelled "Add a video" with the actual shot
 * brief and the ways to satisfy it that REALLY EXIST. Every action targets a
 * STABLE REQUIREMENT ID, so it resolves that specific slot rather than
 * opening a generic asset page and hoping the operator reconnects it.
 *
 * There is no "Generate alternative" here. The product has no image
 * generation capability, and a button that opened a URL prompt while calling
 * itself generation was a fake affordance — worse than an absent one,
 * because the operator would trust it. The provenance model keeps the
 * `generated` seam ready for when a real capability lands.
 *
 * Completed Director decisions are deliberately absent: they live in a
 * different field and are not shown here, because "the gallery was omitted
 * because only one strong photograph exists" is a resolved choice, not
 * something to fix. Showing it would imply the page is incomplete.
 */

interface LibraryAsset {
  url: string;
  classification: string;
  width: number | null;
  height: number | null;
  alt: string | null;
}

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
  const [picking, setPicking] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryAsset[] | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const outstanding = requirements.filter((r) => !r.resolvedWith && !done[r.id]);
  if (outstanding.length === 0) return null;

  const blocking = outstanding.filter((r) => r.necessity === "required").length;
  const improvements = outstanding.length - blocking;

  async function attach(requirementId: string, provenance: string, url: string) {
    setBusy(requirementId);
    setError(null);
    const res = await fetch(
      `/api/sub-accounts/${subAccountId}/funnels/${funnelId}/visual-requirements/${requirementId}/resolve`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provenance, url }) },
    );
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!res.ok) {
      setError(data.error ?? "Couldn't attach that image.");
      return;
    }
    setPicking(null);
    setDone((d) => ({ ...d, [requirementId]: url }));
  }

  /** Real upload: the operator's own file, through the existing asset route. */
  async function onFileChosen(requirementId: string, file: File) {
    setBusy(requirementId);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`/api/sub-accounts/${subAccountId}/funnels/${funnelId}/assets`, { method: "POST", body });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      setBusy(null);
      setError(data.error ?? "That file couldn't be uploaded.");
      return;
    }
    // The upload is stored; now bind it to THIS slot. Provenance is verified
    // server-side against the stored asset, not taken from this call.
    await attach(requirementId, "first_party_upload", data.url);
  }

  async function openLibrary(requirementId: string) {
    setPicking(requirementId);
    setError(null);
    if (library) return;
    setLibraryLoading(true);
    const res = await fetch(`/api/sub-accounts/${subAccountId}/brand-library`);
    const data = (await res.json().catch(() => ({ assets: [] }))) as { assets?: LibraryAsset[] };
    setLibrary(data.assets ?? []);
    setLibraryLoading(false);
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

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                ref={(el) => { fileInputs.current[r.id] = el; }}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = ""; // re-selecting the same file must still fire
                  if (file) void onFileChosen(r.id, file);
                }}
              />
              <button
                type="button" disabled={busy === r.id} onClick={() => fileInputs.current[r.id]?.click()}
                className="dx-primary-action inline-flex items-center gap-1.5 rounded-[var(--dx-radius-sm)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                Upload photo
              </button>
              <button
                type="button" disabled={busy === r.id} onClick={() => void openLibrary(r.id)}
                className="dx-secondary-action inline-flex items-center gap-1.5 rounded-[var(--dx-radius-sm)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                <ImageIcon className="h-3.5 w-3.5" /> Choose from Brand Library
              </button>
            </div>

            {picking === r.id && (
              <div className="mt-3 rounded-[var(--dx-radius-sm)] border p-3" style={{ borderColor: "var(--dx-border-subtle)" }}>
                {libraryLoading ? (
                  <p className="text-xs" style={{ color: "var(--dx-text-muted)" }}>Loading your approved photos…</p>
                ) : library && library.length > 0 ? (
                  <>
                    <p className="mb-2 text-[11px]" style={{ color: "var(--dx-text-muted)" }}>
                      Approved photos from your brand library.
                    </p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {library.map((a) => (
                        <button
                          key={a.url}
                          type="button"
                          disabled={busy === r.id}
                          onClick={() => void attach(r.id, "brand_library", a.url)}
                          className="group overflow-hidden rounded-[var(--dx-radius-sm)] border disabled:opacity-50"
                          style={{ borderColor: "var(--dx-border-subtle)" }}
                          title={a.alt ?? a.classification}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.url} alt={a.alt ?? ""} className="h-20 w-full object-cover" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs" style={{ color: "var(--dx-text-muted)" }}>
                    No approved photos yet. Upload one above, or approve assets in your brand profile.
                  </p>
                )}
                <button
                  type="button" onClick={() => setPicking(null)}
                  className="mt-2 text-[11px] underline" style={{ color: "var(--dx-text-muted)" }}
                >
                  Cancel
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <p className="mt-3 text-xs" style={{ color: "var(--dx-destructive)" }}>{error}</p>
      )}
    </div>
  );
}
