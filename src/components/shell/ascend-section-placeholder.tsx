interface AscendSectionPlaceholderLink {
  label: string;
  href: string;
}

interface AscendSectionPlaceholderProps {
  title: string;
  description: string;
  links: AscendSectionPlaceholderLink[];
}

/**
 * Ascend OS Phase 2, Slice 8 — shared shell for each lifecycle section's
 * placeholder page. Deliberately not the final screen for any section
 * (Home/Identify/Create/Launch/Grow/Optimize/Scale native UI is Slice 9+
 * work) — this only proves stable routing from the new Ascend frame into
 * Flow's existing, unmodified functionality.
 */
export function AscendSectionPlaceholder({ title, description, links }: AscendSectionPlaceholderProps) {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
      <p className="mt-2 text-white/60">{description}</p>
      {links.length > 0 && (
        <div className="mt-6 flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-white/40">Continue in your workspace</p>
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md border border-white/10 px-4 py-3 text-sm text-white/80 transition-colors hover:bg-white/5 hover:text-white"
            >
              {link.label} →
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
