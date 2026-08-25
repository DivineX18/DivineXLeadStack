/**
 * Media slot Zeno decided the page should have (per its archetype/media
 * strategy) but has no real asset for. Renders an INTENTIONAL designed visual
 * — a gradient panel (rect) or gradient orb (circle) with an icon — instead of
 * a dashed "empty box", so a funnel looks finished/premium even before the
 * operator drops in a real photo. Still honest: the rect keeps a small label
 * caption ("Add founder photo") so it's obvious what to replace, and it never
 * fabricates stock imagery (see CLAUDE.md's anti-fabrication rules).
 */
export function MediaPlaceholder({
  label,
  accentColor,
  shape = "rect",
  className,
}: {
  label: string;
  accentColor: string;
  shape?: "rect" | "circle";
  className?: string;
}) {
  const isCircle = shape === "circle";
  return (
    <div
      className={`group relative flex items-center justify-center overflow-hidden ${
        isCircle ? "rounded-full" : ""
      } ${className ?? ""}`}
      style={{
        background: isCircle
          ? `radial-gradient(120% 120% at 30% 20%, ${accentColor}, ${accentColor}99 62%, ${accentColor}55)`
          : `radial-gradient(120% 120% at 18% 8%, ${accentColor}38, transparent 55%), radial-gradient(120% 120% at 92% 94%, ${accentColor}26, transparent 55%), linear-gradient(135deg, #12151c, #0b0d12)`,
        boxShadow: isCircle
          ? "inset 0 1px 0 rgba(255,255,255,0.28)"
          : "inset 0 1px 0 rgba(255,255,255,0.06)",
        ...(isCircle ? {} : { borderRadius: "var(--flow-radius, 0.75rem)" }),
      }}
    >
      {/* Subtle diagonal weave — reads as an intentional textured panel, not empty. */}
      {!isCircle && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(115deg, rgba(255,255,255,0.035) 0 2px, transparent 2px 22px)",
          }}
        />
      )}
      <div className="relative flex flex-col items-center gap-2 px-3 text-center">
        <span
          className="flex items-center justify-center rounded-full shadow-lg"
          style={{
            width: isCircle ? "36%" : "2.75rem",
            height: isCircle ? "36%" : "2.75rem",
            backgroundColor: isCircle ? "rgba(255,255,255,0.22)" : accentColor,
            color: "#fff",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        </span>
        {!isCircle && (
          <span
            className="text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: "rgba(255,255,255,0.72)" }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
