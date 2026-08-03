/**
 * Honest labeled placeholder for a media slot Zeno decided the page should
 * have (per its archetype/media strategy) but has no real asset for —
 * "Add founder photo" instead of silently rendering nothing OR fabricating
 * a stock image. Easy to spot and replace in the builder (see CLAUDE.md's
 * anti-fabrication rules — never generic stock imagery auto-inserted).
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
  return (
    <div
      className={`flex items-center justify-center gap-2 border-2 border-dashed text-center text-xs font-semibold opacity-60 ${
        shape === "circle" ? "rounded-full" : ""
      } ${className ?? ""}`}
      style={{
        borderColor: `${accentColor}55`,
        color: accentColor,
        ...(shape === "circle" ? {} : { borderRadius: "var(--flow-radius, 0.75rem)" }),
      }}
    >
      <span className="px-2">{label}</span>
    </div>
  );
}
