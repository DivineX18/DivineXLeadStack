import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AscendCardShell } from "@/components/ascend/card-shell";
import { IntelligenceStatusBadge } from "@/components/ascend/intelligence-status-badge";
import { FixWithZenoButton } from "@/components/ascend/fix-with-zeno-button";
import type { WithMeta, CroAuditRecommendation } from "@/types/intelligence";

/**
 * QA BUG-001 — Home's ONLY first-run guidance was one line of plain text
 * ("Run a Growth Scan or CRO Audit from Intelligence") in the one spot the
 * page already knows there's nothing better to show (no recommendation
 * yet). It named Intelligence alone; a customer who hasn't built anything
 * had no pointer to Create (websites/funnels/assets) or Leads (CRM), and
 * nothing here was a real clickable action. This is the lightweight fix —
 * four short links to the product's own real top-level destinations
 * (reusing the exact nav structure build-shell-navigation.ts already
 * defines: Create absorbs websites/funnels/assets, Leads absorbs CRM —
 * there is no second nav model here), not a new wizard or onboarding flow.
 *
 * RETEST FAIL (Bitrupt, 2026-10-28): "No sort of onboarding guide or step
 * guide showing user how to navigate through the basic core modules." The
 * original fix only rendered these links in the EMPTY branch below — the
 * moment any CRO Audit recommendation exists (true for almost any account
 * that has done anything, including a QA tester's own test account), the
 * card shows that recommendation instead and the links vanish entirely.
 * The complaint was never about the empty state specifically, it was "I
 * don't know where the core modules are" — true regardless of whether
 * Intelligence has a recommendation. Fixed by rendering QuickStartLinks
 * unconditionally, always below the recommendation (or the empty-state
 * line) rather than instead of it, so wayfinding is visible on every visit
 * to Home, not just a brand-new, zero-data one. */
const QUICK_START_LINKS: { label: string; description: string; href: string }[] = [
  { label: "Ask Zeno", description: "Describe what you want built, in plain language.", href: "/zeno" },
  { label: "Run a Growth Scan", description: "See what Intelligence already knows, or scan your site.", href: "/intelligence" },
  { label: "Build something", description: "Websites, funnels, and marketing assets.", href: "/create" },
  { label: "Your contacts", description: "Leads, pipeline, and follow-up.", href: "/leads" },
];

function QuickStartLinks() {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {QUICK_START_LINKS.map((q) => (
        <Link
          key={q.href}
          href={q.href}
          className="group flex items-center justify-between gap-2 rounded-lg border border-[var(--dx-border-subtle)] px-3 py-2.5 transition-colors hover:bg-[var(--dx-hover)]"
        >
          <span>
            <span className="block text-sm font-medium text-[var(--dx-text-primary)]">{q.label}</span>
            <span className="block text-xs text-[var(--dx-text-muted)]">{q.description}</span>
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--dx-text-muted)] transition-transform group-hover:translate-x-0.5" />
        </Link>
      ))}
    </div>
  );
}

/**
 * Corrected Slice 10.5: sourced from the real `croAuditEngine.ts`
 * `CroAuditRecommendation` shape — Title-cased `impact`/`difficulty`, the
 * fix text lives in `fix` (not `title`), there is no standalone `id` (a
 * recommendation is identified by its position within an audit, not a
 * row of its own), and `categoryLabel` replaces the invented `category`
 * field. Replaces Slice 9's guessed `Recommendation` shape.
 */
const IMPACT_TONE: Record<CroAuditRecommendation["impact"], string> = {
  High: "text-emerald-400",
  Medium: "text-amber-400",
  Low: "text-[var(--dx-text-muted)]",
};

function RecommendationRow({ rec }: { rec: CroAuditRecommendation }) {
  return (
    <li className="rounded-lg border border-[var(--dx-border-subtle)] px-3 py-2.5">
      <p className="text-sm text-[var(--dx-text-primary)]/85">{rec.fix}</p>
      <p className="mt-1 text-xs text-[var(--dx-text-muted)]">
        <span className={IMPACT_TONE[rec.impact]}>{rec.impact} impact</span> · {rec.difficulty} effort · {rec.categoryLabel}
      </p>
      {/* The loop's missing edge: diagnosis you can act on without retyping it. */}
      <FixWithZenoButton fix={rec.fix} category={rec.categoryLabel} impact={rec.impact} source={rec.source} />
    </li>
  );
}

/** Home's single "highest priority" card — one recommendation, already
 *  ranked by derive-next-action.ts. */
export function RecommendedNextActionCard({
  action,
  meta,
}: {
  action: CroAuditRecommendation | null;
  meta: WithMeta<CroAuditRecommendation[]>["meta"];
}) {
  return (
    <AscendCardShell title="Recommended Next Step" action={<IntelligenceStatusBadge meta={meta} />}>
      <div className="space-y-3">
        {action ? (
          <RecommendationRow rec={action} />
        ) : (
          <p className="text-sm text-[var(--dx-text-muted)]">
            Nothing to recommend yet, there&apos;s not enough here for Intelligence to work from.
          </p>
        )}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--dx-text-muted)]">
            Quick start
          </p>
          <QuickStartLinks />
        </div>
      </div>
    </AscendCardShell>
  );
}

/** Identify's full recommendations list — the newest CRO audit's
 *  recommendations, composed by resolve-intelligence-snapshot.ts. */
export function RecommendationsListCard({ recommendations }: { recommendations: WithMeta<CroAuditRecommendation[]> }) {
  const items = recommendations.data ?? [];
  return (
    <AscendCardShell title="Recommendations" action={<IntelligenceStatusBadge meta={recommendations.meta} />}>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((rec, i) => (
            <RecommendationRow key={`${rec.categoryKey}-${i}`} rec={rec} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--dx-text-muted)]">
          {recommendations.meta.status === "unavailable" ? "Unavailable right now." : "No recommendations yet. Run a CRO Audit to generate some."}
        </p>
      )}
    </AscendCardShell>
  );
}
