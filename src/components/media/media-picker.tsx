"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, Link2, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * SHARED MEDIA PICKER.
 *
 * The customer-facing answer to "how do I get my image onto this page?".
 * Before this, every media field was a bare URL box — which quietly required
 * the customer to go host the file somewhere else first. That is not an
 * acceptable product experience, so upload is the primary path and pasting a
 * link is the fallback, not the other way round.
 *
 * Deliberately generic (no funnel types in its props) so the same picker can
 * serve social posts, emails and any other Create surface later. Storage is
 * the existing workspace media library; this component only chooses a URL.
 *
 * STOCK and GENERATE are intentionally absent rather than disabled-with-a-
 * tooltip: no real provider is wired, and showing a dead affordance would
 * promise a capability that does not exist.
 */

type Tab = "upload" | "library" | "brand" | "link";

interface MediaItem {
  assetId: string;
  url: string;
  kind: string;
  filename: string;
  createdAt: number;
}

interface BrandAsset {
  id: number;
  fileUrl: string;
  classification: string | null;
  status?: string;
}

export function MediaPicker({
  saId,
  funnelId,
  open,
  onClose,
  onSelect,
  accept = "image",
  title = "Add media",
}: {
  saId: string;
  funnelId?: string;
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  /** "image" hides PDFs from the library; "any" shows everything. */
  accept?: "image" | "any";
  title?: string;
}) {
  const [tab, setTab] = useState<Tab>("upload");
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [brand, setBrand] = useState<BrandAsset[]>([]);
  const [link, setLink] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const loadLibrary = useCallback(async () => {
    try {
      const res = await fetch(`/api/sub-accounts/${saId}/media`, { cache: "no-store" });
      const d = (await res.json()) as { media?: MediaItem[] };
      setMedia((d.media ?? []).filter((m) => (accept === "image" ? m.kind === "image" : true)));
    } catch {
      /* the library is additive — a failed list must not block uploading */
    }
  }, [saId, accept]);

  const loadBrand = useCallback(async () => {
    try {
      const res = await fetch(`/api/sub-accounts/${saId}/divinex/profile-assets`, { cache: "no-store" });
      const d = (await res.json()) as { assets?: BrandAsset[] };
      // Only APPROVED brand assets — a discovery candidate the customer has
      // not confirmed is not theirs to publish.
      setBrand((d.assets ?? []).filter((a) => (a.status ?? "approved") === "approved"));
    } catch {
      setBrand([]);
    }
  }, [saId]);

  useEffect(() => {
    if (!open) return;
    void loadLibrary();
    void loadBrand();
  }, [open, loadLibrary, loadBrand]);

  async function upload(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (funnelId) fd.append("funnelId", funnelId);
      const res = await fetch(`/api/sub-accounts/${saId}/media`, { method: "POST", body: fd });
      const d = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !d.url) {
        toast.error(d.error ?? "Couldn't upload that file.");
        return;
      }
      toast.success("Uploaded");
      onSelect(d.url);
      onClose();
      void loadLibrary();
    } catch {
      toast.error("Couldn't upload that file.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const TABS: { id: Tab; label: string }[] = [
    { id: "upload", label: "Upload" },
    { id: "library", label: "My media" },
    { id: "brand", label: "Brand library" },
    { id: "link", label: "Paste link" },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--dx-radius-lg)] border"
        style={{ backgroundColor: "var(--dx-surface-1)", borderColor: "var(--dx-border-subtle)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--dx-border-subtle)" }}>
          <h3 className="text-sm font-semibold text-[var(--dx-text-primary)]">{title}</h3>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-1 border-b px-3 py-2" style={{ borderColor: "var(--dx-border-subtle)" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "true" : undefined}
              className={`rounded-md px-3 py-1.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--dx-focus)] ${
                tab === t.id
                  ? "bg-[var(--dx-active)] text-[var(--dx-text-primary)]"
                  : "text-[var(--dx-text-secondary)] hover:bg-[var(--dx-hover)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {tab === "upload" && (
            <div
              className="flex flex-col items-center justify-center rounded-[var(--dx-radius-md)] border border-dashed p-10 text-center"
              style={{ borderColor: "var(--dx-border)" }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void upload(f);
              }}
            >
              <Upload className="mb-3 h-7 w-7 text-[var(--dx-text-muted)]" />
              <p className="text-sm text-[var(--dx-text-primary)]">Drop an image here, or choose a file</p>
              <p className="mt-1 text-xs text-[var(--dx-text-muted)]">JPG, PNG or WebP · up to 10MB</p>
              <input
                ref={fileRef}
                type="file"
                accept={accept === "image" ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf"}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }}
              />
              <Button type="button" className="mt-4" disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Choose file
              </Button>
            </div>
          )}

          {tab === "library" && (
            media.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--dx-text-muted)]">
                Nothing uploaded yet. Anything you upload here is reusable across your workspace.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {media.map((m) => (
                  <button
                    key={m.assetId}
                    type="button"
                    onClick={() => { onSelect(m.url); onClose(); }}
                    className="group overflow-hidden rounded-[var(--dx-radius-md)] border outline-none transition-colors hover:bg-[var(--dx-hover)] focus-visible:ring-2 focus-visible:ring-[var(--dx-focus)]"
                    style={{ borderColor: "var(--dx-border-subtle)" }}
                    title={m.filename}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.url} alt={m.filename} className="aspect-square w-full object-cover" />
                  </button>
                ))}
              </div>
            )
          )}

          {tab === "brand" && (
            brand.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--dx-text-muted)]">
                No approved brand assets yet. Approved images from your business profile appear here.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {brand.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => { onSelect(a.fileUrl); onClose(); }}
                    className="group overflow-hidden rounded-[var(--dx-radius-md)] border outline-none transition-colors hover:bg-[var(--dx-hover)] focus-visible:ring-2 focus-visible:ring-[var(--dx-focus)]"
                    style={{ borderColor: "var(--dx-border-subtle)" }}
                    title={a.classification ?? "brand asset"}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.fileUrl} alt={a.classification ?? "Brand asset"} className="aspect-square w-full object-cover" />
                  </button>
                ))}
              </div>
            )
          )}

          {tab === "link" && (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-[var(--dx-text-secondary)]" htmlFor="media-link">
                Image or video link
              </label>
              <input
                id="media-link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://… or a YouTube/Vimeo link"
                className="w-full rounded-[var(--dx-radius-md)] border bg-transparent px-3 py-2 text-sm text-[var(--dx-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--dx-focus)]"
                style={{ borderColor: "var(--dx-border)" }}
              />
              <p className="text-xs text-[var(--dx-text-muted)]">
                Paste a normal YouTube or Vimeo link — we&apos;ll turn it into an embed for you.
              </p>
              <Button
                type="button"
                disabled={!link.trim()}
                onClick={() => { onSelect(link.trim()); onClose(); }}
              >
                <Link2 className="mr-2 h-4 w-4" />
                Use this link
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t px-5 py-3 text-xs text-[var(--dx-text-muted)]" style={{ borderColor: "var(--dx-border-subtle)" }}>
          <ImageIcon className="h-3.5 w-3.5" />
          Uploads are saved to your workspace and reusable anywhere in DivineX.
        </div>
      </div>
    </div>
  );
}
