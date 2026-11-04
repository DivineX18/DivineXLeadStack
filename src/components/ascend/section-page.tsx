import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/divinex/ui";
import { orderAscendBands, type AscendBandRole } from "@/lib/shell/ascend-section-bands";

/**
 * The composition shell for an Ascend lifecycle section page.
 *
 * WHY THIS EXISTS. The North Star's Priority 2 complaint is that the
 * unified shell "works technically but still feels like Flow wrapped
 * inside Ascend", and its remedy is an ORDER: every page should carry
 * context, insights, recent activity, quick actions, recommendations and
 * progress BEFORE the execution tools, because "execution should support
 * the experience; it should not become the experience."
 *
 * Nothing enforced that order. Home had already been composed this way by
 * hand and reads well; every other section improvised its own layout from
 * the same card primitives, and /agents ended up as fourteen lines
 * wrapping a Flow page, opening straight into a channel grid. Audited on
 * production, /create had no recent-projects band at all (the North Star
 * names that example specifically) and /performance rendered zero h2/h3 of
 * any kind, so the densest page in the product gave a screen reader one
 * heading and no structure.
 *
 * This is an EXTRACTION of what Home already does, not a new design
 * system: the container width, PageHeader, the uppercase eyebrow heading
 * and the band spacing are Home's, lifted so the other sections can share
 * them instead of re-deriving them. The cards that go inside bands are the
 * existing ones in this folder.
 *
 * ORDER IS NOT THE AUTHOR'S TO GET WRONG. Bands are declared as data and
 * rendered in canonical order by orderAscendBands() (lib/shell/
 * ascend-section-bands.ts, where the vocabulary and the rule live so they
 * can be unit-tested), so a page that lists its execution band first still
 * renders it last.
 */

export type { AscendBandRole } from "@/lib/shell/ascend-section-bands";

export interface AscendBand {
  role: AscendBandRole;
  /**
   * The eyebrow heading. Rendered as a real <h2>, which is the point:
   * /performance styled its band labels as divs, so the whole page had
   * exactly one heading and a screen reader got no structure at all. Omit
   * it only for a lead band that needs no label above it, the way Home's
   * first row carries none.
   */
  label?: string;
  /** Optional "see all" affordance on the right of the eyebrow row. */
  href?: string;
  hrefLabel?: string;
  content: ReactNode;
}

/** Home's eyebrow treatment, lifted verbatim so bands match across sections. */
function BandHeading({ label, href, hrefLabel }: { label: string; href?: string; hrefLabel?: string }) {
  const heading = (
    <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dx-text-muted)" }}>
      {label}
    </h2>
  );
  if (!href) return <div className="mb-3">{heading}</div>;
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      {heading}
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-xs font-medium"
        style={{ color: "var(--dx-primary)" }}
      >
        {hrefLabel ?? "See all"} <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

/**
 * The "Ask Zeno" action every section header carries. Shell-relative on
 * purpose: these pages only ever render inside the Ascend shell, where
 * /zeno is Zeno. (On the Flow host a bare /zeno is NOT Zeno -- it falls
 * through to a legacy stub that redirects to the caller's first
 * membership, which is how "Continue with Zeno" once landed operators in
 * another workspace entirely.)
 */
export function AskZenoAction({ href = "/zeno", label = "Ask Zeno" }: { href?: string; label?: string }) {
  return (
    <Link
      href={href}
      className="dx-primary-action inline-flex items-center gap-2 rounded-[var(--dx-radius)] px-4 py-2.5 text-sm font-semibold"
    >
      <Sparkles className="h-4 w-4" />
      {label}
    </Link>
  );
}

export function AscendSectionPage({
  title,
  description,
  action,
  bands,
}: {
  title: string;
  description?: string;
  /** Defaults to Ask Zeno. Pass null for a section that should carry none. */
  action?: ReactNode | null;
  bands: AscendBand[];
}) {
  const ordered = orderAscendBands(bands);
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title={title}
        description={description}
        action={action === null ? undefined : (action ?? <AskZenoAction />)}
      />
      {ordered.map((band, i) => (
        // The first band sits directly under the header, as Home's lead row
        // does; the rest get Home's band rhythm.
        <section key={`${band.role}-${i}`} className={i === 0 ? undefined : "mt-8"}>
          {band.label && <BandHeading label={band.label} href={band.href} hrefLabel={band.hrefLabel} />}
          {band.content}
        </section>
      ))}
    </div>
  );
}
