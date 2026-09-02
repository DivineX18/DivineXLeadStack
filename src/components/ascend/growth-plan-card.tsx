import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, Camera, Globe } from "lucide-react";
import { AscendCardShell } from "@/components/ascend/card-shell";
import type { GrowthPlanItem, PlanStage } from "@/lib/intelligence/growth-plan-execution";

/**
 * GROWTH PLAN — the execution half, on Home (P0.6 Phase 3).
 *
 * Home already answered "what should I do next" via the recommendation card.
 * This answers the three questions it could not: what has been built, what
 * needs my review, and what happens next for work underway — so a customer
 * never has to reconstruct that from chat history or the Create library.
 *
 * Customer nouns only. No capability names, no ids, no orchestration
 * terminology (U1 applies to every customer surface, not just chat).
 */

const STAGE_ICON: Record<PlanStage, React.ReactNode> = {
  needs_you: <Camera className="w-3.5 h-3.5" />,
  in_progress: <Clock className="w-3.5 h-3.5" />,
  live: <Globe className="w-3.5 h-3.5" />,
  inactive: <CheckCircle2 className="w-3.5 h-3.5" />,
};

const STAGE_TONE: Record<PlanStage, string> = {
  needs_you: "text-amber-500 dark:text-amber-400",
  in_progress: "text-sky-500 dark:text-sky-400",
  live: "text-emerald-500 dark:text-emerald-400",
  inactive: "text-muted-foreground",
};

export function GrowthPlanCard({ items }: { items: GrowthPlanItem[] }) {
  if (items.length === 0) {
    return (
      <AscendCardShell title="Your growth plan">
        <p className="text-sm text-muted-foreground">
          Nothing built yet. Ask Zeno to build your first landing page and it will appear here with
          everything you need to review before it goes anywhere.
        </p>
      </AscendCardShell>
    );
  }

  const needsYou = items.filter((i) => i.stage === "needs_you").length;

  return (
    <AscendCardShell title="Your growth plan">
      <p className="mb-3 text-xs text-muted-foreground">
        {needsYou > 0
          ? `${needsYou} thing${needsYou === 1 ? "" : "s"} waiting on you.`
          : "Everything is up to date."}
      </p>
      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.artifactId}
            className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={STAGE_TONE[item.stage]}>{STAGE_ICON[item.stage]}</span>
                <span className="text-sm font-medium truncate">{item.name}</span>
              </div>
              <p className={`mt-0.5 text-xs ${STAGE_TONE[item.stage]}`}>
                {item.kind} · {item.stateLabel}
              </p>
              {item.reviewNotes.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {item.reviewNotes.map((n) => (
                    <li key={n} className="text-[11.5px] text-muted-foreground">
                      {n}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* DRAFT PREVIEW LAW: an unpublished artifact must still be
                inspectable. The destination is the canonical preview route,
                which re-checks tenancy server-side. */}
            <Link
              href={item.nextAction.href}
              className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
            >
              {item.nextAction.label} <ArrowRight className="w-3 h-3" />
            </Link>
          </li>
        ))}
      </ul>
    </AscendCardShell>
  );
}
