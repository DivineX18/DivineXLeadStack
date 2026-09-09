import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResolvedBrand } from "@/config/landing";
import type { PlanProduct } from "@/types/billing";

/**
 * Unified is not Flow with an extra feature. It is bought for a different
 * reason — the diagnosis that decides what to execute — so it gets its own
 * promise here rather than inheriting Flow's. Deliberately NOT led with "AI
 * Growth Operating System": the AI is the mechanism, not the thing a business
 * is trying to buy. No performance claims, because none are substantiated.
 */
const UNIFIED_COPY = {
  eyebrow: "Ascend intelligence, Flow execution",
  headLead: "Know what to do next.",
  headAccent: "Get it done",
  sub: "Most platforms start with whatever you feel like building. Ascend starts with what your business actually needs — it scans your site, names the constraint costing you leads, and ranks the fix. Zeno turns that into the pages, campaigns and follow-up, and Flow runs them.",
} as const;

export function Hero({
  brand,
  product = "flow",
}: {
  brand: ResolvedBrand;
  product?: PlanProduct;
}) {
  const unified = product === "unified";
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
          <div className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-xs font-medium">
            <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
            <span className="bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 bg-clip-text text-transparent">
              {unified ? UNIFIED_COPY.eyebrow : brand.tagline}
            </span>
          </div>

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

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {/* Primary CTA is the self-serve path (jumps straight to the
                actual pricing/checkout decision) — previously the hero's
                only CTA was the sales-assisted mailto, competing for
                attention with the pricing section's own "Get started"
                buttons and the navbar's "Sign Up" further down the same
                page. One clear primary action; "Talk to us" stays as the
                secondary path for anyone who wants to ask before buying. */}
            <Button
              render={<a href="#pricing" />}
              size="lg"
              className="px-6 text-base"
            >
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
        </div>
      </div>
    </section>
  );
}
