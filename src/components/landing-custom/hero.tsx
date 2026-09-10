import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResolvedBrand } from "@/config/landing";
import type { PlanProduct, PublicPlanSummary } from "@/types/billing";
import { HeroCtas } from "./hero-ctas";
import { AscendHeroDemo } from "./ascend-hero-demo";

/**
 * Unified is not Flow with an extra feature. It is bought for a different
 * reason — the diagnosis that decides what to execute — so it gets its own
 * promise here rather than inheriting Flow's. Deliberately NOT led with "AI
 * Growth Operating System": the AI is the mechanism, not the thing a business
 * is trying to buy. No performance claims, because none are substantiated.
 */
const UNIFIED_COPY = {
  headLead: "Turn more of your traffic",
  headAccent: "into leads",
  sub: "Ascend finds what's costing you leads, helps create the fix, and gives you the tools to turn more opportunities into customers.",
  trust: "14 days free. Card required. Cancel anytime.",
  authority:
    "Built and calibrated using insights from 150+ real-world website analyses and established CRO/UX principles.",
} as const;

export function Hero({
  brand,
  product = "flow",
  plans = [],
  scanHref = "/growth-scanner",
}: {
  brand: ResolvedBrand;
  product?: PlanProduct;
  plans?: PublicPlanSummary[];
  scanHref?: string;
}) {
  const unified = product === "unified";
  // The trial tier is whichever plan actually carries trial days. Reading it
  // from the live plan data rather than hardcoding an id keeps the hero honest
  // if the trial ever moves tiers, and makes the button disappear rather than
  // promise a trial that no plan offers.
  const trialPlanId = plans.find((p) => (p.trialDays ?? 0) > 0)?.id ?? null;
  return (
    <section className="relative overflow-hidden py-20 md:py-28">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,oklch(0.72_0.16_165)_/_18%,transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom_left,oklch(0.74_0.13_185)_/_14%,transparent_55%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[1px] bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />

      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          {/* No eyebrow on Ascend. A category label above the headline (an
              "AI ..." one especially) makes the visitor learn what we are
              before they learn what they get, and the technology will change
              long before the promise does. Flow keeps its tagline. */}
          {!unified && (
            <div className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
              <span className="bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 bg-clip-text text-transparent">
                {brand.tagline}
              </span>
            </div>
          )}

          <h1 className="text-balance text-4xl font-semibold tracking-tighter sm:text-5xl md:text-6xl lg:text-[5rem] lg:leading-[1.04]">
            {unified ? UNIFIED_COPY.headLead : "Run your business."}{" "}
            <span className="inline-block bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 bg-clip-text pr-1 font-serif font-normal text-transparent">
              {unified ? UNIFIED_COPY.headAccent : "Amplify your impact"}
            </span>
            .
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground md:text-xl">
            {unified ? UNIFIED_COPY.sub : brand.shortDescription}
          </p>

          {unified ? (
            <>
              <HeroCtas trialPlanId={trialPlanId} scanHref={scanHref} />
              {/* The card is the friction, so it is named here rather than
                  discovered on the Stripe page. Saying it plainly is what
                  lets the scan read as a real alternative. */}
              <p className="mt-4 text-sm text-muted-foreground">{UNIFIED_COPY.trust}</p>
              <p className="mx-auto mt-6 max-w-xl text-xs leading-relaxed text-muted-foreground/80">
                {UNIFIED_COPY.authority}
              </p>
            </>
          ) : (
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button render={<a href="#pricing" />} size="lg" className="px-6 text-base">
                Get started
              </Button>
              <Button
                render={<a href={`mailto:${brand.supportEmail}`} />}
                variant="outline"
                size="lg"
                className="px-6 text-base"
              >
                Talk to us
              </Button>
            </div>
          )}
        </div>

        {unified && <AscendHeroDemo />}
      </div>
    </section>
  );
}
