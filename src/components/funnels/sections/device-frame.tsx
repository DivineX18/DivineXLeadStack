/**
 * Reusable device-frame presentation shell — Phase 2's "SaaS -> dashboard
 * or browser mockup" hero intelligence. Accepts a real screenshot/video
 * (via `mediaUrl`) or falls back to a labeled placeholder — never a
 * fabricated fake dashboard. Responsive: the frame chrome shrinks on
 * mobile rather than dominating the viewport.
 */
export function DeviceFrame({
  kind,
  mediaUrl,
  mediaType = "image",
  placeholderLabel,
  accentColor,
}: {
  kind: "browser" | "phone";
  mediaUrl?: string;
  mediaType?: "image" | "video";
  placeholderLabel?: string;
  accentColor: string;
}) {
  const content = mediaUrl ? (
    mediaType === "video" ? (
      <iframe
        src={mediaUrl}
        className="h-full w-full"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={mediaUrl} alt="" className="h-full w-full object-cover object-top" />
    )
  ) : (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-2 border-2 border-dashed text-center text-xs font-semibold opacity-60"
      style={{ borderColor: `${accentColor}55`, color: accentColor }}
    >
      <span>{placeholderLabel || "Add a screenshot"}</span>
    </div>
  );

  if (kind === "phone") {
    return (
      <div className="mx-auto w-full max-w-[220px] sm:max-w-[260px]">
        <div className="rounded-[2rem] border-[6px] border-neutral-900 bg-neutral-900 p-1 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.4)] dark:border-neutral-700">
          <div className="aspect-[9/19] w-full overflow-hidden rounded-[1.5rem] bg-[var(--frame-bg)]" style={{ "--frame-bg": "Canvas" } as React.CSSProperties}>
            {content}
          </div>
        </div>
      </div>
    );
  }

  // "browser" — a chrome bar (three dots, no fake URL text so nothing
  // reads as a fabricated real address) above the screenshot area.
  return (
    <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-xl border shadow-[0_20px_60px_-15px_rgba(0,0,0,0.35)] ring-1 ring-black/5 dark:ring-white/10">
      <div className="flex items-center gap-1.5 border-b bg-[var(--chrome-bg)] px-3 py-2" style={{ "--chrome-bg": "color-mix(in oklab, currentColor 4%, transparent)" } as React.CSSProperties}>
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
      </div>
      <div className="aspect-[16/10] w-full bg-[var(--frame-bg)]" style={{ "--frame-bg": "Canvas" } as React.CSSProperties}>
        {content}
      </div>
    </div>
  );
}
