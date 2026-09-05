"use client";

import { useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MediaPicker } from "@/components/media/media-picker";
import { normalizeVideoUrl } from "@/lib/funnels/video-url";

/**
 * The media input every section field uses.
 *
 * Before this, each media field was a bare URL box — which quietly required
 * the customer to go host the file somewhere else first. Upload is now the
 * primary action and the URL box is the fallback, not the other way round.
 *
 * One component rather than seven hand-edited call sites: hero media, product
 * image, story portrait, team photo, image+text block and gallery all behave
 * identically, and a future change (stock, generation) lands in one place.
 */
export function MediaField({
  saId,
  funnelId,
  value,
  onChange,
  label = "Choose image",
  showPreview = true,
}: {
  saId: string;
  funnelId?: string;
  value: string;
  onChange: (url: string) => void;
  label?: string;
  showPreview?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Upload, choose from your media, or paste a link"
          className="h-9 flex-1"
        />
        <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setOpen(true)}>
          <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
          {label}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            aria-label="Remove image"
            onClick={() => onChange("")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {showPreview && value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt=""
          className="h-20 w-auto rounded-md border object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      )}
      <MediaPicker
        saId={saId}
        funnelId={funnelId}
        open={open}
        onClose={() => setOpen(false)}
        onSelect={onChange}
      />
    </div>
  );
}

/**
 * Video link input.
 *
 * Customers paste whatever is in their address bar; asking them to hand-build
 * an /embed/ URL is a support ticket, not a product. The raw text stays exactly
 * as typed while editing (so the field doesn't fight the cursor) and is
 * normalised on blur, with the recognised provider shown back as confirmation.
 */
export function VideoField({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [note, setNote] = useState<string | null>(null);

  function commit(raw: string) {
    const result = normalizeVideoUrl(raw);
    if (!result) {
      onChange("");
      setNote(null);
      return;
    }
    onChange(result.embedUrl);
    setDraft(result.embedUrl);
    setNote(
      result.provider === "youtube"
        ? "YouTube link recognised."
        : result.provider === "vimeo"
          ? "Vimeo link recognised."
          : "Using this link as-is — it must be embeddable.",
    );
  }

  return (
    <div className="space-y-1">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        placeholder="Paste a YouTube or Vimeo link"
        className="h-9"
      />
      <p className="text-xs text-muted-foreground">
        {note ?? "Paste the normal link from your browser — we'll turn it into an embed."}
      </p>
    </div>
  );
}
